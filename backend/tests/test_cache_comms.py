"""Unit and integration tests for Upstash Redis AR comms telemetry publishing.

Covers:
- NullCache safe fallback behavior
- UpstashCache publishing logic, commands, TTL, and channel publication
- Exception resilience and fault tolerance (socket timeout, 5xx errors)
- Schema formatting and validation for AR telemetry payloads
- Flask route /comms/publish (POST and GET, query/body overrides, resilience)
"""

from __future__ import annotations

import http.client
import json
import os
from typing import Any, Dict, List, Optional, Tuple

import pytest

from marswalk_api import create_app
from marswalk_api.cache import NullCache, UpstashCache, get_cache, publish_ar_comms, set_cache
from marswalk_api.comms import format_ar_comms_payload, link_payload, passes_payload
from marswalk_api.config import DEFAULT_RELAYS, Relay, Scenario


class FakeHTTPResponse:
    def __init__(self, status: int, data: dict):
        self.status = status
        self._body = json.dumps(data).encode("utf-8")

    def read(self) -> bytes:
        return self._body


class FakeRedisStore:
    def __init__(self):
        self.kv: Dict[str, dict] = {}
        self.published: List[Tuple[str, str]] = []
        self.recorded_commands: List[List[str]] = []
        self.fail_attempts: int = 0
        self.fail_status: Optional[int] = None

    def execute(self, cmd_args: List[str]) -> Any:
        if not cmd_args:
            return None
        self.recorded_commands.append(cmd_args)
        cmd = cmd_args[0].upper()
        if cmd == "SET":
            key = cmd_args[1]
            val = cmd_args[2]
            ttl = int(cmd_args[4]) if len(cmd_args) >= 5 and cmd_args[3].upper() == "EX" else None
            self.kv[key] = {"value": val, "ttl": ttl}
            return "OK"
        elif cmd == "GET":
            key = cmd_args[1]
            entry = self.kv.get(key)
            return entry["value"] if entry else None
        elif cmd == "PUBLISH":
            channel = cmd_args[1]
            msg = cmd_args[2]
            self.published.append((channel, msg))
            return 1
        elif cmd == "DEL":
            keys = cmd_args[1:]
            deleted = sum(1 for k in keys if self.kv.pop(k, None) is not None)
            return deleted
        return None


class FakeHTTPConnection:
    def __init__(self, host: str, port: Optional[int] = None, timeout: float = 3.0, store: Optional[FakeRedisStore] = None):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.store = store or FakeRedisStore()
        self._last_resp: Optional[FakeHTTPResponse] = None
        self.closed = False

    def request(self, method: str, url: str, body: Optional[str] = None, headers: Optional[dict] = None):
        if self.store.fail_attempts > 0:
            self.store.fail_attempts -= 1
            if self.store.fail_status:
                self._last_resp = FakeHTTPResponse(self.store.fail_status, {"error": f"HTTP {self.store.fail_status}"})
                return
            else:
                raise OSError("Simulated socket error")

        parsed_body = json.loads(body) if body else []
        result = self.store.execute(parsed_body)
        self._last_resp = FakeHTTPResponse(200, {"result": result})

    def getresponse(self) -> FakeHTTPResponse:
        assert self._last_resp is not None
        return self._last_resp

    def close(self):
        self.closed = True


@pytest.fixture
def fake_redis() -> FakeRedisStore:
    return FakeRedisStore()


@pytest.fixture
def mock_cache(fake_redis: FakeRedisStore, monkeypatch) -> UpstashCache:
    def fake_conn_factory(host: str, port: Optional[int] = None, timeout: float = 3.0):
        return FakeHTTPConnection(host, port=port, timeout=timeout, store=fake_redis)

    monkeypatch.setattr(http.client, "HTTPSConnection", fake_conn_factory)
    monkeypatch.setattr(http.client, "HTTPConnection", fake_conn_factory)

    cache = UpstashCache("https://fake-upstash-test.io", "fake_token_test")
    return cache


@pytest.fixture
def app_client():
    app = create_app({"TESTING": True, "SERVE_DIST": False})
    return app.test_client()


def test_null_cache_publish_ar_comms():
    """NullCache handles publish_ar_comms cleanly without exceptions."""
    nc = NullCache()
    res = nc.publish_ar_comms({"test": "data"}, ttl_s=600)
    assert res == {
        "published": False,
        "configured": False,
        "error": None,
        "keys": [],
    }


def test_upstash_cache_publish_ar_comms_success(mock_cache: UpstashCache, fake_redis: FakeRedisStore):
    """UpstashCache publishes AR telemetry and passes with TTL and PubSub."""
    scn = Scenario()
    passes = passes_payload(scn)
    link = link_payload(scn)
    ar_payload = format_ar_comms_payload(scn, passes, link, timestamp=1731681600)

    res = mock_cache.publish_ar_comms(ar_payload, passes_payload=passes, ttl_s=1800)

    assert res["published"] is True
    assert res["configured"] is True
    assert res["error"] is None
    assert set(res["keys"]) == {"marswalk:ar:comms", "marswalk:comms:passes"}

    # Verify keys in fake Redis store
    assert "marswalk:ar:comms" in fake_redis.kv
    assert fake_redis.kv["marswalk:ar:comms"]["ttl"] == 1800
    stored_ar = json.loads(fake_redis.kv["marswalk:ar:comms"]["value"])
    assert stored_ar["constellation"] == "MRS"
    assert stored_ar["link_budget"]["delta_atmos_db"] < 0

    assert "marswalk:comms:passes" in fake_redis.kv
    assert fake_redis.kv["marswalk:comms:passes"]["ttl"] == 1800

    # Verify PubSub publication
    assert len(fake_redis.published) == 1
    assert fake_redis.published[0][0] == "marswalk:comms:passes"


def test_upstash_cache_publish_ar_comms_network_error(mock_cache: UpstashCache, fake_redis: FakeRedisStore):
    """UpstashCache handles network errors gracefully without crashing caller."""
    fake_redis.fail_attempts = 2  # Fail both attempt 0 and retry attempt 1
    fake_redis.fail_status = None  # Causes OSError

    res = mock_cache.publish_ar_comms({"some": "telemetry"})
    assert res["published"] is False
    assert res["configured"] is True
    assert res["error"] is not None
    assert "Simulated socket error" in res["error"]


def test_upstash_cache_publish_ar_comms_http_500_error(mock_cache: UpstashCache, fake_redis: FakeRedisStore):
    """UpstashCache handles upstream HTTP 500 error gracefully."""
    fake_redis.fail_attempts = 2
    fake_redis.fail_status = 500

    res = mock_cache.publish_ar_comms({"some": "telemetry"})
    assert res["published"] is False
    assert res["configured"] is True
    assert "500" in res["error"]


def test_format_ar_comms_payload_schema():
    """format_ar_comms_payload produces compliant schema with negative atmospheric delta."""
    scn = Scenario()
    payload = format_ar_comms_payload(scn)

    assert payload["constellation"] == "MRS"
    assert len(payload["relays"]) == len(DEFAULT_RELAYS)
    assert set(payload["link_budget"].keys()) == {
        "downlink_margin_db",
        "uplink_margin_db",
        "atmos_loss_db",
        "delta_atmos_db",
    }
    assert payload["link_budget"]["atmos_loss_db"] > 0
    assert payload["link_budget"]["delta_atmos_db"] < 0

    if payload["active_pass"] is not None:
        ap = payload["active_pass"]
        assert set(ap.keys()) >= {"relay_id", "aos", "los", "max_elevation_deg", "track"}
        for pt in ap["track"]:
            assert set(pt.keys()) >= {"time_s", "azimuth_deg", "elevation_deg", "uplink_margin_db", "atmos_loss_db"}


def test_comms_publish_route_with_null_cache(app_client, monkeypatch):
    """POST /comms/publish returns HTTP 200 with status info even when cache is unconfigured."""
    monkeypatch.setattr("marswalk_api.cache.get_cache", lambda: NullCache())

    resp = app_client.post("/comms/publish")
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["status"] == "ok"
    assert data["published"] is False
    assert data["configured"] is False
    assert "payload" in data
    assert data["payload"]["constellation"] == "MRS"


def test_comms_publish_route_with_mock_upstash(app_client, mock_cache: UpstashCache, fake_redis: FakeRedisStore, monkeypatch):
    """POST /comms/publish publishes telemetry and returns HTTP 200 with published=True."""
    monkeypatch.setattr("marswalk_api.cache.get_cache", lambda: mock_cache)

    resp = app_client.post("/comms/publish")
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["status"] == "ok"
    assert data["published"] is True
    assert data["configured"] is True
    assert "marswalk:ar:comms" in fake_redis.kv


def test_comms_publish_route_with_query_and_json_overrides(app_client, mock_cache: UpstashCache, monkeypatch):
    """POST /comms/publish respects scenario overrides passed via query params or JSON body."""
    monkeypatch.setattr("marswalk_api.cache.get_cache", lambda: mock_cache)

    # 1. Query param overrides
    resp = app_client.post("/comms/publish?now=12.5&lat=10.0")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"

    # 2. JSON body overrides
    custom_relays = [
        {"id": "test_l1", "name": "Custom-1", "altitude_km": 500, "inclination_deg": 45, "raan_deg": 10, "arg_lat_deg": 20}
    ]
    resp2 = app_client.post("/comms/publish", json={"relays": custom_relays, "mode": "replace"})
    assert resp2.status_code == 200
    data2 = resp2.get_json()
    assert len(data2["payload"]["relays"]) == 1
    assert data2["payload"]["relays"][0]["id"] == "test_l1"


def test_comms_publish_route_get_method(app_client, mock_cache: UpstashCache, monkeypatch):
    """GET /comms/publish also works and publishes telemetry."""
    monkeypatch.setattr("marswalk_api.cache.get_cache", lambda: mock_cache)

    resp = app_client.get("/comms/publish")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert data["published"] is True


def test_comms_publish_route_malformed_json_returns_400(app_client):
    """POST /comms/publish with malformed JSON rejects with HTTP 400 Bad Request."""
    resp = app_client.post("/comms/publish", data="{bad", content_type="application/json")
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data
    assert "Malformed JSON body" in data["error"]

    # Also test truncated JSON payload
    resp2 = app_client.post("/comms/publish", data='{"relays": [bad_json', content_type="application/json")
    assert resp2.status_code == 400
    data2 = resp2.get_json()
    assert "error" in data2
    assert "Malformed JSON body" in data2["error"]


def test_comms_publish_route_non_dict_json_returns_400(app_client):
    """POST /comms/publish with non-dict JSON body rejects with HTTP 400 Bad Request."""
    # Array body
    resp = app_client.post("/comms/publish", data="[1, 2, 3]", content_type="application/json")
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data
    assert "JSON body must be an object" in data["error"]

    # Scalar JSON bodies
    for scalar in ["null", '"string"', "123", "true"]:
        resp_scalar = app_client.post("/comms/publish", data=scalar, content_type="application/json")
        assert resp_scalar.status_code == 400
        assert "JSON body must be an object" in resp_scalar.get_json()["error"]


def test_comms_publish_route_valid_and_empty_json_bodies(app_client, mock_cache: UpstashCache, monkeypatch):
    """POST /comms/publish accepts valid JSON bodies and empty/whitespace bodies gracefully."""
    monkeypatch.setattr("marswalk_api.cache.get_cache", lambda: mock_cache)

    # Empty body with application/json
    resp_empty = app_client.post("/comms/publish", data="", content_type="application/json")
    assert resp_empty.status_code == 200
    assert resp_empty.get_json()["status"] == "ok"

    # Whitespace body with application/json
    resp_ws = app_client.post("/comms/publish", data="   \n  \t ", content_type="application/json")
    assert resp_ws.status_code == 200
    assert resp_ws.get_json()["status"] == "ok"

    # Empty object body with application/json
    resp_obj = app_client.post("/comms/publish", data="{}", content_type="application/json")
    assert resp_obj.status_code == 200
    assert resp_obj.get_json()["status"] == "ok"

    # Valid JSON body with overrides
    resp_valid = app_client.post("/comms/publish", json={"now": 14.2, "lat": -15.0})
    assert resp_valid.status_code == 200
    assert resp_valid.get_json()["status"] == "ok"


def test_module_level_publish_ar_comms_delegation():
    """Module-level publish_ar_comms cleanly delegates to get_cache()."""
    class StubCache(NullCache):
        def __init__(self):
            self.called = False

        def publish_ar_comms(self, comms_payload: dict, passes_payload: dict | None = None, ttl_s: int = 3600) -> dict[str, Any]:
            self.called = True
            return {"published": True, "configured": True, "stub": True}

    stub = StubCache()
    set_cache(stub)
    try:
        res = publish_ar_comms({"test": 123})
        assert stub.called is True
        assert res.get("stub") is True
    finally:
        set_cache(None)
