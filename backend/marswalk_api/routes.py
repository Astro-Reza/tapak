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

import json
import math
from typing import Any

from flask import Blueprint, current_app, jsonify, request

from . import __version__
from .cache import publish_ar_comms
from .comms import format_ar_comms_payload, link_payload, passes_payload
from .config import Relay, Scenario

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


def parse_relay(data: Any) -> Relay:
    if not isinstance(data, dict):
        raise BadRequest("Each relay must be an object")

    r_id = data.get("id")
    if not isinstance(r_id, str) or not r_id.strip():
        raise BadRequest("Relay 'id' must be a non-empty string")

    r_name = data.get("name")
    if not isinstance(r_name, str) or not r_name.strip():
        raise BadRequest("Relay 'name' must be a non-empty string")

    # altitude_km or altitudeKm
    alt_val = data.get("altitude_km") if "altitude_km" in data else data.get("altitudeKm")
    if alt_val is None:
        raise BadRequest(f"Relay '{r_id}' missing required altitude ('altitude_km' or 'altitudeKm')")
    try:
        alt = float(alt_val)
    except (ValueError, TypeError):
        raise BadRequest(f"Relay '{r_id}' altitude must be a number")
    if not math.isfinite(alt) or alt <= 0:
        raise BadRequest(f"Relay '{r_id}' altitude must be a positive finite number")

    # inclination_deg or inclinationDeg
    inc_val = data.get("inclination_deg") if "inclination_deg" in data else data.get("inclinationDeg")
    if inc_val is None:
        raise BadRequest(f"Relay '{r_id}' missing required inclination ('inclination_deg' or 'inclinationDeg')")
    try:
        inc = float(inc_val)
    except (ValueError, TypeError):
        raise BadRequest(f"Relay '{r_id}' inclination must be a number")
    if not math.isfinite(inc):
        raise BadRequest(f"Relay '{r_id}' inclination must be a finite number")

    # raan_deg or raanDeg
    raan_val = data.get("raan_deg") if "raan_deg" in data else data.get("raanDeg")
    if raan_val is None:
        raise BadRequest(f"Relay '{r_id}' missing required RAAN ('raan_deg' or 'raanDeg')")
    try:
        raan = float(raan_val)
    except (ValueError, TypeError):
        raise BadRequest(f"Relay '{r_id}' RAAN must be a number")
    if not math.isfinite(raan):
        raise BadRequest(f"Relay '{r_id}' RAAN must be a finite number")

    # arg_lat_deg or argLatDeg
    arg_val = data.get("arg_lat_deg") if "arg_lat_deg" in data else data.get("argLatDeg")
    if arg_val is None:
        raise BadRequest(f"Relay '{r_id}' missing required argument of latitude ('arg_lat_deg' or 'argLatDeg')")
    try:
        arg_lat = float(arg_val)
    except (ValueError, TypeError):
        raise BadRequest(f"Relay '{r_id}' argument of latitude must be a number")
    if not math.isfinite(arg_lat):
        raise BadRequest(f"Relay '{r_id}' argument of latitude must be a finite number")

    return Relay(
        id=r_id.strip(),
        name=r_name.strip(),
        altitude_km=alt,
        inclination_deg=inc,
        raan_deg=raan,
        arg_lat_deg=arg_lat,
    )


def scenario_from_request() -> Scenario:
    base: Scenario = current_app.config["MARSWALK_SCENARIO"]
    kw = {}
    json_data = None
    is_json = (
        request.is_json
        or request.mimetype == "application/json"
        or request.headers.get("Content-Type", "").startswith("application/json")
    )
    if is_json:
        raw_body = request.get_data()
        if raw_body and raw_body.strip():
            try:
                json_data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                raise BadRequest("Malformed JSON body")
            if not isinstance(json_data, dict):
                raise BadRequest("JSON body must be an object")

    for name, (field, lo, hi) in OVERRIDES.items():
        raw = request.args.get(name)
        if raw is None and isinstance(json_data, dict):
            raw = json_data.get(name)
        if raw is None:
            continue
        try:
            value = float(raw)
        except ValueError:
            raise BadRequest(f"'{name}' must be a number") from None
        if not math.isfinite(value) or not lo <= value <= hi:
            raise BadRequest(f"'{name}' must be between {lo:g} and {hi:g}")
        kw[field] = value

    raw_relays = request.args.get("relays")
    if raw_relays is None and isinstance(json_data, dict):
        raw_relays = json_data.get("relays")
    if raw_relays is not None:
        if isinstance(raw_relays, str):
            try:
                parsed = json.loads(raw_relays)
            except Exception as e:
                raise BadRequest(f"Invalid JSON for 'relays': {e}") from None
        else:
            parsed = raw_relays
        if isinstance(parsed, dict):
            parsed = [parsed]
        elif not isinstance(parsed, list):
            raise BadRequest("'relays' parameter must be a JSON array or object")
        if len(parsed) == 0:
            raise BadRequest("'relays' parameter must contain at least one relay")
        relays_list = [parse_relay(r) for r in parsed]
        mode = request.args.get("mode", "")
        if not mode and isinstance(json_data, dict):
            mode = json_data.get("mode", "")
        mode = str(mode).lower()

        append_flag = request.args.get("append", "")
        if not append_flag and isinstance(json_data, dict):
            append_flag = json_data.get("append", "")
        is_append = mode == "append" or str(append_flag).lower() in ("true", "1")

        if is_append:
            kw["relays"] = (*base.relays, *relays_list)
        elif mode in ("", "replace"):
            kw["relays"] = tuple(relays_list)
        else:
            raise BadRequest(f"Unknown mode '{mode}'; must be 'replace' or 'append'")

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


@bp.route("/comms/publish", methods=["GET", "POST"])
def comms_publish():
    scn = scenario_from_request()
    passes = passes_payload(scn)
    link = link_payload(scn)
    ar_payload = format_ar_comms_payload(scn, passes, link)
    res = publish_ar_comms(ar_payload, passes_payload=passes)
    return (
        jsonify(
            status="ok",
            published=res.get("published", False),
            configured=res.get("configured", False),
            payload=ar_payload,
            result=res,
        ),
        200,
    )
