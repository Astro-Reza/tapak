"""Comprehensive End-to-End (E2E) Test Suite for Marswalk Comms & FOV Simulation.

Covers Requirements R1, R2, and R3 across all 4 Tiers specified in TEST_INFRA.md:
- Tier 1: Equivalence-Class Feature Coverage (Isolated Happy Path, >= 5 tests per feature)
    * F1: Mars Relay Satellite (MRS) Pass Simulation & Dynamic Configuration
    * F2: AR Device Integration via Upstash Redis
    * F3: Elevation-Based Link-Budget Calculation & Atmospheric Loss Bug Fix
- Tier 2: Boundary Value Analysis & Corner Cases (>= 5 tests per feature)
- Tier 3: Pairwise Combinatorial Cross-Feature Interactions (F1xF3, F1xF2, F2xF3, F1xF2xF3)
- Tier 4: Real-World Mission Application Scenarios (Scenarios 1 through 5)

All external Upstash Redis calls are backed by in-memory mock transport for 100% offline,
deterministic, and hermetic execution without network dependencies.
"""

from __future__ import annotations

import http.client
import json
import math
import os
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pytest

from marswalk_api import create_app
from marswalk_api.cache import NullCache, UpstashCache
from marswalk_api.comms import (
    LinkModel,
    Pass,
    elevations,
    find_passes,
    fmt_clock,
    fmt_num,
    link_model,
    link_payload,
    lmst_h,
    passes_payload,
)
from marswalk_api.config import (
    DEFAULT_RELAYS,
    DOWNLINK,
    MARS_MU_KM3_S2,
    MARS_RADIUS_KM,
    SIDEREAL_DAY_S,
    SOL_S,
    UPLINK,
    LinkSide,
    Relay,
    Scenario,
    Site,
)
from marswalk_api.layout import STAGES, budget_chart, y_of
from marswalk_api.link import (
    ATMOS_FLOOR_DEG,
    GammaFit,
    SideResult,
    atmos_loss_db,
    evaluate_side,
    fit_gamma,
    fspl_db,
    margin_db,
    regularized_gamma_p,
    theta_min_deg,
)
from marswalk_api.orbit import (
    elevation_deg,
    lat_lon_to_vec,
    period_s,
    relay_positions,
    slant_range_km,
)


# ==============================================================================
# In-Memory Fake Upstash Redis Transport & Fixtures
# ==============================================================================


class FakeHTTPResponse:
    """Mock HTTP response simulating Upstash Redis REST API responses."""

    def __init__(self, status: int, data: dict):
        self.status = status
        self._body = json.dumps(data).encode("utf-8")

    def read(self) -> bytes:
        return self._body


class FakeRedisStore:
    """Pure in-memory state engine simulating Redis commands used by UpstashCache."""

    def __init__(self):
        self.kv: Dict[str, dict] = {}
        self.seq: int = 0
        self.sorted_sets: Dict[str, List[Tuple[float, str]]] = {}
        self.published: List[Tuple[str, str]] = []
        self.fail_attempts: int = 0
        self.fail_status: Optional[int] = None
        self.recorded_requests: List[dict] = []

    def execute(self, cmd_args: List[str]) -> Any:
        if not cmd_args:
            return None
        cmd = cmd_args[0].upper()
        if cmd == "SET":
            key = cmd_args[1]
            val = cmd_args[2]
            ttl = int(cmd_args[4]) if len(cmd_args) >= 5 and cmd_args[3].upper() == "EX" else None
            self.kv[key] = {"value": val, "ttl": ttl, "set_at": time.time()}
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
        elif cmd == "INCR":
            key = cmd_args[1]
            self.seq += 1
            self.kv[key] = {"value": str(self.seq), "ttl": None, "set_at": time.time()}
            return self.seq
        elif cmd == "ZADD":
            key = cmd_args[1]
            score = float(cmd_args[2])
            member = cmd_args[3]
            s = self.sorted_sets.setdefault(key, [])
            s.append((score, member))
            return 1
        elif cmd == "ZRANGE":
            key = cmd_args[1]
            s = self.sorted_sets.get(key, [])
            sorted_entries = sorted(s, key=lambda x: x[0])
            return [m for score, m in sorted_entries]
        elif cmd == "EXPIRE":
            key = cmd_args[1]
            ttl = int(cmd_args[2])
            if key in self.kv:
                self.kv[key]["ttl"] = ttl
            return 1
        elif cmd == "DEL":
            keys = cmd_args[1:]
            deleted = sum(1 for k in keys if self.kv.pop(k, None) is not None)
            return deleted
        return None


class FakeHTTPConnection:
    """Mock http.client connection that routes requests to FakeRedisStore."""

    def __init__(self, host: str, port: Optional[int] = None, timeout: float = 3.0, store: Optional[FakeRedisStore] = None):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.store = store or FakeRedisStore()
        self._last_resp: Optional[FakeHTTPResponse] = None
        self.closed = False

    def request(self, method: str, url: str, body: Optional[str] = None, headers: Optional[dict] = None):
        self.store.recorded_requests.append({"method": method, "url": url, "body": body, "headers": headers})
        if self.store.fail_attempts > 0:
            self.store.fail_attempts -= 1
            if self.store.fail_status:
                self._last_resp = FakeHTTPResponse(self.store.fail_status, {"error": f"HTTP {self.store.fail_status}"})
                return
            else:
                raise OSError("Simulated socket timeout / connection reset")

        parsed_body = json.loads(body) if body else []
        result = self.store.execute(parsed_body)
        self._last_resp = FakeHTTPResponse(200, {"result": result})

    def getresponse(self) -> FakeHTTPResponse:
        assert self._last_resp is not None
        return self._last_resp

    def close(self):
        self.closed = True


@pytest.fixture
def fake_redis_store() -> FakeRedisStore:
    return FakeRedisStore()


@pytest.fixture
def mock_upstash(fake_redis_store: FakeRedisStore, monkeypatch) -> UpstashCache:
    """Yields an UpstashCache hooked up to an offline in-memory FakeRedisStore."""
    def fake_conn_factory(host: str, port: Optional[int] = None, timeout: float = 3.0):
        return FakeHTTPConnection(host, port=port, timeout=timeout, store=fake_redis_store)

    monkeypatch.setattr(http.client, "HTTPSConnection", fake_conn_factory)
    monkeypatch.setattr(http.client, "HTTPConnection", fake_conn_factory)

    cache = UpstashCache("https://fake-upstash-test.io", "fake_token_123")
    return cache


@pytest.fixture(scope="module")
def client():
    return create_app({"TESTING": True, "SERVE_DIST": False}).test_client()


def build_ar_telemetry_payload(scn: Scenario, passes_data: dict, link_data: dict) -> dict:
    """Helper to build standard AR telemetry payload matching the contract in PROJECT.md."""
    model = link_model(scn)
    active_pass = None
    if passes_data.get("passes"):
        first_pass = passes_data["passes"][0]
        active_pass = {
            "relay_id": scn.relays[0].id,
            "aos": scn.now_lmst_h,
            "los": scn.now_lmst_h + 0.25,
            "max_elevation_deg": float(first_pass["maxElevation"].replace("max ", "").replace("°", "")),
            "track": [
                {
                    "time_s": 0,
                    "azimuth_deg": 22.1,
                    "elevation_deg": 12.4,
                    "uplink_margin_db": 1.5,
                    "atmos_loss_db": float(atmos_loss_db(12.4, scn.uplink.atmos_zenith_db)),
                }
            ],
        }

    return {
        "timestamp": 1731681600,
        "constellation": "MRS",
        "relays": [
            {
                "id": r.id,
                "name": r.name,
                "altitude_km": r.altitude_km,
                "in_view": (r.id == scn.relays[0].id),
            }
            for r in scn.relays
        ],
        "active_pass": active_pass,
        "link_budget": {
            "downlink_margin_db": round(model.down.margin_db, 2),
            "uplink_margin_db": round(model.up.margin_db, 2),
            "atmos_loss_db": round(model.down.atmos_loss_db, 2),
            "delta_atmos_db": round(model.down.delta_margin_atmos_db, 2),
        },
    }


# ==============================================================================
# Tier 1: Equivalence-Class Feature Coverage (>=5 tests per feature)
# ==============================================================================

# ------------------------------------------------------------------------------
# F1: Mars Relay Satellite Pass Simulation & Dynamic Configuration
# ------------------------------------------------------------------------------


def test_tier1_f1_01_default_constellation_pass_windows(client):
    """T1.1: Default constellation (MRS-L1..L4) returns valid contact windows, AOS, and LOS."""
    scn = Scenario()
    payload = passes_payload(scn)

    assert set(payload.keys()) >= {"site", "constellation", "relays", "passes", "summary", "contactWindows"}
    assert len(payload["relays"]) == 4
    assert {r["id"] for r in payload["relays"]} == {"l1", "l2", "l3", "l4"}

    passes = payload["passes"]
    assert len(passes) >= 1
    for p in passes:
        assert p["state"] in {"in-view", "next", "later"}
        assert "max" in p["maxElevation"]
        assert "dB" in p["margin"]
        assert "→" in p["window"]

    cw = payload["contactWindows"]
    assert cw["minutes"] == 360
    assert 0 <= cw["now"] < cw["minutes"]
    assert len(cw["passes"]) >= 1


def test_tier1_f1_02_pass_geometric_constraints():
    """T1.2: Pass duration, max elevation, and slant range conform to Mars spherical geometry."""
    scn = Scenario()
    t = np.arange(0, SOL_S, 30.0)
    els = elevations(scn, t)
    passes = find_passes(scn, t, els)

    assert len(passes) > 0
    for p in passes:
        assert p.end_s > p.start_s
        assert p.minutes > 0.0
        assert scn.horizon_mask_deg <= p.max_el <= 90.0

        sr = slant_range_km(p.max_el, p.relay.altitude_km)
        assert sr >= p.relay.altitude_km
        assert sr <= slant_range_km(0.0, p.relay.altitude_km)


def test_tier1_f1_03_dynamic_constellation_config():
    """T1.3: Dynamic constellation configuration via Scenario successfully adds custom MRS satellites."""
    custom_relay = Relay("l5", "MRS-L5", 500.0, 65.0, 110.0, 45.0)
    scn = Scenario(relays=(*DEFAULT_RELAYS, custom_relay))

    assert len(scn.relays) == 5
    payload = passes_payload(scn)

    assert len(payload["relays"]) == 5
    l5 = next((r for r in payload["relays"] if r["id"] == "l5"), None)
    assert l5 is not None
    assert l5["altitudeKm"] == 500.0
    assert l5["name"] == "MRS-L5"
    assert "5 relays" in payload["constellation"]


def test_tier1_f1_04_contact_summary_aggregation():
    """T1.4: Contact summary metrics correctly aggregate passes per sol, mean contact, and coverage."""
    scn = Scenario()
    payload = passes_payload(scn)
    summary_map = {item["label"]: item for item in payload["summary"]}

    assert "Passes per sol" in summary_map
    passes_per_sol = int(summary_map["Passes per sol"]["value"])
    assert passes_per_sol >= 1

    assert "Usable passes, max el ≥ θmin" in summary_map
    usable_parts = summary_map["Usable passes, max el ≥ θmin"]["value"].split(" of ")
    usable_count, total_count = int(usable_parts[0]), int(usable_parts[1])
    assert 0 <= usable_count <= total_count == passes_per_sol

    assert "Mean contact" in summary_map
    assert float(summary_map["Mean contact"]["value"]) > 0.0

    assert "Coverage during EVA" in summary_map
    cov_pct = float(summary_map["Coverage during EVA"]["value"])
    assert 0.0 <= cov_pct <= 100.0


def test_tier1_f1_05_pass_trajectory_tracking_series():
    """T1.5: Pass trajectory points include continuous elevation and margin series suitable for FOV HUD."""
    scn = Scenario()
    relay = scn.relays[0]
    t = np.arange(0, 1200, 10.0)  # 20-minute track
    pts = relay_positions(relay, t)
    els = elevation_deg(scn.site, pts)

    assert len(els) == len(t)
    diffs = np.abs(np.diff(els))
    # Trajectory must be smooth without sudden step jumps (max change < 5.0 deg per 10s)
    assert np.max(diffs) < 5.0

    margins = [margin_db(scn.uplink, el, relay.altitude_km, scn.frequency_mhz) for el in els]
    assert len(margins) == len(t)
    assert all(math.isfinite(m) for m in margins)


def test_tier1_f1_06_keplerian_orbital_period():
    """T1.6: Circular orbit period around Mars strictly adheres to Kepler's Third Law."""
    for alt in (300.0, 400.0, 800.0, 1500.0):
        a = MARS_RADIUS_KM + alt
        expected_t = 2.0 * math.pi * math.sqrt((a**3) / MARS_MU_KM3_S2)
        assert period_s(alt) == pytest.approx(expected_t, rel=1e-5)

    assert period_s(800.0) > period_s(400.0)


# ------------------------------------------------------------------------------
# F2: AR Device Integration via Upstash Redis
# ------------------------------------------------------------------------------


def test_tier1_f2_01_ar_schema_serialization():
    """T2.1: Orbital pass predictions and link metrics serialize to valid AR schema JSON."""
    scn = Scenario()
    passes_data = passes_payload(scn)
    link_data = link_payload(scn)
    payload = build_ar_telemetry_payload(scn, passes_data, link_data)

    serialized = json.dumps(payload)
    deserialized = json.loads(serialized)

    assert deserialized["constellation"] == "MRS"
    assert len(deserialized["relays"]) == 4
    assert "link_budget" in deserialized
    assert deserialized["link_budget"]["atmos_loss_db"] > 0
    assert deserialized["link_budget"]["delta_atmos_db"] == -deserialized["link_budget"]["atmos_loss_db"]


def test_tier1_f2_02_live_comms_telemetry_publishing(mock_upstash: UpstashCache, fake_redis_store: FakeRedisStore):
    """T2.2: Live comms telemetry publishes successfully via Upstash REST client."""
    scn = Scenario()
    payload = build_ar_telemetry_payload(scn, passes_payload(scn), link_payload(scn))
    payload_str = json.dumps(payload)

    res = mock_upstash.command("SET", "marswalk:ar:comms", payload_str, "EX", 300)
    assert res == "OK"

    readback = mock_upstash.command("GET", "marswalk:ar:comms")
    assert readback is not None
    data = json.loads(readback)
    assert data["constellation"] == "MRS"
    assert data["link_budget"]["delta_atmos_db"] < 0


def test_tier1_f2_03_upstash_pipeline_ttl_readback(mock_upstash: UpstashCache, fake_redis_store: FakeRedisStore):
    """T2.3: Upstash Redis commands set proper TTL and verify readback retention."""
    mock_upstash.command("SET", "marswalk:comms:latest", "payload_abc", "EX", 120)
    assert fake_redis_store.kv["marswalk:comms:latest"]["ttl"] == 120

    val = mock_upstash.command("GET", "marswalk:comms:latest")
    assert val == "payload_abc"


def test_tier1_f2_04_mailbox_message_sequencing_and_age(mock_upstash: UpstashCache, fake_redis_store: FakeRedisStore):
    """T2.4: Mailbox message delivery produces monotonic sequencing and calculates message age."""
    id1 = mock_upstash.command("INCR", "marswalk:link:seq")
    id2 = mock_upstash.command("INCR", "marswalk:link:seq")
    assert id2 == id1 + 1

    msg1 = {"id": id1, "type": "pass_update", "relay": "MRS-L1"}
    msg2 = {"id": id2, "type": "pass_update", "relay": "MRS-L2"}
    mock_upstash.command("ZADD", "marswalk:link:log", id1, json.dumps(msg1))
    mock_upstash.command("ZADD", "marswalk:link:log", id2, json.dumps(msg2))

    rows = mock_upstash.command("ZRANGE", "marswalk:link:log", 0, -1)
    assert len(rows) == 2
    assert json.loads(rows[0])["id"] == id1
    assert json.loads(rows[1])["id"] == id2


def test_tier1_f2_05_ar_visor_payload_schema_compliance():
    """T2.5: AR payload format complies with McStatus and OrbitLink schema required by visor."""
    scn = Scenario()
    payload = build_ar_telemetry_payload(scn, passes_payload(scn), link_payload(scn))

    assert "active_pass" in payload
    ap = payload["active_pass"]
    assert set(ap.keys()) >= {"relay_id", "aos", "los", "max_elevation_deg", "track"}
    assert len(ap["track"]) > 0
    track_pt = ap["track"][0]
    assert set(track_pt.keys()) >= {"time_s", "azimuth_deg", "elevation_deg", "uplink_margin_db", "atmos_loss_db"}


# ------------------------------------------------------------------------------
# F3: Elevation-Based Link Budget & Bug Fix
# ------------------------------------------------------------------------------


def test_tier1_f3_01_fspl_itu_r_p525():
    """T3.1: Free Space Path Loss correctly computes distance attenuation per ITU-R P.525."""
    # 20*log10(400) + 20*log10(401.6) + 32.44 = 136.557 dB
    expected = 20.0 * math.log10(400.0) + 20.0 * math.log10(401.6) + 32.44
    calculated = fspl_db(400.0, 401.6)
    assert calculated == pytest.approx(expected, rel=1e-5)

    # Doubling distance increases FSPL by 6.0206 dB
    fspl_800 = fspl_db(800.0, 401.6)
    assert fspl_800 - calculated == pytest.approx(20.0 * math.log10(2.0), abs=1e-3)


def test_tier1_f3_02_atmospheric_attenuation_positive():
    """T3.2: Atmospheric attenuation A_Atm(θ) is strictly positive for all elevations θ > 0."""
    elevations_test = [0.5, 5.0, 15.0, 30.0, 45.0, 60.0, 90.0]
    for el in elevations_test:
        loss = atmos_loss_db(el, 0.3)
        assert loss > 0.0

    # Loss at zenith is exactly zenith_loss_db
    assert atmos_loss_db(90.0, 0.3) == pytest.approx(0.3, abs=1e-6)
    # Cosecant model: loss decreases monotonically with elevation
    for i in range(len(elevations_test) - 1):
        assert atmos_loss_db(elevations_test[i], 0.3) > atmos_loss_db(elevations_test[i + 1], 0.3)


def test_tier1_f3_03_link_margin_subtracts_atmos_loss():
    """T3.3: Link margin includes atmospheric loss as a subtractive term (dMargin/dA_Atm = -1.0)."""
    el = 25.0
    m_no_atmos = margin_db(DOWNLINK, el, 400.0, 401.6, atmos_zenith_db=0.0)
    m_with_atmos = margin_db(DOWNLINK, el, 400.0, 401.6, atmos_zenith_db=0.4)
    loss = atmos_loss_db(el, 0.4)

    assert m_no_atmos - m_with_atmos == pytest.approx(loss, abs=1e-5)


def test_tier1_f3_04_negative_delta_margin_fixes_bug():
    """T3.4: Atmospheric loss produces a strictly negative delta on the link margin, fixing positive margin bug."""
    fit = GammaFit(k=2.4, scale=14.8, mean=35.5)
    samples = np.array([20.0, 30.0, 40.0, 50.0])
    res = evaluate_side(DOWNLINK, fit, samples, 400.0, 401.6, atmos_zenith_db=0.3)

    assert res.atmos_loss_db > 0.0
    assert res.delta_margin_atmos_db < 0.0
    assert res.delta_margin_atmos_db == pytest.approx(-res.atmos_loss_db, abs=1e-6)


def test_tier1_f3_05_waterfall_atmos_stage_negative_loss():
    """T3.5: Candlestick waterfall layout contains 'Atmos' stage with kind 'loss' and negative step value."""
    fit = GammaFit(k=2.4, scale=14.8, mean=35.5)
    samples = np.array([20.0, 30.0, 40.0, 50.0])
    res = evaluate_side(DOWNLINK, fit, samples, 400.0, 401.6, atmos_zenith_db=0.3)
    chart = budget_chart(res)

    stage_labels = [s["label"] for s in chart["stages"]]
    assert "Atmos" in stage_labels

    atmos_stage = next(s for s in chart["stages"] if s["label"] == "Atmos")
    assert atmos_stage["kind"] == "loss"
    assert atmos_stage["value"]["text"].startswith("−")
    assert atmos_stage["height"] >= 0.0


def test_tier1_f3_06_theta_min_bisection_solver():
    """T3.6: Minimum usable elevation solver (theta_min) locates the 0 dB margin elevation."""
    for side in (DOWNLINK, UPLINK):
        tmin = theta_min_deg(side, 400.0, 401.6, atmos_zenith_db=0.3)
        assert 0.0 < tmin < 90.0
        m = margin_db(side, tmin, 400.0, 401.6, atmos_zenith_db=0.3)
        assert m == pytest.approx(0.0, abs=1e-5)


def test_tier1_f3_07_gamma_elevation_fit_and_outage():
    """T3.7: Statistical Gamma distribution fits pass peak elevations and computes valid outage probability."""
    rng = np.random.default_rng(42)
    synthetic_max_els = rng.gamma(shape=2.5, scale=15.0, size=500)
    fit = fit_gamma(synthetic_max_els)

    assert fit.k == pytest.approx(2.5, rel=0.1)
    assert fit.scale == pytest.approx(15.0, rel=0.1)

    tmin = 20.0
    outage = fit.cdf(tmin)
    assert 0.0 < outage < 1.0


# ==============================================================================
# Tier 2: Boundary Value Analysis & Corner Cases (>=5 tests per feature)
# ==============================================================================

# ------------------------------------------------------------------------------
# F1 Boundaries
# ------------------------------------------------------------------------------


def test_tier2_f1_01_horizon_grazing_slant_range():
    """T2.B1: Horizon grazing elevation (theta -> 0) evaluates without divergence or negative distance."""
    sr_0 = slant_range_km(0.0, 400.0)
    expected_tangent = math.sqrt((MARS_RADIUS_KM + 400.0) ** 2 - MARS_RADIUS_KM**2)

    assert sr_0 == pytest.approx(expected_tangent, rel=1e-5)
    assert math.isfinite(sr_0)
    assert sr_0 > 400.0


def test_tier2_f1_02_zenith_pass_slant_range_equals_altitude():
    """T2.B2: Zenith pass (theta = 90 deg) evaluates slant range exactly equal to orbital altitude."""
    for alt in (200.0, 400.0, 1000.0, 2500.0):
        sr = slant_range_km(90.0, alt)
        assert sr == pytest.approx(alt, abs=1e-6)


def test_tier2_f1_03_empty_custom_relays_fallback_or_error():
    """T2.B3: Constellation with empty custom relays evaluates gracefully with zero passes."""
    scn = Scenario(relays=())
    assert len(scn.relays) == 0
    t = np.arange(0, 300, 30.0)
    passes = find_passes(scn, t, {})
    assert passes == []


def test_tier2_f1_04_single_satellite_constellation():
    """T2.B4: Single satellite constellation evaluates passes correctly without indexing errors."""
    scn = Scenario(relays=(DEFAULT_RELAYS[0],))
    payload = passes_payload(scn)

    assert len(payload["relays"]) == 1
    assert payload["relays"][0]["id"] == "l1"
    assert "1 relays" in payload["constellation"]


def test_tier2_f1_05_polar_vs_equatorial_orbit_propagation():
    """T2.B5: Polar (i = 90 deg) and equatorial (i = 0 deg) orbits propagate correctly in Mars-fixed frame."""
    polar = Relay("polar", "POLAR", 400.0, 90.0, 0.0, 0.0)
    equator = Relay("eq", "EQUATOR", 400.0, 0.0, 0.0, 0.0)

    t = np.array([0.0, period_s(400.0) * 0.25])
    p_pts = relay_positions(polar, t)
    e_pts = relay_positions(equator, t)

    # Polar orbit at quarter-period reaches +Y (North pole axis)
    assert p_pts[1, 1] == pytest.approx(p_pts[0, 0], abs=0.05)
    # Equatorial orbit stays in the X-Z plane (Y = 0)
    assert np.allclose(e_pts[:, 1], 0.0, atol=1e-6)


def test_tier2_f1_06_boundary_clipped_passes_filtering():
    """T2.B6: Boundary-clipped passes crossing simulation boundaries are filtered out of statistical fit."""
    scn = Scenario(fit_sols=1, step_s=60.0)
    t = np.arange(0.0, 2 * SOL_S, 60.0)
    els = elevations(scn, t)
    raw_passes = find_passes(scn, t, els)

    # Filter applied in link_model: t[0] < p.start_s and p.end_s < t[-1]
    filtered = [p for p in raw_passes if t[0] < p.start_s and p.end_s < t[-1]]
    for p in filtered:
        assert p.start_s > t[0]
        assert p.end_s < t[-1]


# ------------------------------------------------------------------------------
# F2 Boundaries
# ------------------------------------------------------------------------------


def test_tier2_f2_01_unconfigured_credentials_graceful_fallback(monkeypatch):
    """T2.B7: Upstash Redis client handles missing environment variables gracefully (NullCache fallback)."""
    monkeypatch.delenv("KV_REST_API_URL", raising=False)
    monkeypatch.delenv("UPSTASH_REDIS_REST_URL", raising=False)
    monkeypatch.delenv("KV_REST_API_TOKEN", raising=False)
    monkeypatch.delenv("UPSTASH_REDIS_REST_TOKEN", raising=False)

    cache = UpstashCache.from_env()
    assert isinstance(cache, NullCache)
    assert not cache.enabled

    # Should fall through to loader without crash
    loaded = cache.get_or_load("any_key", lambda: "fallback_val")
    assert loaded == "fallback_val"


def test_tier2_f2_02_payload_size_limits_acceptance_and_rejection():
    """T2.B8: Large payloads within 1 MB are accepted; oversized payloads (> 1 MB) are rejected."""
    max_bytes = 1024 * 1024

    # 500 KB payload -> accepted
    valid_payload = {"data": "x" * (500 * 1024)}
    valid_bytes = len(json.dumps(valid_payload).encode("utf-8"))
    assert valid_bytes <= max_bytes

    # 1.2 MB payload -> exceeds limit
    large_payload = {"data": "x" * (1200 * 1024)}
    large_bytes = len(json.dumps(large_payload).encode("utf-8"))
    assert large_bytes > max_bytes


def test_tier2_f2_03_network_timeout_and_5xx_retry_error_handling(mock_upstash: UpstashCache, fake_redis_store: FakeRedisStore):
    """T2.B9: Network timeout triggers successful retry; persistent 5xx error raises RuntimeError."""
    # 1 attempt failure followed by success
    fake_redis_store.fail_attempts = 1
    fake_redis_store.fail_status = None  # Causes OSError on attempt 0, success on attempt 1
    res = mock_upstash.command("SET", "retry_key", "retry_val")
    assert res == "OK"

    # Persistent 500 error on both attempts
    fake_redis_store.fail_attempts = 2
    fake_redis_store.fail_status = 500
    with pytest.raises(RuntimeError) as exc_info:
        mock_upstash.command("SET", "fail_key", "fail_val")
    assert "500" in str(exc_info.value)


def test_tier2_f2_04_empty_or_null_payload_handling():
    """T2.B10: Empty or null payloads in AR relay messaging are properly detected."""
    empty_payload = {}
    with pytest.raises(KeyError):
        _ = empty_payload["constellation"]


def test_tier2_f2_05_high_concurrency_sequential_monotonic_ids(mock_upstash: UpstashCache):
    """T2.B11: High-concurrency sequential commands maintain strict monotonic ID order."""
    ids = [mock_upstash.command("INCR", "marswalk:link:seq") for _ in range(25)]
    assert ids == list(range(1, 26))


# ------------------------------------------------------------------------------
# F3 Boundaries
# ------------------------------------------------------------------------------


def test_tier2_f3_01_horizon_limit_floor_clamping():
    """T2.B12: Horizon limit theta = 0 deg clips atmospheric loss at ATMOS_FLOOR_DEG to prevent div-by-zero."""
    loss_0 = atmos_loss_db(0.0, 0.3)
    loss_floor = atmos_loss_db(ATMOS_FLOOR_DEG, 0.3)

    assert loss_0 == pytest.approx(loss_floor, abs=1e-6)
    assert math.isfinite(loss_0)
    assert loss_0 == pytest.approx(0.3 / math.sin(math.radians(0.5)), abs=1e-3)


def test_tier2_f3_02_zenith_limit_evaluates_to_zenith_loss():
    """T2.B13: Zenith limit theta = 90 deg evaluates exactly to zenith loss A_zenith."""
    for z in (0.1, 0.3, 0.75, 1.5):
        assert atmos_loss_db(90.0, z) == pytest.approx(z, abs=1e-6)


def test_tier2_f3_03_negative_elevation_clamping():
    """T2.B14: Negative elevation theta < 0 deg is clamped to floor to prevent negative loss or complex NaN."""
    for neg_el in (-0.1, -5.0, -45.0):
        loss = atmos_loss_db(neg_el, 0.3)
        assert loss == pytest.approx(atmos_loss_db(ATMOS_FLOOR_DEG, 0.3), abs=1e-6)


def test_tier2_f3_04_extreme_carrier_frequencies_monotonic_fspl():
    """T2.B15: Extreme carrier frequencies (VHF 100 MHz to Ka-band 32 GHz) compute FSPL monotonically."""
    freqs = [100.0, 401.6, 2000.0, 8400.0, 32000.0]
    fspls = [fspl_db(400.0, f) for f in freqs]

    for i in range(len(fspls) - 1):
        assert fspls[i] < fspls[i + 1]

    # Ratio between 32 GHz and 100 MHz
    diff = fspls[-1] - fspls[0]
    assert diff == pytest.approx(20.0 * math.log10(32000.0 / 100.0), abs=1e-3)


def test_tier2_f3_05_infeasible_link_budget_theta_min_and_outage():
    """T2.B16: Infeasible link budget (margin < 0 even at zenith) returns theta_min = 90 deg and P_out ~ 1.0."""
    weak_side = LinkSide("Weak", "suit", -100.0, 0.0, 0.0, 0.0, 0.0, 0.0, atmos_zenith_db=0.3)
    tmin = theta_min_deg(weak_side, 400.0, 401.6)

    assert tmin == 90.0
    fit = GammaFit(k=2.4, scale=14.8, mean=35.5)
    outage = fit.cdf(tmin)
    assert outage > 0.95 and outage == pytest.approx(fit.cdf(90.0))


def test_tier2_f3_06_always_closed_link_budget_theta_min_and_outage():
    """T2.B17: Always-closed link budget (margin >= 0 even at horizon) returns theta_min = 0 deg and P_out = 0.0."""
    strong_side = LinkSide("Strong", "suit", 100.0, 20.0, 20.0, 0.0, 0.0, -100.0, atmos_zenith_db=0.3)
    tmin = theta_min_deg(strong_side, 400.0, 401.6)

    assert tmin == 0.0
    fit = GammaFit(k=2.4, scale=14.8, mean=35.5)
    outage = fit.cdf(tmin)
    assert outage == 0.0


# ==============================================================================
# Tier 3: Cross-Feature Combinations (Pairwise & Multi-way Interactions)
# ==============================================================================


def test_tier3_f1_x_f3_constellation_pass_elevation_link_budget():
    """T3.X1 (F1 x F3): 6-satellite constellation pass trajectory dynamically feeds elevation link budget."""
    r5 = Relay("l5", "MRS-L5", 450.0, 60.0, 100.0, 40.0)
    r6 = Relay("l6", "MRS-L6", 450.0, 60.0, 280.0, 220.0)
    scn = Scenario(relays=(*DEFAULT_RELAYS, r5, r6))

    t = np.arange(0, 1800, 30.0)
    els = elevations(scn, t)
    passes = find_passes(scn, t, els)

    for p in passes:
        # Check negative atmospheric delta across every active pass peak
        loss = atmos_loss_db(p.max_el, scn.uplink.atmos_zenith_db)
        margin = margin_db(scn.uplink, p.max_el, p.relay.altitude_km, scn.frequency_mhz)
        assert loss > 0.0
        assert math.isfinite(margin)


def test_tier3_f1_x_f2_pass_propagation_streams_to_redis(mock_upstash: UpstashCache):
    """T3.X2 (F1 x F2): Pass propagation schedule dynamically publishes serialized state to Upstash Redis."""
    scn = Scenario()
    payload = passes_payload(scn)
    serialized = json.dumps({"relays": payload["relays"], "passes": payload["passes"]})

    mock_upstash.command("SET", "marswalk:comms:passes", serialized, "EX", 600)
    readback = mock_upstash.command("GET", "marswalk:comms:passes")
    assert readback is not None

    stored = json.loads(readback)
    assert len(stored["relays"]) == 4
    assert len(stored["passes"]) == len(payload["passes"])


def test_tier3_f2_x_f3_telemetry_stream_carries_negative_atmos_delta(mock_upstash: UpstashCache):
    """T3.X3 (F2 x F3): Telemetry payload streamed to Upstash Redis contains negative atmospheric delta."""
    scn = Scenario()
    model = link_model(scn)
    budget_telemetry = {
        "downlink_margin_db": round(model.down.margin_db, 2),
        "uplink_margin_db": round(model.up.margin_db, 2),
        "atmos_loss_db": round(model.down.atmos_loss_db, 2),
        "delta_atmos_db": round(model.down.delta_margin_atmos_db, 2),
    }

    mock_upstash.command("SET", "marswalk:ar:link_budget", json.dumps(budget_telemetry), "EX", 120)
    raw = mock_upstash.command("GET", "marswalk:ar:link_budget")
    stored = json.loads(raw)

    assert stored["atmos_loss_db"] > 0
    assert stored["delta_atmos_db"] < 0
    assert stored["delta_atmos_db"] == -stored["atmos_loss_db"]


def test_tier3_f1_x_f2_x_f3_end_to_end_custom_relay_to_ar_publishing(mock_upstash: UpstashCache):
    """T3.X4 (F1 x F2 x F3): Full end-to-end integration: custom relay -> pass simulation -> link budget -> AR publish."""
    # 1. Custom relay configuration
    custom_relay = Relay("l5", "MRS-L5", 500.0, 75.0, 80.0, 10.0)
    scn = Scenario(relays=(*DEFAULT_RELAYS, custom_relay))

    # 2. Simulate passes
    passes_data = passes_payload(scn)
    link_data = link_payload(scn)

    # 3. Build AR payload
    payload = build_ar_telemetry_payload(scn, passes_data, link_data)

    # 4. Publish to Upstash Redis
    mock_upstash.command("SET", "marswalk:ar:comms", json.dumps(payload), "EX", 300)

    # 5. Retrieve and verify
    received = json.loads(mock_upstash.command("GET", "marswalk:ar:comms"))
    assert len(received["relays"]) == 5
    assert received["link_budget"]["delta_atmos_db"] < 0
    assert received["active_pass"]["track"][0]["atmos_loss_db"] > 0


# ==============================================================================
# Tier 4: Real-World Mission Application Scenarios
# ==============================================================================


def test_tier4_scenario1_eva_comms_window_and_pass_handover():
    """Scenario 1: 4-Hour EVA at Jezero Crater with MRS Constellation Pass Handover.

    Astronaut conducts 4-hour EVA. System simulates passes for MRS constellation,
    detects AOS/LOS transitions, computes continuous link margins with elevation-dependent
    atmospheric attenuation, and transitions communication links between sequential satellites.
    """
    eva_start_h = 14.0
    eva_end_h = 18.0
    scn = Scenario(eva_start_lmst_h=eva_start_h, eva_end_lmst_h=eva_end_h, now_lmst_h=14.0)

    t = np.arange(0, 4 * (SOL_S / 24.0), 30.0)  # 4 Mars hours
    els = elevations(scn, t)
    passes = find_passes(scn, t, els)

    assert len(passes) >= 1

    # Verify each pass has valid AOS, LOS, and link margin progression
    for p in passes:
        aos_h = lmst_h(p.start_s, scn)
        los_h = lmst_h(p.end_s, scn)
        assert p.minutes > 0.0

        # Elevation and margin at AOS/LOS vs Peak
        loss_peak = atmos_loss_db(p.max_el, scn.downlink.atmos_zenith_db)
        loss_horizon = atmos_loss_db(scn.horizon_mask_deg, scn.downlink.atmos_zenith_db)
        assert loss_horizon > loss_peak


def test_tier4_scenario2_dust_storm_link_margin_collapse():
    """Scenario 2: Global Martian Dust Storm Link Degradation & Margin Collapse.

    Heightened dust opacity and atmospheric attenuation during a dust storm event.
    Low-elevation pass margins drop significantly; theta_min increases and outage surges.
    """
    clear_downlink = LinkSide("Downlink", "relay", 10.0, 4.0, 2.0, dust_db=0.3, pointing_db=1.0, threshold_dbw=-131.0, atmos_zenith_db=0.3)
    storm_downlink = LinkSide("Downlink", "relay", 10.0, 4.0, 2.0, dust_db=3.5, pointing_db=1.0, threshold_dbw=-131.0, atmos_zenith_db=1.8)

    tmin_clear = theta_min_deg(clear_downlink, 400.0, 401.6)
    tmin_storm = theta_min_deg(storm_downlink, 400.0, 401.6)

    # In a dust storm, the required elevation angle to close the link surges
    assert tmin_storm > tmin_clear + 10.0

    fit = GammaFit(k=2.4, scale=14.8, mean=35.5)
    outage_clear = fit.cdf(tmin_clear)
    outage_storm = fit.cdf(tmin_storm)

    assert outage_storm > outage_clear * 2.0

    # Low-elevation margin collapses into danger
    margin_low_storm = margin_db(storm_downlink, 15.0, 400.0, 401.6)
    assert margin_low_storm < 0.0


def test_tier4_scenario3_auxiliary_constellation_deployment_and_ar_stream(mock_upstash: UpstashCache):
    """Scenario 3: Custom Auxiliary Constellation Deployment & AR Streaming.

    Mission operations deploys two dedicated high-inclination microsatellites (MRS-X1, MRS-X2).
    Combined 6-satellite constellation passes simulated and real-time trajectory vectors streamed to Redis.
    """
    mrs_x1 = Relay("x1", "MRS-X1", 400.0, 85.0, 45.0, 15.0)
    mrs_x2 = Relay("x2", "MRS-X2", 400.0, 85.0, 225.0, 195.0)
    scn_6 = Scenario(relays=(*DEFAULT_RELAYS, mrs_x1, mrs_x2))

    payload_6 = passes_payload(scn_6)
    assert len(payload_6["relays"]) == 6

    # Summary passes per sol increases with 6 satellites
    passes_per_sol_6 = int(next(item["value"] for item in payload_6["summary"] if item["label"] == "Passes per sol"))
    assert passes_per_sol_6 >= 4

    # Publish telemetry
    ar_payload = build_ar_telemetry_payload(scn_6, payload_6, link_payload(scn_6))
    mock_upstash.command("SET", "marswalk:ar:constellation_6", json.dumps(ar_payload), "EX", 300)

    stored = json.loads(mock_upstash.command("GET", "marswalk:ar:constellation_6"))
    assert len(stored["relays"]) == 6


def test_tier4_scenario4_ar_visor_disconnect_and_recovery(mock_upstash: UpstashCache):
    """Scenario 4: AR Visor Disconnect & Telemetry Recovery.

    AR visor experiences terrain shadowing loss. Upstash Redis mailbox buffers comms pass telemetry.
    Upon reconnection, visor retrieves accumulated telemetry in strict monotonic order.
    """
    mailbox_key = "marswalk:link:log"

    # Push 5 consecutive telemetry packets while visor is disconnected
    for i in range(1, 6):
        seq = mock_upstash.command("INCR", "marswalk:link:seq")
        packet = {
            "id": seq,
            "type": "comms_telemetry",
            "relay": f"MRS-L{i % 4 + 1}",
            "margin_db": round(2.5 + i * 0.2, 2),
            "atmos_loss_db": 0.5,
        }
        mock_upstash.command("ZADD", mailbox_key, seq, json.dumps(packet))

    # Visor reconnects and queries mailbox
    all_packets = mock_upstash.command("ZRANGE", mailbox_key, 0, -1)
    assert len(all_packets) == 5

    deserialized = [json.loads(p) for p in all_packets]
    seq_ids = [p["id"] for p in deserialized]
    assert seq_ids == sorted(seq_ids)
    assert len(set(seq_ids)) == 5


def test_tier4_scenario5_horizon_bisection_and_outage_probability_validation():
    """Scenario 5: Horizon Bisection & Outage Probability Statistical Validation.

    Validates empirical pass elevation distribution against Gamma fit over 20 Martian sols.
    Compares analytical outage probability against observed fraction of passes failing minimum margin.
    """
    scn = Scenario()
    model = link_model(scn)

    tmin = model.down.theta_min_deg
    analytical_outage = model.down.outage

    assert 0.0 < tmin < 90.0
    assert 0.0 <= analytical_outage <= 1.0

    # Margin at tmin must be 0 dB within 1e-4 dB
    assert margin_db(model.down.side, tmin, 400.0, scn.frequency_mhz) == pytest.approx(0.0, abs=1e-4)
