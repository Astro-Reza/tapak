"""Hub API contract tests. Each run seeds a throwaway database."""

from __future__ import annotations

import pytest

from marswalk_api import create_app, hub_db


@pytest.fixture()
def client(tmp_path):
    db = tmp_path / "hub.db"
    hub_db.init_db(db).close()
    app = create_app({"TESTING": True, "SERVE_DIST": False, "HUB_DB_PATH": db})
    return app.test_client()


def test_presets_and_filters(client):
    all_presets = client.get("/hub/presets").get_json()
    assert all_presets and {"id", "name", "sol", "status", "tags", "policyId"} <= set(all_presets[0])
    hit = client.get("/hub/presets?search=" + all_presets[0]["id"].lower()).get_json()
    assert any(p["id"] == all_presets[0]["id"] for p in hit)
    status = all_presets[0]["status"]
    by_status = client.get(f"/hub/presets?status={status.lower()}").get_json()
    assert by_status and all(p["status"] == status for p in by_status)
    assert client.get("/hub/presets?status=bogus").status_code == 400


def test_preset_detail(client):
    assert client.get("/hub/presets/EVA-07").get_json()["id"] == "EVA-07"
    assert client.get("/hub/presets/nope").status_code == 404


def test_checklist_nested_with_state(client):
    d = client.get("/hub/checklists/pre?preset_id=EVA-07").get_json()
    assert d["id"] == "pre" and d["blocks"] and d["blocks"][0]["items"]
    assert any(it["isDone"] for b in d["blocks"] for it in b["items"])
    plain = client.get("/hub/checklists/pre").get_json()
    assert not any(it["isDone"] for b in plain["blocks"] for it in b["items"])
    assert client.get("/hub/checklists/none").status_code == 404
    assert client.get("/hub/checklists/pre?preset_id=nope").status_code == 404


def test_toggle_flips_and_sets(client):
    url = "/hub/checklists/EVA-07/items/pre-1.1/toggle"
    first = client.post(url).get_json()
    assert first["isDone"] is False  # seeded as done
    assert client.post(url).get_json()["isDone"] is True
    assert client.post(url, json={"isDone": False}).get_json()["isDone"] is False
    assert client.post(url, json={"isDone": "yes"}).status_code == 400
    item = next(
        it for b in client.get("/hub/checklists/pre?preset_id=EVA-07").get_json()["blocks"]
        for it in b["items"] if it["id"] == "pre-1.1"
    )
    assert item["isDone"] is False
    assert client.post("/hub/checklists/EVA-07/items/zzz/toggle").status_code == 404
    assert client.post("/hub/checklists/nope/items/pre-1.1/toggle").status_code == 404


def test_hold_criteria(client):
    d = client.get("/hub/hold-criteria").get_json()
    assert d and {"id", "title", "limit", "status", "source", "codes"} <= set(d[0])


def test_summary(client):
    d = client.get("/hub/summary").get_json()
    assert d["activePreset"]["id"] == "EVA-07"
    assert set(d["checklistProgress"]) == {"pre", "during", "post"}
    assert d["holdCriteriaCount"] > 0
    assert client.get("/hub/summary?preset_id=nope").status_code == 404
