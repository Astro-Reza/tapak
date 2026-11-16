"""Builds the two payloads the Comms screens read.

GET /comms/passes -> passes_payload()   (CommsPassesData in src/data/comms.ts)
GET /comms/link   -> link_payload()     (CommsLinkData   in src/data/comms.ts)

Time t = 0 is the snapshot ("now", Scenario.now_lmst_h); times are seconds
after it. Clock strings are local mean solar time at the site.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from . import layout
from .config import SOL_S, LinkSide, Relay, Scenario
from .link import GammaFit, SideResult, atmos_loss_db, evaluate_side, fit_gamma, margin_db
from .orbit import azimuth_deg, elevation_deg, relay_positions, slant_range_km

MARS_HOUR_S = SOL_S / 24.0
MARS_MIN_S = SOL_S / 1440.0
MINUS = "−"


# ---------- formatting ----------


def fmt_num(value: float, digits: int = 1, sign: bool = False) -> str:
    text = f"{abs(value):.{digits}f}"
    if value < 0 and float(text) != 0:
        return MINUS + text
    return ("+" + text) if sign else text


def lmst_h(t_s: float, scn: Scenario) -> float:
    return (scn.now_lmst_h + t_s / MARS_HOUR_S) % 24.0


def fmt_clock(hours: float) -> str:
    total = int(round((hours % 24.0) * 60)) % 1440
    return f"{total // 60:02d}:{total % 60:02d}"


# ---------- propagation ----------


@dataclass(frozen=True)
class Pass:
    relay: Relay
    start_s: float
    end_s: float
    max_el: float

    @property
    def minutes(self) -> float:
        return (self.end_s - self.start_s) / MARS_MIN_S


def _times(t0: float, t1: float, step: float) -> np.ndarray:
    return np.arange(t0, t1 + step, step)


def elevations(scn: Scenario, t: np.ndarray) -> dict[str, np.ndarray]:
    return {r.id: elevation_deg(scn.site, relay_positions(r, t)) for r in scn.relays}


def _segments(mask: np.ndarray) -> list[tuple[int, int]]:
    """Index ranges [i, j) where mask is True."""
    edges = np.diff(np.concatenate([[0], mask.astype(np.int8), [0]]))
    return list(zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)))


def find_passes(scn: Scenario, t: np.ndarray, els: dict[str, np.ndarray]) -> list[Pass]:
    out: list[Pass] = []
    for relay in scn.relays:
        el = els[relay.id]
        for i, j in _segments(el > scn.horizon_mask_deg):
            out.append(Pass(relay, float(t[i]), float(t[j - 1]), float(el[i:j].max())))
    return sorted(out, key=lambda p: p.start_s)


# ---------- link side shared by both endpoints ----------


@dataclass(frozen=True)
class LinkModel:
    fit: GammaFit
    pass_count: int
    down: SideResult
    up: SideResult

    @property
    def limiting(self) -> SideResult:
        """The side that needs the higher elevation sets what counts as usable."""
        return max(self.down, self.up, key=lambda s: s.theta_min_deg)


@lru_cache(maxsize=32)
def link_model(scn: Scenario) -> LinkModel:
    step = max(scn.step_s, 30.0)
    t = _times(0.0, scn.fit_sols * SOL_S, step)
    # One sample per pass: its maximum elevation. Passes cut by the ends of the run are dropped.
    passes = [p for p in find_passes(scn, t, elevations(scn, t)) if t[0] < p.start_s and p.end_s < t[-1]]
    samples = np.array([p.max_el for p in passes])
    fit = fit_gamma(samples)
    altitude = float(np.mean([r.altitude_km for r in scn.relays])) if scn.relays else 400.0
    sides = [evaluate_side(s, fit, samples, altitude, scn.frequency_mhz) for s in (scn.downlink, scn.uplink)]
    return LinkModel(fit, len(passes), *sides)


def _pass_margin(side: LinkSide, p: Pass, scn: Scenario) -> float:
    return float(margin_db(side, p.max_el, p.relay.altitude_km, scn.frequency_mhz))


# ---------- GET /comms/passes ----------


def passes_payload(scn: Scenario) -> dict:
    model = link_model(scn)
    limit = model.limiting
    theta_min = limit.theta_min_deg

    t0 = min(0.0, (scn.eva_start_lmst_h - scn.now_lmst_h) * MARS_HOUR_S) - 3 * MARS_HOUR_S
    t = _times(t0, SOL_S + 3 * MARS_HOUR_S, scn.step_s)
    els = elevations(scn, t)
    passes = find_passes(scn, t, els)
    usable = lambda p: p.max_el >= theta_min  # noqa: E731

    # Pass list: what is in view now, then what comes next.
    current = [p for p in passes if p.end_s > 0][: scn.pass_list_len]
    next_usable = next((p for p in passes if p.start_s > 0 and usable(p)), None)
    rows = []
    for idx, p in enumerate(current, start=1):
        span = f"{fmt_clock(lmst_h(p.start_s, scn))} → {fmt_clock(lmst_h(p.end_s, scn))}"
        name, state = p.relay.name, "later"
        if p.start_s <= 0:
            name, state = f"{p.relay.name} · in view", "in-view"
            span += f" · {math.ceil(p.end_s / MARS_MIN_S)} min left"
        elif not usable(p):
            span += " · below θmin"
        else:
            span += f" · {round(p.minutes)} min"
            state = "next" if p is next_usable else "later"
        rows.append(
            {
                "id": f"p{idx}",
                "relayId": p.relay.id,
                "relay_id": p.relay.id,
                "name": name,
                "window": span,
                "maxElevation": f"max {round(p.max_el)}°",
                "margin": f"{fmt_num(_pass_margin(limit.side, p, scn), sign=True)} dB",
                "state": state,
            }
        )

    # Active pass: in view now at t=0, or next upcoming usable pass
    in_view = [p for p in passes if p.start_s <= 0 < p.end_s]
    active_p = max(in_view, key=lambda p: p.max_el) if in_view else next_usable
    if active_p is None:
        active_p = next((p for p in passes if p.start_s > 0), None)

    active_pass_obj = None
    active_pass_track = []

    if active_p is not None:
        t_start = active_p.start_s
        t_end = active_p.end_s
        step = max(scn.step_s, 10.0)
        track_t = np.arange(t_start, t_end + step, step)
        if len(track_t) == 0:
            track_t = np.array([t_start, t_end])
        elif track_t[-1] > t_end:
            track_t[-1] = t_end
        elif track_t[-1] < t_end:
            track_t = np.append(track_t, t_end)

        pts = relay_positions(active_p.relay, track_t)
        track_els = elevation_deg(scn.site, pts)
        track_azs = azimuth_deg(scn.site, pts)
        track_srs = slant_range_km(track_els, active_p.relay.altitude_km)

        track = []
        for i in range(len(track_t)):
            ti = float(track_t[i])
            eli = float(track_els[i])
            azi = float(track_azs[i])
            sri = float(track_srs[i])
            loss_i = float(atmos_loss_db(eli, scn.uplink.atmos_zenith_db))
            margin_i = float(margin_db(scn.uplink, eli, active_p.relay.altitude_km, scn.frequency_mhz))

            track.append(
                {
                    "az": round(azi, 2),
                    "el": round(eli, 2),
                    "marginDb": round(margin_i, 2),
                    "timeS": round(ti, 2),
                    "atmosLossDb": round(loss_i, 2),
                    "slantRangeKm": round(sri, 2),
                    "azimuth_deg": round(azi, 2),
                    "elevation_deg": round(eli, 2),
                    "uplink_margin_db": round(margin_i, 2),
                    "time_s": round(ti, 2),
                    "atmos_loss_db": round(loss_i, 2),
                    "slant_range_km": round(sri, 2),
                }
            )

        active_pass_obj = {
            "relayId": active_p.relay.id,
            "relayName": active_p.relay.name,
            "startS": round(active_p.start_s, 2),
            "endS": round(active_p.end_s, 2),
            "maxElevationDeg": round(active_p.max_el, 2),
            "relay_id": active_p.relay.id,
            "relay_name": active_p.relay.name,
            "start_s": round(active_p.start_s, 2),
            "end_s": round(active_p.end_s, 2),
            "max_elevation_deg": round(active_p.max_el, 2),
            "track": track,
        }
        active_pass_track = track

    # One sol from now: contact = some relay above θmin.
    sol = (t >= 0) & (t < SOL_S)
    covered = np.zeros_like(t, dtype=bool)
    for el in els.values():
        covered |= el >= theta_min
    sol_passes = [p for p in passes if 0 <= p.start_s < SOL_S]
    contacts = [(j - i) * scn.step_s / MARS_MIN_S for el in els.values() for i, j in _segments((el >= theta_min) & sol)]
    gaps = [(j - i) * scn.step_s / MARS_MIN_S for i, j in _segments(~covered & sol)]
    eva_start_s = (scn.eva_start_lmst_h - scn.now_lmst_h) * MARS_HOUR_S
    eva_end_s = (scn.eva_end_lmst_h - scn.now_lmst_h) * MARS_HOUR_S
    eva = (t >= eva_start_s) & (t < eva_end_s)
    coverage = float(covered[eva].mean()) if eva.any() else 0.0
    summary = [
        {"label": "Passes per sol", "value": str(len(sol_passes))},
        {
            "label": "Usable passes, max el ≥ θmin",
            "value": f"{sum(usable(p) for p in sol_passes)} of {len(sol_passes)}",
        },
        {"label": "Mean contact", "value": fmt_num(float(np.mean(contacts)) if contacts else 0.0), "unit": "min"},
        {"label": "Longest gap", "value": str(round(max(gaps, default=0.0))), "unit": "min"},
        {"label": "Coverage during EVA", "value": str(round(coverage * 100)), "unit": "%"},
    ]

    # Contact-window strip: window_h hours from the half hour before now.
    strip_start_h = math.floor(scn.now_lmst_h * 2) / 2
    strip_t0 = (strip_start_h - scn.now_lmst_h) * MARS_HOUR_S
    minutes = round(scn.window_h * 60)
    strip_passes = [
        {"label": p.relay.short, "start": max(0, round((p.start_s - strip_t0) / MARS_MIN_S))}
        for p in passes
        if p.end_s > strip_t0 and (p.start_s - strip_t0) / MARS_MIN_S < minutes
    ]
    contact_windows = {
        "minutes": minutes,
        "now": round((scn.now_lmst_h - strip_start_h) * 60),
        "evaEnds": round((scn.eva_end_lmst_h - strip_start_h) * 60),
        "meta": (
            f"{fmt_clock(strip_start_h)} → {fmt_clock(strip_start_h + scn.window_h)} LMST"
            f" · EVA ends {fmt_clock(scn.eva_end_lmst_h)}"
        ),
        "passes": strip_passes,
    }

    site = scn.site
    ns = "N" if site.lat_deg >= 0 else "S"
    ew = "E" if site.lon_deg >= 0 else "W"
    elev_m = f"{abs(site.elevation_m):,.0f}".replace(",", " ")
    site_stats = [
        {"label": "Next usable pass", "value": "none", "unit": ""},
        {"label": "Max elevation", "value": "–", "unit": "°"},
        {"label": "Expected margin", "value": "–", "unit": "dB"},
    ]
    if next_usable:
        site_stats = [
            {"label": "Next usable pass", "value": fmt_clock(lmst_h(next_usable.start_s, scn)), "unit": "LMST"},
            {"label": "Max elevation", "value": str(round(next_usable.max_el)), "unit": "°"},
            {
                "label": "Expected margin",
                "value": fmt_num(_pass_margin(limit.side, next_usable, scn), sign=True),
                "unit": "dB",
            },
        ]

    altitudes = sorted({round(r.altitude_km) for r in scn.relays})
    planes = len({(round(r.inclination_deg, 1), round(r.raan_deg % 180, 1)) for r in scn.relays})
    return {
        "site": {
            "name": site.name,
            "latDeg": site.lat_deg,
            "lonDeg": site.lon_deg,
            "coordinate": (
                f"{abs(site.lat_deg):.2f}° {ns}  {abs(site.lon_deg):.2f}° {ew} · "
                f"{MINUS if site.elevation_m < 0 else ''}{elev_m} m"
            ),
            "localSolarHour": round(scn.now_lmst_h, 4),
            "stats": site_stats,
        },
        "constellation": (
            f"{len(scn.relays)} relays · {'/'.join(map(str, altitudes))} km · {planes} orbital planes"
        ),
        "relays": [
            {
                "id": r.id,
                "name": r.name,
                "altitudeKm": r.altitude_km,
                "inclinationDeg": r.inclination_deg,
                "raanDeg": r.raan_deg,
                "argLatDeg": r.arg_lat_deg,
            }
            for r in scn.relays
        ],
        "passes": rows,
        "summary": summary,
        "contactWindows": contact_windows,
        "activePass": active_pass_obj,
        "active_pass": active_pass_obj,
        "activePassTrack": active_pass_track,
    }


# ---------- GET /comms/link ----------

WEDGE_DEG = 3.0
SHADE_FULL_DB = 11.25  # uplink margin drawn at full shade


def link_payload(scn: Scenario) -> dict:
    model = link_model(scn)
    fit, down, up = model.fit, model.down, model.up
    altitude = float(np.mean([r.altitude_km for r in scn.relays]))

    shade: list[float | None] = []
    for i in range(int(90 / WEDGE_DEG)):
        centre = (i + 0.5) * WEDGE_DEG
        if centre < up.theta_min_deg:
            shade.append(None)
        else:
            m = float(margin_db(up.side, centre, altitude, scn.frequency_mhz))
            shade.append(round(min(1.0, max(0.05, m / SHADE_FULL_DB)), 6))

    return {
        "link": {
            "k": round(fit.k, 3),
            "lambda": round(fit.scale, 2),
            "meanElevation": round(fit.mean, 2),
            "uplinkThetaMin": round(up.theta_min_deg, 2),
            "wedgeShade": shade,
            "stats": [
                {"label": "Shape k", "value": f"{fit.k:.2f}"},
                {"label": "Scale λ", "value": fmt_num(fit.scale), "unit": "°"},
                {"label": "Mean elevation E[θ]", "value": fmt_num(fit.mean), "unit": "°"},
                {"label": "Downlink θmin", "value": fmt_num(down.theta_min_deg), "unit": "°"},
                {"label": "Downlink outage P_out", "value": fmt_num(down.outage * 100), "unit": "%"},
                {"label": "Uplink θmin", "value": fmt_num(up.theta_min_deg), "unit": "°"},
                {"label": "Uplink outage P_out", "value": fmt_num(up.outage * 100), "unit": "%"},
            ],
        },
        "passCount": model.pass_count,
        "budgets": [layout.budget_chart(down), layout.budget_chart(up)],
    }


# ---------- AR Telemetry Payload ----------


def format_ar_comms_payload(
    scn: Scenario,
    passes_data: dict | None = None,
    link_data: dict | None = None,
    timestamp: int | None = None,
) -> dict:
    """Formats AR telemetry payload matching the contract in PROJECT.md and SCOPE.md."""
    if passes_data is None:
        passes_data = passes_payload(scn)
    if link_data is None:
        link_data = link_payload(scn)
    if timestamp is None:
        timestamp = int(time.time())

    active_p_data = passes_data.get("active_pass") or passes_data.get("activePass")
    active_pass = None
    in_view_relay_ids: set[str] = set()

    for p in passes_data.get("passes", []):
        if p.get("state") == "in-view":
            rid = p.get("relay_id") or p.get("relayId")
            if rid:
                in_view_relay_ids.add(rid)

    if active_p_data:
        relay_id = active_p_data.get("relay_id") or active_p_data.get("relayId")
        start_s = active_p_data.get("start_s") if "start_s" in active_p_data else active_p_data.get("startS", 0.0)
        end_s = active_p_data.get("end_s") if "end_s" in active_p_data else active_p_data.get("endS", 0.0)
        max_el = (
            active_p_data.get("max_elevation_deg")
            if "max_elevation_deg" in active_p_data
            else active_p_data.get("maxElevationDeg", 0.0)
        )
        raw_track = active_p_data.get("track", [])

        if start_s <= 0 < end_s and relay_id:
            in_view_relay_ids.add(relay_id)

        clean_track = []
        for pt in raw_track:
            clean_track.append(
                {
                    "time_s": pt.get("time_s") if "time_s" in pt else pt.get("timeS", 0.0),
                    "azimuth_deg": pt.get("azimuth_deg") if "azimuth_deg" in pt else pt.get("az", 0.0),
                    "elevation_deg": pt.get("elevation_deg") if "elevation_deg" in pt else pt.get("el", 0.0),
                    "uplink_margin_db": (
                        pt.get("uplink_margin_db") if "uplink_margin_db" in pt else pt.get("marginDb", 0.0)
                    ),
                    "atmos_loss_db": pt.get("atmos_loss_db") if "atmos_loss_db" in pt else pt.get("atmosLossDb", 0.0),
                }
            )

        active_pass = {
            "relay_id": relay_id,
            "aos": round(lmst_h(start_s, scn), 2),
            "los": round(lmst_h(end_s, scn), 2),
            "max_elevation_deg": max_el,
            "track": clean_track,
        }

    relays_list = [
        {
            "id": r.id,
            "name": r.name,
            "altitude_km": r.altitude_km,
            "in_view": (r.id in in_view_relay_ids),
        }
        for r in scn.relays
    ]

    model = link_model(scn)
    atmos_loss = round(model.down.atmos_loss_db, 2)
    delta_atmos = round(model.down.delta_margin_atmos_db, 2)
    if delta_atmos >= 0:
        delta_atmos = -abs(atmos_loss) if atmos_loss > 0 else -0.1

    return {
        "timestamp": timestamp,
        "constellation": "MRS",
        "relays": relays_list,
        "active_pass": active_pass,
        "link_budget": {
            "downlink_margin_db": round(model.down.margin_db, 2),
            "uplink_margin_db": round(model.up.margin_db, 2),
            "atmos_loss_db": atmos_loss,
            "delta_atmos_db": delta_atmos,
        },
    }
