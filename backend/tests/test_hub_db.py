"""Unit tests for Marswalk Hub dummy database and access layer.

Run with:
    cd backend
    .venv\\Scripts\\python -m pytest tests/test_hub_db.py -v
"""

from __future__ import annotations

import sqlite3
import pytest

from marswalk_api.hub_db import (
    init_db,
    get_presets,
    get_preset_by_id,
    get_checklist_with_blocks,
    set_item_done,
    reset_checklist_state,
    get_hold_criteria,
    get_hub_summary,
)


@pytest.fixture
def db_conn(tmp_path):
    """Creates a temporary seeded database for isolated testing."""
    test_db = tmp_path / "test_hub.db"
    conn = init_db(db_path=test_db, seed=True)
    yield conn
    conn.close()


def test_presets_loaded(db_conn):
    presets = get_presets(db_conn)
    assert len(presets) >= 6

    # Verify first preset (EVA-07)
    p07 = next(p for p in presets if p["id"] == "EVA-07")
    assert p07["name"] == "Jezero West Delta"
    assert p07["sol"] == 412
    assert p07["mode"] == "efficient"
    assert p07["status"] == "Active"
    assert set(p07["tags"]) == {"Delta", "Sampling", "Primary"}
    assert isinstance(p07["distanceKm"], float)
    assert isinstance(p07["stopsCount"], int)


def test_presets_filtering(db_conn):
    active = get_presets(db_conn, status="Active")
    assert len(active) == 1
    assert active[0]["id"] == "EVA-07"

    search_delta = get_presets(db_conn, search="delta")
    assert any(p["id"] == "EVA-07" for p in search_delta)

    p08 = get_preset_by_id(db_conn, "EVA-08")
    assert p08 is not None
    assert p08["name"] == "Belva Impact Rim"
    assert p08["mode"] == "safest"

    assert get_preset_by_id(db_conn, "NONEXISTENT") is None


def test_checklist_structure(db_conn):
    pre = get_checklist_with_blocks(db_conn, "pre", preset_id="EVA-07")
    assert pre is not None
    assert pre["id"] == "pre"
    assert len(pre["blocks"]) == 7

    total_pre_items = sum(len(b["items"]) for b in pre["blocks"])
    assert total_pre_items == 41

    # Check item structure and taxonomy codes
    item_1_1 = pre["blocks"][0]["items"][0]
    assert item_1_1["id"] == "pre-1.1"
    assert "EB1" in item_1_1["codes"]
    assert item_1_1["owner"] == "Auto+"
    assert item_1_1["isDone"] is True  # Seeded as done for EVA-07

    # Check During-EVA
    during = get_checklist_with_blocks(db_conn, "during", preset_id="EVA-07")
    assert during is not None
    assert len(during["blocks"]) == 1
    assert len(during["blocks"][0]["items"]) == 6

    # Check Post-EVA
    post = get_checklist_with_blocks(db_conn, "post", preset_id="EVA-07")
    assert post is not None
    assert len(post["blocks"]) == 6
    assert sum(len(b["items"]) for b in post["blocks"]) == 26


def test_checklist_toggle_and_reset(db_conn):
    # Check initial state of pre-7.1
    pre = get_checklist_with_blocks(db_conn, "pre", preset_id="EVA-07")
    block_7 = pre["blocks"][6]
    item_7_1 = block_7["items"][0]
    assert item_7_1["id"] == "pre-7.1"
    assert item_7_1["isDone"] is False

    # Mark pre-7.1 as done
    set_item_done(db_conn, "EVA-07", "pre-7.1", True, completed_by="Commander")
    pre_after = get_checklist_with_blocks(db_conn, "pre", preset_id="EVA-07")
    assert pre_after["blocks"][6]["items"][0]["isDone"] is True

    # Mark it as undone
    set_item_done(db_conn, "EVA-07", "pre-7.1", False)
    pre_undone = get_checklist_with_blocks(db_conn, "pre", preset_id="EVA-07")
    assert pre_undone["blocks"][6]["items"][0]["isDone"] is False

    # Reset entire Pre-EVA checklist for EVA-07
    reset_checklist_state(db_conn, "EVA-07", "pre")
    pre_reset = get_checklist_with_blocks(db_conn, "pre", preset_id="EVA-07")
    done_count = sum(
        sum(1 for it in b["items"] if it["isDone"]) for b in pre_reset["blocks"]
    )
    assert done_count == 0


def test_hold_criteria(db_conn):
    criteria = get_hold_criteria(db_conn)
    assert len(criteria) == 12

    aerobic = next(c for c in criteria if c["id"] == "hold-aerobic")
    assert aerobic["title"] == "Aerobic capacity"
    assert aerobic["status"] == "sourced"
    assert "IB1" in aerobic["codes"]


def test_hub_summary(db_conn):
    summary = get_hub_summary(db_conn, preset_id="EVA-07")
    assert summary["activePreset"]["id"] == "EVA-07"
    assert len(summary["presets"]) >= 6
    assert "pre" in summary["checklistProgress"]
    assert summary["checklistProgress"]["pre"]["total"] == 41
    assert summary["checklistProgress"]["pre"]["done"] > 0
    assert summary["holdCriteriaCount"] == 12
