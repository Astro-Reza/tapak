"""Database access layer and seed utilities for Marswalk Hub page data.

Manages mission presets, operational checklists (Pre, During, Post EVA),
checklist execution states per preset, and mission hold criteria.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "marswalk_hub.db"
SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schema_hub.sql"
SEED_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "hub_dummy_data.json"


def get_connection(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = db_path or DEFAULT_DB_PATH
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: Optional[Path] = None, seed: bool = True) -> sqlite3.Connection:
    """Creates tables from schema and optionally loads initial seed data."""
    conn = get_connection(db_path)
    with conn:
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
    if seed:
        seed_db(conn)
    return conn


def seed_db(conn: sqlite3.Connection, seed_file: Optional[Path] = None) -> None:
    """Populates database with dummy data from hub_dummy_data.json."""
    path = seed_file or SEED_DATA_PATH
    if not path.is_file():
        raise FileNotFoundError(f"Seed data file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    with conn:
        # 1. Mission Presets & Tags
        for p in data.get("mission_presets", []):
            conn.execute(
                """
                INSERT OR REPLACE INTO mission_presets (
                    id, name, site, sol, coordinates, mode, policy_id, science_id,
                    start_lmst, distance_km, duration_label, stops_count, summary, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    p["id"],
                    p["name"],
                    p["site"],
                    p["sol"],
                    p["coordinates"],
                    p["mode"],
                    p["policy_id"],
                    p["science_id"],
                    p["start_lmst"],
                    p["distance_km"],
                    p["duration_label"],
                    p["stops_count"],
                    p["summary"],
                    p.get("status", "Planned"),
                ),
            )
            for tag in p.get("tags", []):
                conn.execute(
                    "INSERT OR IGNORE INTO mission_preset_tags (preset_id, tag) VALUES (?, ?)",
                    (p["id"], tag),
                )

        # 2. Checklists, Blocks, Items, and Codes
        for cl in data.get("checklists", []):
            conn.execute(
                """
                INSERT OR REPLACE INTO checklists (id, title, phase, is_builtin, description)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    cl["id"],
                    cl["title"],
                    cl["phase"],
                    cl.get("is_builtin", True),
                    cl.get("description", ""),
                ),
            )
            for b_idx, block in enumerate(cl.get("blocks", [])):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO checklist_blocks (id, checklist_id, title, when_window, sort_order)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        block["id"],
                        cl["id"],
                        block["title"],
                        block.get("when"),
                        b_idx,
                    ),
                )
                for i_idx, item in enumerate(block.get("items", [])):
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO checklist_items (id, block_id, title, detail, owner, tag, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            item["id"],
                            block["id"],
                            item["title"],
                            item.get("detail"),
                            item.get("owner"),
                            item.get("tag"),
                            i_idx,
                        ),
                    )
                    for code in item.get("codes", []):
                        if code:
                            conn.execute(
                                "INSERT OR IGNORE INTO checklist_item_codes (item_id, code) VALUES (?, ?)",
                                (item["id"], code),
                            )

        # 3. Mission Checklist States
        for state in data.get("mission_checklist_states", []):
            conn.execute(
                """
                INSERT OR REPLACE INTO mission_checklist_state (
                    preset_id, item_id, is_done, completed_by, notes, completed_at
                ) VALUES (?, ?, ?, ?, ?, datetime('now'))
                """,
                (
                    state["preset_id"],
                    state["item_id"],
                    1 if state.get("is_done") else 0,
                    state.get("completed_by"),
                    state.get("notes"),
                ),
            )

        # 4. Hold Criteria & Codes
        for hc in data.get("hold_criteria", []):
            conn.execute(
                """
                INSERT OR REPLACE INTO hold_criteria (id, title, limit_expr, status, source)
                VALUES (?, ?, ?, ?, ?)
                """,
                (hc["id"], hc["title"], hc["limit"], hc["status"], hc["source"]),
            )
            for code in hc.get("codes", []):
                if code:
                    conn.execute(
                        "INSERT OR IGNORE INTO hold_criteria_codes (criteria_id, code) VALUES (?, ?)",
                        (hc["id"], code),
                    )


# -----------------------------------------------------------------------------
# Query Helpers
# -----------------------------------------------------------------------------

def get_presets(
    conn: sqlite3.Connection,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Returns list of mission presets formatted matching frontend MissionPreset."""
    query = "SELECT * FROM mission_presets WHERE 1=1"
    params: List[Any] = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if search:
        s = f"%{search.lower()}%"
        query += """ AND (
            LOWER(id) LIKE ? OR
            LOWER(name) LIKE ? OR
            LOWER(site) LIKE ? OR
            LOWER(summary) LIKE ? OR
            LOWER(mode) LIKE ? OR
            CAST(sol AS TEXT) LIKE ?
        )"""
        params.extend([s, s, s, s, s, s])

    query += " ORDER BY sol ASC, id ASC"
    rows = conn.execute(query, params).fetchall()

    presets = []
    for r in rows:
        tags_rows = conn.execute(
            "SELECT tag FROM mission_preset_tags WHERE preset_id = ? ORDER BY tag ASC",
            (r["id"],),
        ).fetchall()
        tags = [t["tag"] for t in tags_rows]
        presets.append({
            "id": r["id"],
            "name": r["name"],
            "site": r["site"],
            "sol": r["sol"],
            "coordinates": r["coordinates"],
            "mode": r["mode"],
            "policyId": r["policy_id"],
            "scienceId": r["science_id"],
            "startLmst": r["start_lmst"],
            "distanceKm": r["distance_km"],
            "durationLabel": r["duration_label"],
            "stopsCount": r["stops_count"],
            "summary": r["summary"],
            "status": r["status"],
            "tags": tags,
        })
    return presets


def get_preset_by_id(conn: sqlite3.Connection, preset_id: str) -> Optional[Dict[str, Any]]:
    presets = get_presets(conn, search=preset_id)
    for p in presets:
        if p["id"].lower() == preset_id.lower():
            return p
    return None


def get_checklist_with_blocks(
    conn: sqlite3.Connection,
    checklist_id: str,
    preset_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Returns checklist with nested blocks and items, including completion status."""
    cl_row = conn.execute(
        "SELECT * FROM checklists WHERE id = ?", (checklist_id,)
    ).fetchone()
    if not cl_row:
        return None

    # Load done items for this preset if provided
    done_set = set()
    if preset_id:
        done_rows = conn.execute(
            "SELECT item_id FROM mission_checklist_state WHERE preset_id = ? AND is_done = 1",
            (preset_id,),
        ).fetchall()
        done_set = {r["item_id"] for r in done_rows}

    blocks_rows = conn.execute(
        "SELECT * FROM checklist_blocks WHERE checklist_id = ? ORDER BY sort_order ASC",
        (checklist_id,),
    ).fetchall()

    blocks = []
    for b in blocks_rows:
        items_rows = conn.execute(
            "SELECT * FROM checklist_items WHERE block_id = ? ORDER BY sort_order ASC",
            (b["id"],),
        ).fetchall()

        items = []
        for it in items_rows:
            codes_rows = conn.execute(
                "SELECT code FROM checklist_item_codes WHERE item_id = ? ORDER BY code ASC",
                (it["id"],),
            ).fetchall()
            codes = [c["code"] for c in codes_rows]

            item_dict: Dict[str, Any] = {
                "id": it["id"],
                "title": it["title"],
                "detail": it["detail"],
                "codes": codes,
                "isDone": it["id"] in done_set,
            }
            if it["owner"]:
                item_dict["owner"] = it["owner"]
            if it["tag"]:
                item_dict["tag"] = it["tag"]
            items.append(item_dict)

        blocks.append({
            "id": b["id"],
            "title": b["title"],
            "when": b["when_window"],
            "items": items,
        })

    return {
        "id": cl_row["id"],
        "title": cl_row["title"],
        "phase": cl_row["phase"],
        "isBuiltin": bool(cl_row["is_builtin"]),
        "description": cl_row["description"],
        "blocks": blocks,
    }


def set_item_done(
    conn: sqlite3.Connection,
    preset_id: str,
    item_id: str,
    is_done: bool,
    completed_by: Optional[str] = "Astronaut",
    notes: Optional[str] = None,
) -> None:
    """Toggles or sets the completion status of a checklist item for a preset."""
    with conn:
        conn.execute(
            """
            INSERT INTO mission_checklist_state (preset_id, item_id, is_done, completed_by, notes, completed_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(preset_id, item_id) DO UPDATE SET
                is_done = excluded.is_done,
                completed_by = excluded.completed_by,
                notes = COALESCE(excluded.notes, mission_checklist_state.notes),
                completed_at = CASE WHEN excluded.is_done = 1 THEN datetime('now') ELSE NULL END
            """,
            (preset_id, item_id, 1 if is_done else 0, completed_by, notes),
        )


def reset_checklist_state(
    conn: sqlite3.Connection, preset_id: str, checklist_id: str
) -> int:
    """Resets all item states for a checklist and preset to unchecked (0)."""
    with conn:
        cursor = conn.execute(
            """
            UPDATE mission_checklist_state
            SET is_done = 0, completed_at = NULL
            WHERE preset_id = ? AND item_id IN (
                SELECT ci.id FROM checklist_items ci
                JOIN checklist_blocks cb ON ci.block_id = cb.id
                WHERE cb.checklist_id = ?
            )
            """,
            (preset_id, checklist_id),
        )
        return cursor.rowcount


def get_hold_criteria(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Returns hold criteria with associated taxonomy codes."""
    rows = conn.execute(
        "SELECT * FROM hold_criteria ORDER BY id ASC"
    ).fetchall()

    criteria = []
    for r in rows:
        c_rows = conn.execute(
            "SELECT code FROM hold_criteria_codes WHERE criteria_id = ? ORDER BY code ASC",
            (r["id"],),
        ).fetchall()
        criteria.append({
            "id": r["id"],
            "title": r["title"],
            "limit": r["limit_expr"],
            "status": r["status"],
            "source": r["source"],
            "codes": [c["code"] for c in c_rows],
        })
    return criteria


def get_hub_summary(
    conn: sqlite3.Connection, preset_id: str = "EVA-07"
) -> Dict[str, Any]:
    """Generates an aggregated payload for the complete Hub dashboard."""
    preset = get_preset_by_id(conn, preset_id)
    presets = get_presets(conn)
    hold_criteria = get_hold_criteria(conn)

    # Summarize checklist progress
    checklist_summaries = {}
    for cl_id in ("pre", "during", "post"):
        cl = get_checklist_with_blocks(conn, cl_id, preset_id=preset_id)
        if cl:
            total_items = sum(len(b["items"]) for b in cl["blocks"])
            done_items = sum(
                sum(1 for it in b["items"] if it.get("isDone")) for b in cl["blocks"]
            )
            checklist_summaries[cl_id] = {
                "total": total_items,
                "done": done_items,
                "percent": round((done_items / total_items * 100) if total_items else 0, 1),
            }

    return {
        "activePreset": preset,
        "presets": presets,
        "checklistProgress": checklist_summaries,
        "holdCriteriaCount": len(hold_criteria),
    }
