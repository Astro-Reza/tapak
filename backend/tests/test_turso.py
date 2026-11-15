"""Turso client and Redis cache tests.

Offline tests cover the wire encoding and schema splitting. The live test runs
only with MARSWALK_LIVE_TESTS=1 and TURSO_* set; it compares Turso payloads
with a freshly seeded local SQLite file (read-only against Turso).
"""

from __future__ import annotations

import os

import pytest

from marswalk_api import hub_db
from marswalk_api.cache import NullCache
from marswalk_api.turso import Row, TursoConnection, _decode, _encode, split_script


@pytest.mark.parametrize("value", [None, 0, 412, -3, 9.0, 3.4, "EVA-07", "Sōtah", b"\x00\xffab"])
def test_value_round_trip(value):
    enc = _encode(value)
    if enc["type"] == "float":  # Turso sends floats as JSON numbers
        enc = {**enc, "value": float(enc["value"])}
    assert _decode(enc) == value


def test_bool_encodes_as_integer():
    assert _encode(True) == {"type": "integer", "value": "1"}


def test_row_access():
    r = Row(["id", "is_done"], ["pre-1.1", 1])
    assert r["id"] == "pre-1.1" and r[1] == 1 and r.keys() == ["id", "is_done"]
    with pytest.raises(IndexError):
        r["missing"]


def test_schema_splits_into_ddl():
    stmts = split_script(hub_db.SCHEMA_PATH.read_text(encoding="utf-8"))
    assert stmts and all(s.upper().startswith("CREATE") for s in stmts)
    assert sum(s.upper().startswith("CREATE TABLE") for s in stmts) == 9


def test_url_normalised():
    c = TursoConnection("libsql://db-org.turso.io", "t")
    assert (c._scheme, c._host) == ("https", "db-org.turso.io")
    with pytest.raises(ValueError):
        TursoConnection("ftp://x", None)


def test_null_cache_always_loads():
    calls = []
    assert NullCache().get_or_load("k", lambda: calls.append(1) or 5) == 5
    assert calls == [1]


def test_local_connection_skips_cache(tmp_path):
    conn = hub_db.init_db(tmp_path / "h.db")
    assert isinstance(hub_db._cache_for(conn), NullCache)
    conn.close()


@pytest.mark.skipif(
    os.environ.get("MARSWALK_LIVE_TESTS") != "1" or not os.environ.get("TURSO_DATABASE_URL"),
    reason="set MARSWALK_LIVE_TESTS=1 and TURSO_* to run against Turso",
)
def test_live_turso_matches_local_seed(tmp_path):
    local = hub_db.init_db(tmp_path / "h.db")
    remote = hub_db.get_turso()
    assert hub_db.get_presets(remote) == hub_db.get_presets(local)
    assert hub_db.get_hold_criteria(remote) == hub_db.get_hold_criteria(local)
    for cl in hub_db.BUILTIN_CHECKLISTS:
        assert hub_db.get_checklist_with_blocks(remote, cl) == hub_db.get_checklist_with_blocks(local, cl)
