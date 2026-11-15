"""Link-budget waterfall geometry for the Comms · Link budget screen.

The front-end draws `Budget` objects as-is (design pixels inside the chart
box), so the backend lays them out. The vertical axis is broken, as in the
Figma frame: 4 px/dB above 0 dBW (y = 84 at 0) and 8 px/dB below −125 dBW
(y = 132 at −125). Bars run from the running total before each stage to the
total after it; E[Pr] runs from the received power to the threshold.
"""

from __future__ import annotations

from .link import SideResult

MINUS = "−"

GRID_TOP = [
    {"y": 84, "label": "0", "labelX": 25},
    {"y": 64, "label": "+5", "labelX": 18},
    {"y": 44, "label": "+10", "labelX": 13},
    {"y": 24, "label": "+15", "labelX": 14},
    {"y": 132, "label": f"{MINUS}125", "labelX": 6},
    {"y": 164, "label": f"{MINUS}129", "labelX": 6},
]
LOWER_TICKS = {-133: 8, -137: 7}  # tick dB -> label x

# label, label x, bar x, value-label x for a 4-character value
STAGES = [
    ("Pt", 89.5, 84, 82.5),
    ("Gt", 132, 128, 126.5),
    ("FSPL", 169, 172, 202),
    ("Atmos", 205, 208, 206.5),
    ("Dust", 242, 244, 242.5),
    ("Point", 277, 280, 278.5),
    ("Gr", 356, 352, 350.5),
]


def y_of(db: float) -> float:
    if db >= 0:
        return 84 - 4 * db
    if db <= -125:
        return 132 + 8 * (-125 - db)
    return 84 + (132 - 84) * (db / -125)  # inside the axis break


def _r(v: float) -> float:
    return round(v, 2)


def _fmt(db: float) -> str:
    text = f"{abs(db):.1f}"
    return (MINUS if db < 0 else "+") + text


def _status(margin: float) -> str:
    if margin >= 3.0:
        return "safe"
    return "caution" if margin >= 0 else "danger"


def budget_chart(res: SideResult) -> dict:
    s = res.side
    steps = [
        ("gain", s.pt_dbw),
        ("gain", s.gt_dbi),
        ("loss", -res.fspl_db),
        ("loss", -res.atmos_loss_db),
        ("loss", -s.dust_db),
        ("loss", -s.pointing_db),
        ("gain", s.gr_dbi),
    ]
    stages = []
    level = 0.0
    for (label, label_x, x, value_x), (kind, delta) in zip(STAGES, steps):
        before, after = level, level + delta
        level = after
        y0, y1 = y_of(before), y_of(after)
        top, height = min(y0, y1), abs(y1 - y0)
        text = _fmt(delta)
        stage = {"label": label, "labelX": label_x, "kind": kind, "x": x, "top": _r(top), "height": _r(height)}
        if label == "FSPL":
            stage["value"] = {"text": text, "x": value_x, "y": _r(top + 20)}
            half = 8 * res.fspl_spread_db
            stage["wick"] = {"top": _r(y_of(after) - half), "height": _r(2 * half)}
        elif kind == "gain":
            stage["value"] = {"text": text, "x": _r(value_x - 2.5 * (len(text) - 4)), "y": _r(top - 20)}
        else:
            stage["value"] = {"text": text, "x": value_x, "y": _r(top + height + 4)}
            if label == "Dust":
                half = 8 * s.dust_db / 2
                stage["wick"] = {"top": _r(y_of(after) - half), "height": _r(2 * half)}
        stages.append(stage)

    pr_y, pth_y = y_of(res.pr_dbw), y_of(s.threshold_dbw)
    half = 8 * res.fspl_spread_db
    stages.append(
        {
            "label": "E[Pr]",
            "labelX": 386,
            "kind": "result",
            "x": 388,
            "top": _r(min(pr_y, pth_y)),
            "height": _r(abs(pth_y - pr_y)),
            "wick": {"top": _r(pr_y - half), "height": _r(2 * half)},
        }
    )

    grid = GRID_TOP + [
        {"y": _r(y_of(db)), "label": f"{MINUS}{-db}", "labelX": lx}
        for db, lx in LOWER_TICKS.items()
        if db != round(s.threshold_dbw)
    ]
    relay = {"icon": "satellite", "label": "Relay"}
    suit = {"icon": "astronaut", "label": "Suit"}
    ends = (relay, suit) if s.tx == "relay" else (suit, relay)
    nodes = [
        {"x": 56, **ends[0], "labelX": 39 if ends[0] is relay else 44},
        {"x": 316, "icon": "antenna", "label": "Ant", "labelX": 305},
        {"x": 444, **ends[1], "labelX": 427 if ends[1] is relay else 432},
    ]
    return {
        "title": s.title,
        "grid": grid,
        "pth": _r(pth_y),
        "nodes": nodes,
        "stages": stages,
        "margin": _fmt(res.margin_db),
        "lines": [
            f"E[Pr] {_fmt(res.pr_dbw)} dBW",
            f"spread ± {res.fspl_spread_db:.1f} dB",
            f"Outage {res.outage * 100:.1f} %",
        ],
        "status": _status(res.margin_db),
    }


def layout_waterfall(res: SideResult, side: LinkSide | None = None) -> dict:
    """Waterfall chart layout coordinate generator."""
    return budget_chart(res)
