"""Builds the two payloads the Comms screens read.

GET /comms/passes -> passes_payload()   (CommsPassesData in src/data/comms.ts)
GET /comms/link   -> link_payload()     (CommsLinkData   in src/data/comms.ts)

Time t = 0 is the snapshot ("now", Scenario.now_lmst_h); times are seconds
after it. Clock strings are local mean solar time at the site.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from . import layout
from .config import SOL_S, LinkSide, Relay, Scenario
from .link import GammaFit, SideResult, evaluate_side, fit_gamma, margin_db
from .orbit import elevation_deg, relay_positions

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
    altitude = float(np.mean([r.altitude_km for r in scn.relays]))
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
                "name": name,
                "window": span,
                "maxElevation": f"max {round(p.max_el)}°",
                "margin": f"{fmt_num(_pass_margin(limit.side, p, scn), sign=True)} dB",
                "state": state,
            }
        )

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
