"""Tests for elevation-dependent atmospheric loss and link budget margin corrections."""

from __future__ import annotations

import math
import numpy as np
import pytest

from marswalk_api import create_app
from marswalk_api.config import DOWNLINK, UPLINK, LinkSide
from marswalk_api.layout import MINUS, budget_chart, layout_waterfall
from marswalk_api.link import (
    ATMOS_FLOOR_DEG,
    GammaFit,
    SideResult,
    atmos_loss_db,
    evaluate_side,
    margin_db,
    received_dbw,
    theta_min_deg,
)


@pytest.fixture(scope="module")
def client():
    return create_app({"TESTING": True, "SERVE_DIST": False}).test_client()


def test_atmospheric_loss_across_elevations():
    """Verify atmospheric loss A_Atm(θ) = A_zenith / sin(max(θ, θ_floor))."""
    zenith = 0.3

    # At 90 deg: sin(90°) = 1.0 => A_Atm = zenith
    assert atmos_loss_db(90.0, zenith) == pytest.approx(0.3, abs=1e-7)

    # At 30 deg: sin(30°) = 0.5 => A_Atm = 0.3 / 0.5 = 0.6 dB
    assert atmos_loss_db(30.0, zenith) == pytest.approx(0.6, abs=1e-7)

    # At 5 deg: sin(5°) ≈ 0.08715574 => A_Atm ≈ 3.441865 dB
    expected_5 = 0.3 / math.sin(math.radians(5.0))
    assert atmos_loss_db(5.0, zenith) == pytest.approx(expected_5, abs=1e-6)

    # At 0.5 deg (floor): sin(0.5°) ≈ 0.008726535 => A_Atm ≈ 34.377468 dB
    expected_05 = 0.3 / math.sin(math.radians(0.5))
    assert atmos_loss_db(0.5, zenith) == pytest.approx(expected_05, abs=1e-5)

    # Below floor: elevation <= 0.5 should be clamped to 0.5 deg
    assert atmos_loss_db(0.0, zenith) == pytest.approx(expected_05, abs=1e-5)
    assert atmos_loss_db(-5.0, zenith) == pytest.approx(expected_05, abs=1e-5)

    # Custom zenith loss
    assert atmos_loss_db(30.0, zenith_loss_db=0.5) == pytest.approx(1.0, abs=1e-7)

    # Vectorized evaluation
    angles = np.array([0.5, 5.0, 30.0, 90.0])
    losses = atmos_loss_db(angles, zenith)
    assert isinstance(losses, np.ndarray)
    assert losses.shape == (4,)
    assert losses[0] == pytest.approx(expected_05, abs=1e-5)
    assert losses[1] == pytest.approx(expected_5, abs=1e-6)
    assert losses[2] == pytest.approx(0.6, abs=1e-7)
    assert losses[3] == pytest.approx(0.3, abs=1e-7)


def test_negative_delta_atmospheric_margin():
    """Verify atmospheric loss causes a strictly negative delta to link margin (bug fix)."""
    altitude_km = 400.0
    frequency_mhz = 401.6

    for side in (DOWNLINK, UPLINK):
        for el in (0.5, 5.0, 15.0, 30.0, 60.0, 90.0):
            # Margin with atmospheric loss (default zenith = 0.3 dB)
            m_with = margin_db(side, el, altitude_km, frequency_mhz, atmos_zenith_db=0.3)
            # Margin without atmospheric loss (zenith = 0.0 dB)
            m_without = margin_db(side, el, altitude_km, frequency_mhz, atmos_zenith_db=0.0)

            delta = m_with - m_without
            loss = atmos_loss_db(el, 0.3)

            # Enforce that atmospheric presence strictly reduces the margin
            assert delta < 0.0, f"Delta margin at {el}° must be strictly negative, got {delta}"
            assert delta == pytest.approx(-loss, abs=1e-9)


def test_received_power_formula():
    """Verify P_R = P_T + G_T - L_FS - A_Atm - L_dust - L_pointing + G_R."""
    side = DOWNLINK
    fspl = 140.0
    atmos = 0.6
    expected_pr = side.pt_dbw + side.gt_dbi - fspl - atmos - side.dust_db - side.pointing_db + side.gr_dbi
    pr = received_dbw(side, fspl, atmos_loss=atmos)
    assert pr == pytest.approx(expected_pr, abs=1e-9)


def test_evaluate_side_returns_atmospheric_fields():
    """Verify evaluate_side populates atmos_loss_db and delta_margin_atmos_db."""
    fit = GammaFit(k=2.4, scale=14.8, mean=35.5)
    samples = np.array([20.0, 30.0, 40.0, 50.0])
    res = evaluate_side(DOWNLINK, fit, samples, 400.0, 401.6)

    assert isinstance(res, SideResult)
    expected_loss = atmos_loss_db(35.5, DOWNLINK.atmos_zenith_db)
    assert res.atmos_loss_db == pytest.approx(expected_loss, abs=1e-6)
    assert res.atmos_loss_db > 0.0
    assert res.delta_margin_atmos_db == pytest.approx(-expected_loss, abs=1e-6)
    assert res.delta_margin_atmos_db < 0.0

    # Margin incorporates atmospheric loss
    expected_pr = received_dbw(DOWNLINK, res.fspl_db, res.atmos_loss_db)
    assert res.pr_dbw == pytest.approx(expected_pr, abs=1e-9)
    assert res.margin_db == pytest.approx(expected_pr - DOWNLINK.threshold_dbw, abs=1e-9)

    # Alternate evaluate_side interface contract
    res2 = evaluate_side(DOWNLINK, 400.0, 401.6, fit, atmos_zenith_db=0.3)
    assert res2.atmos_loss_db == pytest.approx(expected_loss, abs=1e-6)
    assert res2.delta_margin_atmos_db == pytest.approx(-expected_loss, abs=1e-6)


def test_theta_min_solver_with_atmosphere():
    """Verify theta_min_deg bisection solver finds the exact zero-margin elevation."""
    for side in (DOWNLINK, UPLINK):
        tmin = theta_min_deg(side, 400.0, 401.6)
        assert 0.0 < tmin < 90.0
        # Margin at tmin must be 0 dB within 1e-6 dB
        m = margin_db(side, tmin, 400.0, 401.6)
        assert m == pytest.approx(0.0, abs=1e-6)

        # Higher atmospheric zenith attenuation pushes theta_min higher
        tmin_high_loss = theta_min_deg(side, 400.0, 401.6, atmos_zenith_db=1.0)
        assert tmin_high_loss > tmin


def test_waterfall_layout_contains_atmos_stage():
    """Verify waterfall chart contains 'Atmos' loss stage with clean negative delta."""
    fit = GammaFit(k=2.4, scale=14.8, mean=33.4)
    samples = np.array([25.0, 35.0, 45.0])
    res = evaluate_side(DOWNLINK, fit, samples, 400.0, 401.6)

    chart = layout_waterfall(res)
    assert "stages" in chart

    stage_labels = [s["label"] for s in chart["stages"]]
    assert stage_labels == ["Pt", "Gt", "FSPL", "Atmos", "Dust", "Point", "Gr", "E[Pr]"]

    atmos_stage = next(s for s in chart["stages"] if s["label"] == "Atmos")
    assert atmos_stage["kind"] == "loss"
    assert atmos_stage["value"]["text"].startswith(MINUS) or atmos_stage["value"]["text"].startswith("-")

    # Check horizontal ordering and alignment of stages
    x_positions = [s["x"] for s in chart["stages"]]
    for i in range(len(x_positions) - 1):
        assert x_positions[i] < x_positions[i + 1], f"Stage {stage_labels[i]} at {x_positions[i]} overlaps with {stage_labels[i+1]} at {x_positions[i+1]}"

    # Check that Point is left of Ant (316) and Gr is right of Ant
    point_stage = next(s for s in chart["stages"] if s["label"] == "Point")
    gr_stage = next(s for s in chart["stages"] if s["label"] == "Gr")
    ant_node = next(n for n in chart["nodes"] if n["label"] == "Ant")
    assert point_stage["x"] + 24 <= ant_node["x"]
    assert ant_node["x"] <= gr_stage["x"]


def test_comms_link_api_endpoint(client):
    """Integration test verifying GET /comms/link outputs Atmos stage in both budgets."""
    r = client.get("/comms/link")
    assert r.status_code == 200
    data = r.get_json()
    assert len(data["budgets"]) == 2

    for b in data["budgets"]:
        labels = [s["label"] for s in b["stages"]]
        assert "Atmos" in labels
        atmos = next(s for s in b["stages"] if s["label"] == "Atmos")
        assert atmos["kind"] == "loss"
        assert MINUS in atmos["value"]["text"] or "-" in atmos["value"]["text"]
