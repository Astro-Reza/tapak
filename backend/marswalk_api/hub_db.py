"""Database access layer and seed utilities for Marswalk Hub page data.

Manages mission presets, operational checklists (Pre, During, Post EVA),
checklist execution states per preset, and mission hold criteria.

Two backends share the same SQL:
  * a local SQLite file (tests, offline dev) via ``get_connection(path)``
  * Turso (libSQL over HTTPS) via ``connect()`` when TURSO_DATABASE_URL is set

Reads are a handful of bulk queries (no per-row round-trips, which matter over
HTTP). With Turso, the static catalogue (presets, checklist structure, hold
criteria) is cached in Upstash Redis; checklist state is always read live.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union

from .cache import NullCache, get_cache
from .turso import TursoConnection

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "marswalk_hub.db"
SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schema_hub.sql"
SEED_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "hub_dummy_data.json"

Connection = Union[sqlite3.Connection, TursoConnection]
Statement = Tuple[str, Sequence[Any]]
BUILTIN_CHECKLISTS = ("pre", "during", "post")

_turso: Optional[TursoConnection] = None


def turso_configured() -> bool:
    return bool(os.environ.get("TURSO_DATABASE_URL"))


def get_connection(db_path: Optional[Path] = None) -> sqlite3.Connection:
    """Local SQLite connection (default: the bundled marswalk_hub.db)."""
    path = db_path or DEFAULT_DB_PATH
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_turso() -> TursoConnection:
    """Process-wide Turso connection (keep-alive is reused while warm)."""
    global _turso
    if _turso is None:
        _turso = TursoConnection.from_env()
    return _turso


def connect(db_path: Optional[Path] = None) -> Connection:
    """An explicit path wins; otherwise Turso if configured, else the local file."""
    if db_path is None and turso_configured():
        return get_turso()
    return get_connection(db_path)


def _cache_for(conn: Connection) -> NullCache:
    # Only the shared Turso database is cached; local files are per-process.
    return get_cache() if isinstance(conn, TursoConnection) else NullCache()


def _query_many(conn: Connection, statements: Iterable[Statement]) -> List[list]:
    if isinstance(conn, TursoConnection):
        return conn.query_many(statements)
    return [conn.execute(sql, params).fetchall() for sql, params in statements]


def _run_batch(conn: Connection, statements: List[Statement]) -> None:
    """Apply writes atomically: one Turso request, or one SQLite transaction."""
    if isinstance(conn, TursoConnection):
        conn.batch(statements)
        return
    with conn:
        for sql, params in statements:
            conn.execute(sql, params)


def init_db(
    db_path: Optional[Path] = None, seed: bool = True, conn: Optional[Connection] = None
) -> Connection:
    """Creates tables from schema and optionally loads initial seed data.

    Pass ``conn=get_turso()`` to initialise the Turso database instead of a file.
    """
    conn = conn or get_connection(db_path)
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = f.read()
    if isinstance(conn, TursoConnection):
        conn.executescript(schema)
    else:
        with conn:
            conn.executescript(schema)
    if seed:
        seed_db(conn)
    return conn


def seed_statements(data: Dict[str, Any]) -> List[Statement]:
    """INSERT statements for the seed JSON (presets, checklists, state, holds)."""
    out: List[Statement] = []

    # 1. Mission Presets & Tags
    for p in data.get("mission_presets", []):
        out.append((
            """
            INSERT OR REPLACE INTO mission_presets (
                id, name, site, sol, coordinates, mode, policy_id, science_id,
                start_lmst, distance_km, duration_label, stops_count, summary, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                p["id"], p["name"], p["site"], p["sol"], p["coordinates"], p["mode"],
                p["policy_id"], p["science_id"], float(p["start_lmst"]), float(p["distance_km"]),
                p["duration_label"], p["stops_count"], p["summary"], p.get("status", "Planned"),
            ),
        ))
        for tag in p.get("tags", []):
            out.append((
                "INSERT OR IGNORE INTO mission_preset_tags (preset_id, tag) VALUES (?, ?)",
                (p["id"], tag),
            ))

    # 2. Checklists, Blocks, Items, and Codes
    for cl in data.get("checklists", []):
        out.append((
            "INSERT OR REPLACE INTO checklists (id, title, phase, is_builtin, description) "
            "VALUES (?, ?, ?, ?, ?)",
            (cl["id"], cl["title"], cl["phase"], 1 if cl.get("is_builtin", True) else 0,
             cl.get("description", "")),
        ))
        for b_idx, block in enumerate(cl.get("blocks", [])):
            out.append((
                "INSERT OR REPLACE INTO checklist_blocks (id, checklist_id, title, when_window, sort_order) "
                "VALUES (?, ?, ?, ?, ?)",
                (block["id"], cl["id"], block["title"], block.get("when"), b_idx),
            ))
            for i_idx, item in enumerate(block.get("items", [])):
                out.append((
                    "INSERT OR REPLACE INTO checklist_items (id, block_id, title, detail, owner, tag, sort_order) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (item["id"], block["id"], item["title"], item.get("detail"),
                     item.get("owner"), item.get("tag"), i_idx),
                ))
                for code in item.get("codes", []):
                    if code:
                        out.append((
                            "INSERT OR IGNORE INTO checklist_item_codes (item_id, code) VALUES (?, ?)",
                            (item["id"], code),
                        ))

    # 3. Mission Checklist States
    for state in data.get("mission_checklist_states", []):
        out.append((
            """
            INSERT OR REPLACE INTO mission_checklist_state (
                preset_id, item_id, is_done, completed_by, notes, completed_at
            ) VALUES (?, ?, ?, ?, ?, datetime('now'))
            """,
            (state["preset_id"], state["item_id"], 1 if state.get("is_done") else 0,
             state.get("completed_by"), state.get("notes")),
        ))

    # 4. Hold Criteria & Codes
    for hc in data.get("hold_criteria", []):
        out.append((
            "INSERT OR REPLACE INTO hold_criteria (id, title, limit_expr, status, source) VALUES (?, ?, ?, ?, ?)",
            (hc["id"], hc["title"], hc["limit"], hc["status"], hc["source"]),
        ))
        for code in hc.get("codes", []):
            if code:
                out.append((
                    "INSERT OR IGNORE INTO hold_criteria_codes (criteria_id, code) VALUES (?, ?)",
                    (hc["id"], code),
                ))
    return out


def seed_db(conn: Connection, seed_file: Optional[Path] = None) -> None:
    """Populates database with dummy data from hub_dummy_data.json."""
    path = seed_file or SEED_DATA_PATH
    if not path.is_file():
        raise FileNotFoundError(f"Seed data file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    _run_batch(conn, seed_statements(data))
    _cache_for(conn).invalidate()


# -----------------------------------------------------------------------------
# Catalogue loaders (static data; cached when backed by Turso)
# -----------------------------------------------------------------------------

def _load_presets(conn: Connection) -> List[Dict[str, Any]]:
    rows, tag_rows = _query_many(conn, [
        ("SELECT * FROM mission_presets ORDER BY sol ASC, id ASC", ()),
        ("SELECT preset_id, tag FROM mission_preset_tags ORDER BY tag ASC", ()),
    ])
    tags: Dict[str, List[str]] = {}
    for t in tag_rows:
        tags.setdefault(t["preset_id"], []).append(t["tag"])
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "site": r["site"],
            "sol": r["sol"],
            "coordinates": r["coordinates"],
            "mode": r["mode"],
            "policyId": r["policy_id"],
            "scienceId": r["science_id"],
            "startLmst": float(r["start_lmst"]),
            "distanceKm": float(r["distance_km"]),
            "durationLabel": r["duration_label"],
            "stopsCount": r["stops_count"],
            "summary": r["summary"],
            "status": r["status"],
            "tags": tags.get(r["id"], []),
        }
        for r in rows
    ]


def _load_checklist(conn: Connection, checklist_id: str) -> Optional[Dict[str, Any]]:
    """Checklist with nested blocks and items, without completion state."""
    cl_rows, block_rows, item_rows, code_rows = _query_many(conn, [
        ("SELECT * FROM checklists WHERE id = ?", (checklist_id,)),
        ("SELECT * FROM checklist_blocks WHERE checklist_id = ? ORDER BY sort_order ASC", (checklist_id,)),
        (
            "SELECT ci.* FROM checklist_items ci JOIN checklist_blocks cb ON ci.block_id = cb.id "
            "WHERE cb.checklist_id = ? ORDER BY ci.sort_order ASC",
            (checklist_id,),
        ),
        (
            "SELECT cc.item_id, cc.code FROM checklist_item_codes cc "
            "JOIN checklist_items ci ON cc.item_id = ci.id "
            "JOIN checklist_blocks cb ON ci.block_id = cb.id "
            "WHERE cb.checklist_id = ? ORDER BY cc.code ASC",
            (checklist_id,),
        ),
    ])
    if not cl_rows:
        return None
    cl_row = cl_rows[0]

    codes: Dict[str, List[str]] = {}
    for c in code_rows:
        codes.setdefault(c["item_id"], []).append(c["code"])

    items_by_block: Dict[str, List[Dict[str, Any]]] = {}
    for it in item_rows:
        item: Dict[str, Any] = {
            "id": it["id"],
            "title": it["title"],
            "detail": it["detail"],
            "codes": codes.get(it["id"], []),
            "isDone": False,
        }
        if it["owner"]:
            item["owner"] = it["owner"]
        if it["tag"]:
            item["tag"] = it["tag"]
        items_by_block.setdefault(it["block_id"], []).append(item)

    return {
        "id": cl_row["id"],
        "title": cl_row["title"],
        "phase": cl_row["phase"],
        "isBuiltin": bool(cl_row["is_builtin"]),
        "description": cl_row["description"],
        "blocks": [
            {
                "id": b["id"],
                "title": b["title"],
                "when": b["when_window"],
                "items": items_by_block.get(b["id"], []),
            }
            for b in block_rows
        ],
    }


def _load_hold_criteria(conn: Connection) -> List[Dict[str, Any]]:
    rows, code_rows = _query_many(conn, [
        ("SELECT * FROM hold_criteria ORDER BY id ASC", ()),
        ("SELECT criteria_id, code FROM hold_criteria_codes ORDER BY code ASC", ()),
    ])
    codes: Dict[str, List[str]] = {}
    for c in code_rows:
        codes.setdefault(c["criteria_id"], []).append(c["code"])
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "limit": r["limit_expr"],
            "status": r["status"],
            "source": r["source"],
            "codes": codes.get(r["id"], []),
        }
        for r in rows
    ]


def _done_items(conn: Connection, preset_id: str) -> set:
    rows = conn.execute(
        "SELECT item_id FROM mission_checklist_state WHERE preset_id = ? AND is_done = 1",
        (preset_id,),
    ).fetchall()
    return {r["item_id"] for r in rows}


def _with_state(checklist: Dict[str, Any], done: set) -> Dict[str, Any]:
    return {
        **checklist,
        "blocks": [
            {**b, "items": [{**it, "isDone": it["id"] in done} for it in b["items"]]}
            for b in checklist["blocks"]
        ],
    }


# -----------------------------------------------------------------------------
# Query Helpers
# -----------------------------------------------------------------------------

def get_presets(
    conn: Connection,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Returns list of mission presets formatted matching frontend MissionPreset."""
    presets = _cache_for(conn).get_or_load("presets", lambda: _load_presets(conn))
    if status:
        presets = [p for p in presets if p["status"] == status]
    if search:
        s = search.lower()
        presets = [
            p for p in presets
            if any(s in str(p[k]).lower() for k in ("id", "name", "site", "summary", "mode", "sol"))
        ]
    return presets


def get_preset_by_id(conn: Connection, preset_id: str) -> Optional[Dict[str, Any]]:
    wanted = preset_id.lower()
    return next((p for p in get_presets(conn) if p["id"].lower() == wanted), None)


def get_checklist_with_blocks(
    conn: Connection,
    checklist_id: str,
    preset_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Returns checklist with nested blocks and items, including completion status."""
    checklist = _cache_for(conn).get_or_load(
        f"checklist:{checklist_id}", lambda: _load_checklist(conn, checklist_id)
    )
    if checklist is None:
        return None
    return _with_state(checklist, _done_items(conn, preset_id) if preset_id else set())


def checklist_item_exists(conn: Connection, item_id: str) -> bool:
    return conn.execute("SELECT 1 FROM checklist_items WHERE id = ?", (item_id,)).fetchone() is not None


def get_item_done(conn: Connection, preset_id: str, item_id: str) -> bool:
    row = conn.execute(
        "SELECT is_done FROM mission_checklist_state WHERE preset_id = ? AND item_id = ?",
        (preset_id, item_id),
    ).fetchone()
    return bool(row and row["is_done"])


def set_item_done(
    conn: Connection,
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


def reset_checklist_state(conn: Connection, preset_id: str, checklist_id: str) -> int:
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


def get_hold_criteria(conn: Connection) -> List[Dict[str, Any]]:
    """Returns hold criteria with associated taxonomy codes."""
    return _cache_for(conn).get_or_load("hold-criteria", lambda: _load_hold_criteria(conn))


def get_hub_summary(conn: Connection, preset_id: str = "EVA-07") -> Dict[str, Any]:
    """Generates an aggregated payload for the complete Hub dashboard."""
    presets = get_presets(conn)
    wanted = preset_id.lower()
    preset = next((p for p in presets if p["id"].lower() == wanted), None)
    hold_criteria = get_hold_criteria(conn)
    done = _done_items(conn, preset["id"] if preset else preset_id)

    checklist_summaries = {}
    for cl_id in BUILTIN_CHECKLISTS:
        cl = get_checklist_with_blocks(conn, cl_id)
        if cl:
            ids = [it["id"] for b in cl["blocks"] for it in b["items"]]
            done_items = sum(1 for i in ids if i in done)
            checklist_summaries[cl_id] = {
                "total": len(ids),
                "done": done_items,
                "percent": round((done_items / len(ids) * 100) if ids else 0, 1),
            }

    return {
        "activePreset": preset,
        "presets": presets,
        "checklistProgress": checklist_summaries,
        "holdCriteriaCount": len(hold_criteria),
    }
