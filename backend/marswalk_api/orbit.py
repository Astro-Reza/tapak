"""Circular-orbit relay geometry in the Mars-fixed frame.

Same conventions as src/lib/orbit.ts (+Y through the north pole, one unit =
one Mars radius), so a relay's elements at t = 0 put it where the Comms globe
draws it. On top of that this module moves the relays in time: the argument of
latitude advances with the Keplerian mean motion and the node drifts west as
Mars turns under the (inertially fixed) orbit plane. No J2, no drag.
"""

from __future__ import annotations

import math

import numpy as np

from .config import MARS_MU_KM3_S2, MARS_RADIUS_KM, SIDEREAL_DAY_S, Relay, Site


def lat_lon_to_vec(lat_deg, lon_deg, radius=1.0) -> np.ndarray:
    """Matches latLonToVec() in src/lib/orbit.ts. Shape (..., 3)."""
    phi = np.radians(90.0 - np.asarray(lat_deg, dtype=float))
    theta = np.radians(np.asarray(lon_deg, dtype=float) + 180.0)
    return np.stack(
        [
            -radius * np.sin(phi) * np.cos(theta),
            radius * np.cos(phi) * np.ones_like(theta),
            radius * np.sin(phi) * np.sin(theta),
        ],
        axis=-1,
    )


def orbit_radius(altitude_km: float) -> float:
    return (MARS_RADIUS_KM + altitude_km) / MARS_RADIUS_KM


def period_s(altitude_km: float) -> float:
    a = MARS_RADIUS_KM + altitude_km
    return 2.0 * math.pi * math.sqrt(a**3 / MARS_MU_KM3_S2)


def relay_positions(relay: Relay, t_s: np.ndarray) -> np.ndarray:
    """Relay position at times t_s (seconds after the snapshot). Shape (n, 3)."""
    t_s = np.asarray(t_s, dtype=float)
    raan = relay.raan_deg - 360.0 * t_s / SIDEREAL_DAY_S
    u = np.radians(relay.arg_lat_deg + 360.0 * t_s / period_s(relay.altitude_km))
    node = lat_lon_to_vec(0.0, raan)
    east = lat_lon_to_vec(0.0, raan + 90.0)
    ci = math.cos(math.radians(relay.inclination_deg))
    si = math.sin(math.radians(relay.inclination_deg))
    a = orbit_radius(relay.altitude_km)
    cu = (a * np.cos(u))[:, None]
    su = (a * np.sin(u))[:, None]
    north = np.array([0.0, 1.0, 0.0])
    # Same combination as orbitPoint(): node * cos u + (east * cos i + north * sin i) * sin u
    return node * cu + (east * ci + north * si) * su


def elevation_deg(site: Site, points: np.ndarray) -> np.ndarray:
    """Elevation of each point above the site's local horizon, degrees."""
    up = lat_lon_to_vec(site.lat_deg, site.lon_deg)
    v = points - up
    return np.degrees(np.arcsin((v @ up) / np.linalg.norm(v, axis=-1)))


def slant_range_km(elevation: np.ndarray | float, altitude_km: float) -> np.ndarray:
    """Site-to-relay distance for a relay at `altitude_km` seen at `elevation`."""
    e = np.radians(elevation)
    r = MARS_RADIUS_KM
    a = r + altitude_km
    return np.sqrt(a**2 - (r * np.cos(e)) ** 2) - r * np.sin(e)
