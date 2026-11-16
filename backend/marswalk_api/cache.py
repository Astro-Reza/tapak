"""Read-through JSON cache on Upstash Redis (REST API), stdlib only.

Caches the Hub catalogue, which only changes when the database is reseeded:
mission presets, checklist structure (blocks, items, codes) and hold criteria.
Per-preset checklist state is never cached; it is read from the database on
every request so a toggle shows up immediately on every instance.

Env (set by the Vercel Upstash integration): KV_REST_API_URL, KV_REST_API_TOKEN.
Without them, or when Redis errors, every call falls through to the loader.
"""

from __future__ import annotations

import http.client
import json
import logging
import os
import threading
from typing import Any, Callable, Optional
from urllib.parse import urlsplit

log = logging.getLogger(__name__)

PREFIX = "marswalk:hub:v1:"
DEFAULT_TTL_S = 6 * 3600


class NullCache:
    enabled = False

    def get_or_load(self, key: str, loader: Callable[[], Any], ttl: int = DEFAULT_TTL_S) -> Any:
        return loader()

    def invalidate(self) -> int:
        return 0

    def publish_ar_comms(
        self,
        comms_payload: dict,
        passes_payload: dict | None = None,
        ttl_s: int = 3600,
    ) -> dict[str, Any]:
        log.warning("Upstash Redis unconfigured; skipping AR comms publish")
        return {
            "published": False,
            "configured": False,
            "error": None,
            "keys": [],
        }


class UpstashCache(NullCache):
    enabled = True

    def __init__(self, url: str, token: str, timeout: float = 3.0):
        parts = urlsplit(url.strip())
        if not parts.hostname:
            raise ValueError(f"unsupported Upstash URL: {url!r}")
        self._https = parts.scheme != "http"
        self._host = parts.hostname
        self._port = parts.port
        self._token = token
        self._timeout = timeout
        self._http: Optional[http.client.HTTPConnection] = None
        self._lock = threading.Lock()

    @classmethod
    def from_env(cls) -> NullCache:
        url = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
        token = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
        if os.environ.get("MARSWALK_CACHE", "1") == "0" or not (url and token):
            return NullCache()
        return cls(url, token)

    def command(self, *args: Any) -> Any:
        """Run one Redis command, e.g. command("SET", "k", "v", "EX", 60)."""
        body = json.dumps([str(a) for a in args])
        headers = {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}
        with self._lock:
            for attempt in (0, 1):
                if self._http is None:
                    cls = http.client.HTTPSConnection if self._https else http.client.HTTPConnection
                    self._http = cls(self._host, self._port, timeout=self._timeout)
                try:
                    self._http.request("POST", "/", body=body, headers=headers)
                    resp = self._http.getresponse()
                    data = json.loads(resp.read() or b"{}")
                    break
                except (OSError, http.client.HTTPException, ValueError):
                    self._http.close()
                    self._http = None
                    if attempt:
                        raise
        if resp.status != 200 or "error" in data:
            raise RuntimeError(f"Upstash {resp.status}: {data.get('error')}")
        return data.get("result")

    def get_or_load(self, key: str, loader: Callable[[], Any], ttl: int = DEFAULT_TTL_S) -> Any:
        full = PREFIX + key
        try:
            hit = self.command("GET", full)
            if hit is not None:
                return json.loads(hit)
        except Exception as err:  # cache is best effort
            log.warning("redis GET %s failed: %s", full, err)
            return loader()
        value = loader()
        try:
            self.command("SET", full, json.dumps(value, ensure_ascii=False), "EX", ttl)
        except Exception as err:
            log.warning("redis SET %s failed: %s", full, err)
        return value

    def invalidate(self) -> int:
        """Delete every Hub catalogue key. Call after (re)seeding the database."""
        deleted, cursor = 0, "0"
        while True:
            cursor, keys = self.command("SCAN", cursor, "MATCH", PREFIX + "*", "COUNT", 200)
            if keys:
                deleted += int(self.command("DEL", *keys))
            if str(cursor) == "0":
                return deleted

    def publish_ar_comms(
        self,
        comms_payload: dict,
        passes_payload: dict | None = None,
        ttl_s: int = 3600,
    ) -> dict[str, Any]:
        """Publish AR comms and optional pass simulation data to Upstash Redis.

        Sets `marswalk:ar:comms` with TTL, and optionally sets / publishes
        `marswalk:comms:passes`. Fault-tolerant: errors are logged and returned
        in the result dictionary rather than raising exceptions.
        """
        keys_written: list[str] = []
        try:
            ar_json = json.dumps(comms_payload, ensure_ascii=False)
            self.command("SET", "marswalk:ar:comms", ar_json, "EX", ttl_s)
            keys_written.append("marswalk:ar:comms")

            if passes_payload is not None:
                passes_json = json.dumps(passes_payload, ensure_ascii=False)
                self.command("SET", "marswalk:comms:passes", passes_json, "EX", ttl_s)
                keys_written.append("marswalk:comms:passes")
                try:
                    self.command("PUBLISH", "marswalk:comms:passes", passes_json)
                except Exception as pub_err:
                    log.debug("PUBLISH to marswalk:comms:passes failed (non-critical): %s", pub_err)

            return {
                "published": True,
                "configured": True,
                "error": None,
                "keys": keys_written,
            }
        except Exception as err:
            log.warning("publish_ar_comms failed: %s", err)
            return {
                "published": False,
                "configured": True,
                "error": str(err),
                "keys": keys_written,
            }


_cache: Optional[NullCache] = None


def get_cache() -> NullCache:
    """Process-wide cache, built from the environment on first use."""
    global _cache
    if _cache is None:
        _cache = UpstashCache.from_env()
    return _cache


def set_cache(cache: Optional[NullCache]) -> None:
    """Override the process-wide cache (tests); None rebuilds from env."""
    global _cache
    _cache = cache


def publish_ar_comms(
    comms_payload: dict,
    passes_payload: dict | None = None,
    ttl_s: int = 3600,
) -> dict[str, Any]:
    """Publish AR comms data via the process-wide cache instance."""
    return get_cache().publish_ar_comms(comms_payload, passes_payload=passes_payload, ttl_s=ttl_s)
