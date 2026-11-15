/**
 * Small orbit geometry for the Comms globe. Mars-fixed frame, +Y through the
 * north pole, one unit = one Mars radius. Circular orbits only: enough to draw
 * the relay planes and read an elevation, not a propagator.
 */

export const MARS_RADIUS_KM = 3389.5;

export type Vec3 = readonly [number, number, number];

export type RelayOrbit = {
  id: string;
  name: string;
  altitudeKm: number;
  inclinationDeg: number;
  /** Longitude of the ascending node in the Mars-fixed frame at the snapshot time. */
  raanDeg: number;
  /** Argument of latitude: angle along the orbit from the ascending node. */
  argLatDeg: number;
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Point at a latitude and east longitude. Matches the UV layout of a three.js
 * sphere carrying an equirectangular texture centered on longitude 0.
 */
export function latLonToVec(latDeg: number, lonDeg: number, radius = 1): Vec3 {
  const phi = rad(90 - latDeg);
  const theta = rad(lonDeg + 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

export const orbitRadius = (altitudeKm: number) => (MARS_RADIUS_KM + altitudeKm) / MARS_RADIUS_KM;

/** Position on a circular orbit at `argLatDeg` (defaults to the relay's own). */
export function orbitPoint(
  orbit: Pick<RelayOrbit, "altitudeKm" | "inclinationDeg" | "raanDeg" | "argLatDeg">,
  argLatDeg = orbit.argLatDeg,
): Vec3 {
  const node = latLonToVec(0, orbit.raanDeg);
  const east = latLonToVec(0, orbit.raanDeg + 90);
  const ci = Math.cos(rad(orbit.inclinationDeg));
  const si = Math.sin(rad(orbit.inclinationDeg));
  const a = orbitRadius(orbit.altitudeKm);
  const cu = a * Math.cos(rad(argLatDeg));
  const su = a * Math.sin(rad(argLatDeg));
  return [node[0] * cu + east[0] * ci * su, node[1] * cu + si * su, node[2] * cu + east[2] * ci * su];
}

/** Elevation of a point above the local horizon of a surface site, in degrees. */
export function elevationDeg(site: { latDeg: number; lonDeg: number }, point: Vec3): number {
  const up = latLonToVec(site.latDeg, site.lonDeg);
  const v = [point[0] - up[0], point[1] - up[1], point[2] - up[2]];
  const length = Math.hypot(v[0], v[1], v[2]);
  return (Math.asin((v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / length) * 180) / Math.PI;
}

// ---- Moving relays (same model as backend/marswalk_api/orbit.py): the argument of latitude advances with the
// Keplerian mean motion and the node drifts west as Mars turns under the inertially fixed orbit plane. No J2, no drag.

const MARS_MU_KM3_S2 = 42828.37;
const SIDEREAL_DAY_S = 88642.663;
/** Mean solar day, s. */
export const SOL_S = 88775.244;

/** Relay position `tS` seconds after the snapshot its elements describe. */
export function relayAt(orbit: RelayOrbit, tS: number): Vec3 {
  const a = MARS_RADIUS_KM + orbit.altitudeKm;
  const periodS = 2 * Math.PI * Math.sqrt(a ** 3 / MARS_MU_KM3_S2);
  return orbitPoint({ ...orbit, raanDeg: orbit.raanDeg - (360 * tS) / SIDEREAL_DAY_S }, orbit.argLatDeg + (360 * tS) / periodS);
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Azimuth (degrees clockwise from north) and elevation of a point seen from a surface site. */
export function lookAngles(site: { latDeg: number; lonDeg: number }, point: Vec3): { azDeg: number; elDeg: number } {
  const up = latLonToVec(site.latDeg, site.lonDeg);
  const east = latLonToVec(0, site.lonDeg + 90); // horizontal at any latitude
  const north = unit(sub(latLonToVec(site.latDeg + 0.01, site.lonDeg), up));
  const v = sub(point, up);
  const az = (Math.atan2(dot(v, east), dot(v, north)) * 180) / Math.PI;
  return { azDeg: (az + 360) % 360, elDeg: elevationDeg(site, point) };
}

/** Site-to-relay distance for a relay at `altitudeKm` seen at `elevationDeg` (orbit.py slant_range_km). */
export function slantRangeKm(elevationDeg: number, altitudeKm: number): number {
  const e = (elevationDeg * Math.PI) / 180, r = MARS_RADIUS_KM, a = r + altitudeKm;
  return Math.sqrt(a * a - (r * Math.cos(e)) ** 2) - r * Math.sin(e);
}

/** Suit → relay UHF uplink, the comms backend's defaults (backend/marswalk_api/config.py UPLINK, 401.6 MHz). */
const UPLINK = { ptDbw: 6, gtDbi: 2, grDbi: 4, dustDb: 0.3, pointingDb: 1, thresholdDbw: -133, frequencyMhz: 401.6 };

/** Uplink margin above the receiver threshold, dB (link.py margin_db). */
export function uplinkMarginDb(elevationDeg: number, altitudeKm: number): number {
  const u = UPLINK;
  const fspl = 20 * Math.log10(slantRangeKm(elevationDeg, altitudeKm)) + 20 * Math.log10(u.frequencyMhz) + 32.44;
  return u.ptDbw + u.gtDbi - fspl - u.dustDb - u.pointingDb + u.grDbi - u.thresholdDbw;
}

export type PassPoint = { lmst: number; azDeg: number; elDeg: number; marginDb: number };
/** The relay pass in progress at `lmst`, or the next one, with its sky track from AOS to LOS. */
export type OrbitLink = { relay: string; aosLmst: number; losLmst: number; maxElDeg: number; track: PassPoint[] };

/**
 * Finds the pass (relay above `maskDeg`) in progress at `lmst` or the first one after it, looking up to one sol
 * ahead. `snapshotLmst` is the local time the relays' elements describe. LMST hours may run past 24.
 */
export function orbitLinkAt(
  site: { latDeg: number; lonDeg: number },
  relays: RelayOrbit[],
  snapshotLmst: number,
  lmst: number,
  maskDeg = 0,
  stepS = 20,
): OrbitLink | null {
  const toS = (h: number) => ((h - snapshotLmst) / 24) * SOL_S;
  const toH = (s: number) => snapshotLmst + (s / SOL_S) * 24;
  const el = (r: RelayOrbit, s: number) => lookAngles(site, relayAt(r, s)).elDeg;
  const t0 = toS(lmst);
  let best: { relay: RelayOrbit; aos: number } | null = null;
  for (const r of relays) {
    // a pass in progress starts in the past: walk back to its AOS
    let aos = t0;
    if (el(r, t0) > maskDeg) while (el(r, aos - stepS) > maskDeg && t0 - aos < 3600) aos -= stepS;
    else {
      while (aos - t0 < SOL_S && el(r, aos) <= maskDeg) aos += stepS;
      if (aos - t0 >= SOL_S) continue;
    }
    if (!best || aos < best.aos) best = { relay: r, aos };
  }
  if (!best) return null;
  const { relay, aos } = best;
  let los = aos;
  while (el(relay, los + stepS) > maskDeg && los - aos < 3600) los += stepS;
  const n = Math.max(2, Math.min(60, Math.round((los - aos) / 30) + 1)); // ~30 s apart, enough for a smooth arc
  const track = Array.from({ length: n }, (_, i) => {
    const s = aos + ((los - aos) * i) / (n - 1);
    const { azDeg, elDeg } = lookAngles(site, relayAt(relay, s));
    return { lmst: toH(s), azDeg, elDeg, marginDb: uplinkMarginDb(Math.max(elDeg, 0), relay.altitudeKm) };
  });
  return { relay: relay.name, aosLmst: toH(aos), losLmst: toH(los), maxElDeg: Math.max(...track.map((p) => p.elDeg)), track };
}
