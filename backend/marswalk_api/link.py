"""UHF link budget and the elevation statistics behind outage.

Received power E[Pr] = Pt + Gt − FSPL(E[θ]) − dust − pointing + Gr, with FSPL at
the slant range of the mean pass elevation. The maximum elevation of each
simulated pass is fitted with a gamma distribution (method of moments);
outage is P(θ < θmin), the share of passes that never reach θmin, the
elevation at which the margin reaches 0 dB.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .config import LinkSide
from .orbit import slant_range_km


def fspl_db(distance_km, frequency_mhz: float):
    return 20.0 * np.log10(distance_km) + 20.0 * math.log10(frequency_mhz) + 32.44


def received_dbw(side: LinkSide, fspl: float) -> float:
    return side.pt_dbw + side.gt_dbi - fspl - side.dust_db - side.pointing_db + side.gr_dbi


def margin_db(side: LinkSide, elevation, altitude_km: float, frequency_mhz: float):
    fspl = fspl_db(slant_range_km(elevation, altitude_km), frequency_mhz)
    return received_dbw(side, fspl) - side.threshold_dbw


def theta_min_deg(side: LinkSide, altitude_km: float, frequency_mhz: float) -> float:
    """Lowest elevation with a non-negative margin (bisection; margin rises with θ)."""
    lo, hi = 0.0, 90.0
    if margin_db(side, lo, altitude_km, frequency_mhz) >= 0:
        return 0.0
    if margin_db(side, hi, altitude_km, frequency_mhz) < 0:
        return 90.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if margin_db(side, mid, altitude_km, frequency_mhz) >= 0:
            hi = mid
        else:
            lo = mid
    return hi


# ---------- gamma fit ----------


@dataclass(frozen=True)
class GammaFit:
    k: float  # shape
    scale: float  # λ, degrees
    mean: float

    def cdf(self, x: float) -> float:
        return regularized_gamma_p(self.k, x / self.scale) if x > 0 else 0.0


def fit_gamma(samples: np.ndarray) -> GammaFit:
    mean = float(np.mean(samples))
    var = float(np.var(samples))
    return GammaFit(k=mean * mean / var, scale=var / mean, mean=mean)


def regularized_gamma_p(a: float, x: float) -> float:
    """P(a, x), lower regularized incomplete gamma (Numerical Recipes 6.2)."""
    if x <= 0:
        return 0.0
    log_pre = -x + a * math.log(x) - math.lgamma(a)
    if x < a + 1.0:
        term = total = 1.0 / a
        ap = a
        for _ in range(500):
            ap += 1.0
            term *= x / ap
            total += term
            if abs(term) < abs(total) * 1e-14:
                break
        return total * math.exp(log_pre)
    # Continued fraction for Q(a, x), modified Lentz.
    tiny = 1e-300
    b = x + 1.0 - a
    c = 1.0 / tiny
    d = 1.0 / b
    h = d
    for i in range(1, 500):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        d = tiny if abs(d) < tiny else d
        c = b + an / c
        c = tiny if abs(c) < tiny else c
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-14:
            break
    return 1.0 - math.exp(log_pre) * h


# ---------- one side of the budget ----------


@dataclass(frozen=True)
class SideResult:
    side: LinkSide
    fspl_db: float
    fspl_spread_db: float  # standard deviation of FSPL over contact elevations
    pr_dbw: float
    margin_db: float
    theta_min_deg: float
    outage: float


def evaluate_side(
    side: LinkSide, fit: GammaFit, samples: np.ndarray, altitude_km: float, frequency_mhz: float
) -> SideResult:
    fspl_mean = float(fspl_db(slant_range_km(fit.mean, altitude_km), frequency_mhz))
    spread = float(np.std(fspl_db(slant_range_km(samples, altitude_km), frequency_mhz)))
    pr = received_dbw(side, fspl_mean)
    tmin = theta_min_deg(side, altitude_km, frequency_mhz)
    return SideResult(
        side=side,
        fspl_db=fspl_mean,
        fspl_spread_db=spread,
        pr_dbw=pr,
        margin_db=pr - side.threshold_dbw,
        theta_min_deg=tmin,
        outage=fit.cdf(tmin),
    )
