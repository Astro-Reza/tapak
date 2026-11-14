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
