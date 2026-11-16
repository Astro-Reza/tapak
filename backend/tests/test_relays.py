"""Tests for Milestone 2: Configurable Mars Relay Satellites (MRS) Pass Simulation.

Covers:
- Topocentric azimuth calculations in orbit.py across cardinal directions and shapes
- Dynamic relay configuration via GET /comms/passes?relays=... and GET /comms/link?relays=...
- snake_case and camelCase key acceptance for Relay JSON
- Append vs replace constellation modes
- Multi-satellite pass simulation (5+ satellites) with relayId in each pass row
- Active pass trajectory sampling (azimuth, elevation, slant range, atmospheric loss, uplink margin)
- activePass, active_pass, and activePassTrack payload contracts for FOV HUD
- Error validation and 400 Bad Request handling for malformed or invalid relays
"""

from __future__ import annotations

import json
import math
import urllib.parse

import numpy as np
import pytest

from marswalk_api import create_app
from marswalk_api.comms import passes_payload
from marswalk_api.config import DEFAULT_RELAYS, Relay, Scenario, Site
from marswalk_api.link import atmos_loss_db, margin_db
from marswalk_api.orbit import (
    azimuth_deg,
    elevation_deg,
    lat_lon_to_vec,
    relay_positions,
    slant_range_km,
    topocentric_vectors,
)


@pytest.fixture(scope="module")
def client():
    return create_app({"TESTING": True, "SERVE_DIST": False}).test_client()


# ==============================================================================
# 1. Topocentric Azimuth Calculation Tests
# ==============================================================================


def test_azimuth_cardinal_directions():
    """Azimuth calculated for cardinal directions must exactly equal 0, 90, 180, 270 degrees."""
    site = Site(lat_deg=18.43, lon_deg=77.42)
    east, north, up = topocentric_vectors(site)

    # Unit checks
    assert np.isclose(np.linalg.norm(east), 1.0)
    assert np.isclose(np.linalg.norm(north), 1.0)
    assert np.isclose(np.linalg.norm(up), 1.0)
    assert np.isclose(np.dot(east, north), 0.0)
    assert np.isclose(np.dot(east, up), 0.0)
    assert np.isclose(np.dot(north, up), 0.0)
    # Right-handed coordinate frame: east x north = up
    assert np.allclose(np.cross(east, north), up)

    # Test North (0 deg)
    pt_north = up + north
    assert azimuth_deg(site, pt_north) == pytest.approx(0.0, abs=1e-5)

    # Test East (90 deg)
    pt_east = up + east
    assert azimuth_deg(site, pt_east) == pytest.approx(90.0, abs=1e-5)

    # Test South (180 deg)
    pt_south = up - north
    assert azimuth_deg(site, pt_south) == pytest.approx(180.0, abs=1e-5)

    # Test West (270 deg)
    pt_west = up - east
    assert azimuth_deg(site, pt_west) == pytest.approx(270.0, abs=1e-5)


def test_azimuth_intermediate_quadrants_and_elevations():
    """Azimuth in intermediate quadrants and at non-zero elevations must match geometry."""
    site = Site(lat_deg=0.0, lon_deg=0.0)
    east, north, up = topocentric_vectors(site)

    # NE (45 deg) with elevation
    pt_ne = up + north + east + 0.5 * up
    assert azimuth_deg(site, pt_ne) == pytest.approx(45.0, abs=1e-5)

    # SE (135 deg)
    pt_se = up - north + east
    assert azimuth_deg(site, pt_se) == pytest.approx(135.0, abs=1e-5)

    # SW (225 deg)
    pt_sw = up - north - east
    assert azimuth_deg(site, pt_sw) == pytest.approx(225.0, abs=1e-5)

    # NW (315 deg)
    pt_nw = up + north - east
    assert azimuth_deg(site, pt_nw) == pytest.approx(315.0, abs=1e-5)


def test_azimuth_multidimensional_arrays():
    """Azimuth must correctly handle 1D (3,), 2D (N, 3), and 3D (M, N, 3) arrays."""
    site = Site(lat_deg=18.43, lon_deg=77.42)
    east, north, up = topocentric_vectors(site)

    # 1D array
    pt_1d = up + east
    az_1d = azimuth_deg(site, pt_1d)
    assert np.asarray(az_1d).shape == ()
    assert float(az_1d) == pytest.approx(90.0, abs=1e-5)

    # 2D array (4, 3)
    pts_2d = np.stack([up + north, up + east, up - north, up - east], axis=0)
    az_2d = azimuth_deg(site, pts_2d)
    assert az_2d.shape == (4,)
    np.testing.assert_allclose(az_2d, [0.0, 90.0, 180.0, 270.0], atol=1e-5)

    # 3D array (2, 2, 3)
    pts_3d = pts_2d.reshape(2, 2, 3)
    az_3d = azimuth_deg(site, pts_3d)
    assert az_3d.shape == (2, 2)
    np.testing.assert_allclose(az_3d.flatten(), [0.0, 90.0, 180.0, 270.0], atol=1e-5)


def test_azimuth_orbit_trajectory_range():
    """Azimuth values across a realistic orbital trajectory must always lie in [0.0, 360.0)."""
    site = Site()
    relay = DEFAULT_RELAYS[0]
    t = np.arange(0, 3600, 15.0)
    pts = relay_positions(relay, t)
    azs = azimuth_deg(site, pts)

    assert len(azs) == len(t)
    assert np.all(azs >= 0.0)
    assert np.all(azs < 360.0)


# ==============================================================================
# 2. Configurable Relays via API & Scenario Overrides
# ==============================================================================


def test_scenario_with_overrides_relays():
    """Scenario.with_overrides cleanly accepts list or tuple of relays, maintaining hashability."""
    custom_relay = Relay("x1", "MRS-X1", 450.0, 60.0, 120.0, 30.0)
    scn = Scenario()
    scn_new = scn.with_overrides(relays=[custom_relay])

    assert isinstance(scn_new.relays, tuple)
    assert len(scn_new.relays) == 1
    assert scn_new.relays[0].id == "x1"
    # Scenario must remain hashable
    assert isinstance(hash(scn_new), int)


def test_api_relays_query_snake_case(client):
    """GET /comms/passes accepts relays JSON with snake_case keys (replace mode)."""
    custom = [
        {
            "id": "c1",
            "name": "MRS-C1",
            "altitude_km": 420.0,
            "inclination_deg": 60.0,
            "raan_deg": 85.0,
            "arg_lat_deg": 25.0,
        }
    ]
    r = client.get(f"/comms/passes?relays={urllib.parse.quote(json.dumps(custom))}")
    assert r.status_code == 200
    data = r.get_json()

    assert len(data["relays"]) == 1
    assert data["relays"][0]["id"] == "c1"
    assert data["relays"][0]["name"] == "MRS-C1"
    assert data["relays"][0]["altitudeKm"] == 420.0
    assert "1 relays" in data["constellation"]


def test_api_relays_query_camel_case(client):
    """GET /comms/passes accepts relays JSON with camelCase keys."""
    custom = [
        {
            "id": "c2",
            "name": "MRS-C2",
            "altitudeKm": 480.0,
            "inclinationDeg": 55.0,
            "raanDeg": 140.0,
            "argLatDeg": 75.0,
        }
    ]
    r = client.get(f"/comms/passes?relays={urllib.parse.quote(json.dumps(custom))}")
    assert r.status_code == 200
    data = r.get_json()

    assert len(data["relays"]) == 1
    assert data["relays"][0]["id"] == "c2"
    assert data["relays"][0]["altitudeKm"] == 480.0


def test_api_relays_mode_append(client):
    """GET /comms/passes with mode=append appends custom relays to the default constellation."""
    custom = [
        {
            "id": "l5",
            "name": "MRS-L5",
            "altitude_km": 500.0,
            "inclination_deg": 65.0,
            "raan_deg": 110.0,
            "arg_lat_deg": 45.0,
        }
    ]
    r = client.get(f"/comms/passes?relays={urllib.parse.quote(json.dumps(custom))}&mode=append")
    assert r.status_code == 200
    data = r.get_json()

    assert len(data["relays"]) == 5
    relay_ids = [rel["id"] for rel in data["relays"]]
    assert relay_ids == ["l1", "l2", "l3", "l4", "l5"]
    assert "5 relays" in data["constellation"]


def test_api_relays_query_on_comms_link(client):
    """GET /comms/link also accepts custom relays query parameter."""
    custom = [
        {
            "id": "c3",
            "name": "MRS-C3",
            "altitude_km": 550.0,
            "inclination_deg": 70.0,
            "raan_deg": 40.0,
            "arg_lat_deg": 10.0,
        }
    ]
    r = client.get(f"/comms/link?relays={urllib.parse.quote(json.dumps(custom))}")
    assert r.status_code == 200
    data = r.get_json()
    assert "link" in data
    assert "budgets" in data


# ==============================================================================
# 3. Multi-Satellite Pass Detection & Pass Row relayId Tests
# ==============================================================================


def test_multi_satellite_constellation_5_plus_passes():
    """Constellation of 6 satellites produces valid passes and each pass row includes relayId."""
    r5 = Relay("l5", "MRS-L5", 450.0, 60.0, 100.0, 40.0)
    r6 = Relay("l6", "MRS-L6", 450.0, 60.0, 280.0, 220.0)
    scn = Scenario(relays=(*DEFAULT_RELAYS, r5, r6))

    payload = passes_payload(scn)
    assert len(payload["relays"]) == 6
    assert "6 relays" in payload["constellation"]

    passes = payload["passes"]
    assert len(passes) >= 1
    for p in passes:
        assert "relayId" in p
        assert p["relayId"] in {"l1", "l2", "l3", "l4", "l5", "l6"}
        assert "relay_id" in p
        assert p["relay_id"] == p["relayId"]


# ==============================================================================
# 4. Active Pass & Trajectory Sampling (FOV HUD Contract)
# ==============================================================================


def test_active_pass_and_trajectory_sampling():
    """passes_payload provides activePass, active_pass, and activePassTrack with complete telemetry."""
    scn = Scenario()
    payload = passes_payload(scn)

    assert "activePass" in payload
    assert "active_pass" in payload
    assert "activePassTrack" in payload

    ap = payload["activePass"]
    assert ap is not None
    assert set(ap.keys()) >= {"relayId", "relayName", "startS", "endS", "maxElevationDeg", "track"}

    # active_pass snake_case mirror
    ap_snake = payload["active_pass"]
    assert ap_snake is not None
    assert ap_snake["relay_id"] == ap["relayId"]
    assert ap_snake["max_elevation_deg"] == ap["maxElevationDeg"]

    track = payload["activePassTrack"]
    assert len(track) >= 5
    assert track == ap["track"]

    for pt in track:
        # Check camelCase fields required by FOV HUD
        assert "az" in pt and 0.0 <= pt["az"] < 360.0
        assert "el" in pt and pt["el"] >= scn.horizon_mask_deg
        assert "marginDb" in pt and math.isfinite(pt["marginDb"])
        assert "timeS" in pt and math.isfinite(pt["timeS"])
        assert "atmosLossDb" in pt and pt["atmosLossDb"] > 0.0
        assert "slantRangeKm" in pt and pt["slantRangeKm"] >= 400.0

        # Check snake_case mirror fields
        assert pt["azimuth_deg"] == pt["az"]
        assert pt["elevation_deg"] == pt["el"]
        assert pt["uplink_margin_db"] == pt["marginDb"]
        assert pt["time_s"] == pt["timeS"]
        assert pt["atmos_loss_db"] == pt["atmosLossDb"]
        assert pt["slant_range_km"] == pt["slantRangeKm"]

        # Verify physics: atmospheric loss strictly matches model (accounting for el display rounding)
        expected_loss = float(atmos_loss_db(pt["el"], scn.uplink.atmos_zenith_db))
        assert pt["atmos_loss_db"] == pytest.approx(expected_loss, abs=0.25)


# ==============================================================================
# 5. Bad Request Validation Tests (400 Responses)
# ==============================================================================


def test_invalid_relays_malformed_json(client):
    """Malformed JSON returns 400 Bad Request."""
    r = client.get("/comms/passes?relays={invalid_json")
    assert r.status_code == 400
    assert "error" in r.get_json()


def test_invalid_relays_not_array_or_object(client):
    """Primitive values (string, number) return 400 Bad Request."""
    r1 = client.get("/comms/passes?relays=123")
    assert r1.status_code == 400

    r2 = client.get('/comms/passes?relays="hello"')
    assert r2.status_code == 400


def test_invalid_relays_empty_array(client):
    """Empty JSON array returns 400 Bad Request."""
    r = client.get("/comms/passes?relays=[]")
    assert r.status_code == 400


def test_invalid_relays_element_not_dict(client):
    """Array containing non-dict elements returns 400 Bad Request."""
    r = client.get("/comms/passes?relays=[123]")
    assert r.status_code == 400


def test_invalid_relays_missing_required_fields(client):
    """Relay missing required attributes returns 400 Bad Request."""
    incomplete = [{"id": "m1", "name": "MRS-1"}]
    r = client.get(f"/comms/passes?relays={urllib.parse.quote(json.dumps(incomplete))}")
    assert r.status_code == 400
    assert "missing" in r.get_json()["error"].lower()


def test_invalid_relays_empty_id_or_name(client):
    """Relay with empty id or name returns 400 Bad Request."""
    empty_id = [
        {"id": "   ", "name": "MRS-1", "altitudeKm": 400, "inclinationDeg": 60, "raanDeg": 0, "argLatDeg": 0}
    ]
    r = client.get(f"/comms/passes?relays={urllib.parse.quote(json.dumps(empty_id))}")
    assert r.status_code == 400


def test_invalid_relays_non_positive_altitude(client):
    """Relay with zero or negative altitude returns 400 Bad Request."""
    neg_alt = [
        {"id": "m1", "name": "MRS-1", "altitudeKm": -50.0, "inclinationDeg": 60, "raanDeg": 0, "argLatDeg": 0}
    ]
    r1 = client.get(f"/comms/passes?relays={urllib.parse.quote(json.dumps(neg_alt))}")
    assert r1.status_code == 400

    zero_alt = [
        {"id": "m1", "name": "MRS-1", "altitudeKm": 0.0, "inclinationDeg": 60, "raanDeg": 0, "argLatDeg": 0}
    ]
    r2 = client.get(f"/comms/passes?relays={urllib.parse.quote(json.dumps(zero_alt))}")
    assert r2.status_code == 400


def test_invalid_relays_non_finite_values(client):
    """Relay with non-finite or non-numeric parameters returns 400 Bad Request."""
    bad_inc = [
        {"id": "m1", "name": "MRS-1", "altitudeKm": 400, "inclinationDeg": "abc", "raanDeg": 0, "argLatDeg": 0}
    ]
    r = client.get(f"/comms/passes?relays={urllib.parse.quote(json.dumps(bad_inc))}")
    assert r.status_code == 400


def test_invalid_mode_parameter(client):
    """Unknown mode query parameter returns 400 Bad Request."""
    custom = [
        {"id": "m1", "name": "MRS-1", "altitudeKm": 400, "inclinationDeg": 60, "raanDeg": 0, "argLatDeg": 0}
    ]
    r = client.get(f"/comms/passes?relays={urllib.parse.quote(json.dumps(custom))}&mode=superimpose")
    assert r.status_code == 400
    assert "unknown mode" in r.get_json()["error"].lower()
