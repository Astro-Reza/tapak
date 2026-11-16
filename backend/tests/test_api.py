"""API contract and model sanity tests. Run from marswalk/backend: python -m pytest"""

from __future__ import annotations

import math

import numpy as np
import pytest

from marswalk_api import create_app
from marswalk_api.config import DOWNLINK, UPLINK, Site
from marswalk_api.layout import y_of
from marswalk_api.link import fit_gamma, margin_db, regularized_gamma_p, theta_min_deg
from marswalk_api.orbit import elevation_deg, lat_lon_to_vec, slant_range_km


@pytest.fixture(scope="module")
def client():
    return create_app({"TESTING": True, "SERVE_DIST": False}).test_client()


# ---------- contract: the keys src/data/comms.ts expects ----------


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.get_json()["status"] == "ok"


def test_passes_shape(client):
    r = client.get("/comms/passes")
    assert r.status_code == 200
    d = r.get_json()
    assert set(d) >= {"site", "constellation", "relays", "passes", "summary", "contactWindows"}
    assert set(d["site"]) >= {"name", "latDeg", "lonDeg", "coordinate", "localSolarHour", "stats"}
    assert {r["id"] for r in d["relays"]} == {"l1", "l2", "l3", "l4"}
    for key in ("altitudeKm", "inclinationDeg", "raanDeg", "argLatDeg"):
        assert all(isinstance(r[key], (int, float)) for r in d["relays"])
    assert 1 <= len(d["passes"]) <= 5
    for p in d["passes"]:
        assert set(p) >= {"id", "name", "window", "maxElevation", "margin", "state", "relayId"}
        assert p["state"] in {"in-view", "next", "later"}
    assert sum(p["state"] == "next" for p in d["passes"]) <= 1
    cw = d["contactWindows"]
    assert cw["minutes"] == 360 and 0 <= cw["now"] < cw["minutes"]
    assert all(0 <= p["start"] < cw["minutes"] for p in cw["passes"])


def test_link_shape(client):
    d = client.get("/comms/link").get_json()
    link = d["link"]
    assert len(link["wedgeShade"]) == 30
    assert all(v is None or 0 < v <= 1 for v in link["wedgeShade"])
    assert link["wedgeShade"][0] is None and link["wedgeShade"][-1] is not None
    assert len(link["stats"]) == 7
    assert d["passCount"] > 100
    assert len(d["budgets"]) == 2
    for b in d["budgets"]:
        assert [s["label"] for s in b["stages"]] == ["Pt", "Gt", "FSPL", "Atmos", "Dust", "Point", "Gr", "E[Pr]"]
        assert b["status"] in {"safe", "caution", "danger"}
        assert all(s["height"] >= 0 for s in b["stages"])


def test_overrides_and_validation(client):
    a = client.get("/comms/passes").get_json()
    b = client.get("/comms/passes?now=10.5").get_json()
    assert b["site"]["localSolarHour"] == 10.5 and a["passes"] != b["passes"]
    assert client.get("/comms/passes?lat=abc").status_code == 400
    assert client.get("/comms/link?lat=95").status_code == 400
    assert client.get("/comms/link?eva_start=17&eva_end=16").status_code == 400


def test_cors_header(client):
    r = client.get("/comms/link", headers={"Origin": "http://localhost:5173"})
    assert r.headers["Access-Control-Allow-Origin"] in {"*", "http://localhost:5173"}


def test_unknown_route_is_json_404(client):
    r = client.get("/nope")
    assert r.status_code == 404 and r.get_json()["error"] == "not found"


# ---------- model ----------


def test_overhead_relay_is_at_zenith():
    site = Site(lat_deg=18.43, lon_deg=77.42)
    above = lat_lon_to_vec(site.lat_deg, site.lon_deg, 1.2)[None, :]
    assert elevation_deg(site, above)[0] == pytest.approx(90.0)


def test_slant_range_limits():
    assert slant_range_km(90.0, 400) == pytest.approx(400.0)
    assert slant_range_km(0.0, 400) > slant_range_km(30.0, 400) > 400


def test_theta_min_is_zero_margin():
    for side in (DOWNLINK, UPLINK):
        t = theta_min_deg(side, 400, 401.6)
        assert 0 < t < 90
        assert margin_db(side, t, 400, 401.6) == pytest.approx(0.0, abs=1e-6)


def test_gamma_cdf_against_exponential():
    # Shape 1 is the exponential distribution: P(1, x) = 1 - exp(-x).
    for x in (0.1, 1.0, 3.0, 10.0):
        assert regularized_gamma_p(1.0, x) == pytest.approx(1 - math.exp(-x), rel=1e-10)


def test_gamma_fit_recovers_parameters():
    rng = np.random.default_rng(0)
    fit = fit_gamma(rng.gamma(2.4, 14.8, 200_000))
    assert fit.k == pytest.approx(2.4, rel=0.02) and fit.scale == pytest.approx(14.8, rel=0.02)


def test_axis_matches_figma_frame():
    # Values read off the Figma frame: 0 dBW at y 84, +10 at 44, −125 at 132, −131 (Pth) at 180.
    assert (y_of(0), y_of(10), y_of(-125), y_of(-131)) == (84, 44, 132, 180)
