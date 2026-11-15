"""Hub page routes, backed by hub_db.py (Turso, or a local SQLite file).

  GET  /hub/presets                  ?search=&status=
  GET  /hub/presets/<id>
  GET  /hub/checklists/<id>          ?preset_id=EVA-07   (id: pre | during | post)
  POST /hub/checklists/<preset_id>/items/<item_id>/toggle
                                     optional JSON {"isDone": bool} to set instead of flip
  GET  /hub/hold-criteria
  GET  /hub/summary                  ?preset_id=EVA-07
"""

from __future__ import annotations

import sqlite3

from flask import Blueprint, current_app, g, jsonify, request

from . import hub_db

hub_bp = Blueprint("hub", __name__, url_prefix="/hub")

STATUSES = {"active": "Active", "ready": "Ready", "planned": "Planned"}


def get_db() -> hub_db.Connection:
    """Config HUB_DB_PATH (a SQLite file) wins; otherwise Turso when
    TURSO_DATABASE_URL is set, else the bundled marswalk_hub.db.
    SQLite opens one connection per request; Turso reuses a shared one."""
    if "hub_db" not in g:
        g.hub_db = hub_db.connect(current_app.config.get("HUB_DB_PATH"))
    return g.hub_db


@hub_bp.teardown_request
def close_db(_exc):
    conn = g.pop("hub_db", None)
    if conn is not None:
        conn.close()


@hub_bp.errorhandler(sqlite3.Error)
def db_error(err: sqlite3.Error):
    current_app.logger.error("hub db error: %s", err)
    return jsonify(error="hub database unavailable"), 503


def _not_found(what: str):
    return jsonify(error=f"{what} not found"), 404


@hub_bp.get("/presets")
def presets():
    status = request.args.get("status", "").strip()
    if status:
        canonical = STATUSES.get(status.lower())
        if canonical is None:
            return jsonify(error=f"'status' must be one of {', '.join(STATUSES.values())}"), 400
        status = canonical
    search = request.args.get("search", "").strip() or None
    return jsonify(hub_db.get_presets(get_db(), status=status or None, search=search))


@hub_bp.get("/presets/<preset_id>")
def preset(preset_id: str):
    found = hub_db.get_preset_by_id(get_db(), preset_id)
    return jsonify(found) if found else _not_found("preset")


@hub_bp.get("/checklists/<checklist_id>")
def checklist(checklist_id: str):
    preset_id = request.args.get("preset_id", "").strip() or None
    conn = get_db()
    if preset_id and hub_db.get_preset_by_id(conn, preset_id) is None:
        return _not_found("preset")
    found = hub_db.get_checklist_with_blocks(conn, checklist_id, preset_id=preset_id)
    return jsonify(found) if found else _not_found("checklist")


@hub_bp.post("/checklists/<preset_id>/items/<item_id>/toggle")
def toggle_item(preset_id: str, item_id: str):
    conn = get_db()
    found = hub_db.get_preset_by_id(conn, preset_id)
    if found is None:
        return _not_found("preset")
    if not hub_db.checklist_item_exists(conn, item_id):
        return _not_found("checklist item")

    body = request.get_json(silent=True) or {}
    if "isDone" in body:
        if not isinstance(body["isDone"], bool):
            return jsonify(error="'isDone' must be true or false"), 400
        is_done = body["isDone"]
    else:
        is_done = not hub_db.get_item_done(conn, found["id"], item_id)

    hub_db.set_item_done(conn, found["id"], item_id, is_done)
    return jsonify(presetId=found["id"], itemId=item_id, isDone=is_done)


@hub_bp.get("/hold-criteria")
def hold_criteria():
    return jsonify(hub_db.get_hold_criteria(get_db()))


@hub_bp.get("/summary")
def summary():
    preset_id = request.args.get("preset_id", "EVA-07").strip()
    conn = get_db()
    if hub_db.get_preset_by_id(conn, preset_id) is None:
        return _not_found("preset")
    return jsonify(hub_db.get_hub_summary(conn, preset_id))
