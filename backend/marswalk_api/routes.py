"""HTTP routes. Paths match src/lib/comms-api.ts: the front-end calls
`${VITE_MARSWALK_API_URL}/comms/passes` and `${VITE_MARSWALK_API_URL}/comms/link`.

Optional query parameters on both comms routes override the scenario:
  lat, lon        site position, degrees (north, east)
  now             snapshot time, LMST hours (e.g. 15.63)
  eva_start       EVA start, LMST hours
  eva_end         EVA end, LMST hours
  mask            horizon mask, degrees
"""

from __future__ import annotations

import math

from flask import Blueprint, current_app, jsonify, request

from . import __version__
from .comms import link_payload, passes_payload
from .config import Scenario

bp = Blueprint("api", __name__)

# query name -> (Scenario field, min, max)
OVERRIDES = {
    "lat": ("lat_deg", -90.0, 90.0),
    "lon": ("lon_deg", -180.0, 360.0),
    "now": ("now_lmst_h", 0.0, 24.0),
    "eva_start": ("eva_start_lmst_h", 0.0, 24.0),
    "eva_end": ("eva_end_lmst_h", 0.0, 24.0),
    "mask": ("horizon_mask_deg", 0.0, 45.0),
}


class BadRequest(ValueError):
    pass


def scenario_from_request() -> Scenario:
    base: Scenario = current_app.config["MARSWALK_SCENARIO"]
    kw = {}
    for name, (field, lo, hi) in OVERRIDES.items():
        raw = request.args.get(name)
        if raw is None:
            continue
        try:
            value = float(raw)
        except ValueError:
            raise BadRequest(f"'{name}' must be a number") from None
        if not math.isfinite(value) or not lo <= value <= hi:
            raise BadRequest(f"'{name}' must be between {lo:g} and {hi:g}")
        kw[field] = value
    scn = base.with_overrides(**kw) if kw else base
    if scn.eva_end_lmst_h <= scn.eva_start_lmst_h:
        raise BadRequest("'eva_end' must be after 'eva_start'")
    return scn


@bp.errorhandler(BadRequest)
def bad_request(err: BadRequest):
    return jsonify(error=str(err)), 400


@bp.get("/health")
def health():
    return jsonify(status="ok", version=__version__)


@bp.get("/comms/passes")
def comms_passes():
    return jsonify(passes_payload(scenario_from_request()))


@bp.get("/comms/link")
def comms_link():
    return jsonify(link_payload(scenario_from_request()))
