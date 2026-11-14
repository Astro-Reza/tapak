"""Scenario and link parameters for the comms model.

Every value here is an assumption, not a measurement. The defaults reproduce
the scenario drawn in the Figma frames (Jezero West, four relays at 400 km,
UHF 401.6 MHz) so the backend and the front-end dummy data describe the same
situation. Override any of them per request with query parameters (see
routes.py) or by passing a Scenario to the model functions.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

MARS_RADIUS_KM = 3389.5
MARS_MU_KM3_S2 = 42828.37
SOL_S = 88775.244  # mean solar day
SIDEREAL_DAY_S = 88642.663


@dataclass(frozen=True)
class Relay:
    id: str
    name: str
    altitude_km: float
    inclination_deg: float
    raan_deg: float  # node longitude in the Mars-fixed frame at the snapshot
    arg_lat_deg: float  # angle along the orbit from the node at the snapshot

    @property
    def short(self) -> str:
        return self.name.split("-")[-1]


@dataclass(frozen=True)
class Site:
    name: str = "Jezero West"
    lat_deg: float = 18.43
    lon_deg: float = 77.42
    elevation_m: float = -2410.0


@dataclass(frozen=True)
class LinkSide:
    """One direction of the UHF link, all in dB / dBW."""

    title: str
    tx: str  # "relay" | "suit"
    pt_dbw: float
    gt_dbi: float
    gr_dbi: float
    dust_db: float
    pointing_db: float
    threshold_dbw: float


DEFAULT_RELAYS: tuple[Relay, ...] = (
    Relay("l1", "MRS-L1", 400, 75, 70, 9),
    Relay("l2", "MRS-L2", 400, 52, 190, 300),
    Relay("l3", "MRS-L3", 400, 52, 310, 70),
    Relay("l4", "MRS-L4", 400, 75, 70, 189),
)

DOWNLINK = LinkSide("Receive · relay → suit", "relay", 10.0, 4.0, 2.0, 0.3, 1.0, -131.0)
UPLINK = LinkSide("Transmit · suit → relay", "suit", 6.0, 2.0, 4.0, 0.3, 1.0, -133.0)


@dataclass(frozen=True)
class Scenario:
    site: Site = field(default_factory=Site)
    relays: tuple[Relay, ...] = DEFAULT_RELAYS
    frequency_mhz: float = 401.6
    downlink: LinkSide = DOWNLINK
    uplink: LinkSide = UPLINK
    # Snapshot ("now") in local mean solar time, hours.
    now_lmst_h: float = 15.63
    eva_start_lmst_h: float = 14.0
    eva_end_lmst_h: float = 17.083
    # Relays below this elevation are hidden by terrain and do not count as a pass.
    horizon_mask_deg: float = 0.0
    # Propagation step and the number of sols simulated for the elevation fit.
    step_s: float = 10.0
    fit_sols: int = 20
    # Hours shown on the contact-window strip, from the half hour before "now".
    window_h: float = 6.0
    pass_list_len: int = 5

    def with_overrides(self, **kw) -> "Scenario":
        site_kw = {k: kw.pop(k) for k in ("lat_deg", "lon_deg") if k in kw}
        out = replace(self, **kw)
        return replace(out, site=replace(out.site, **site_kw)) if site_kw else out
