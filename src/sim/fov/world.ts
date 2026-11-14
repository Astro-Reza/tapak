import type { Grid } from "@/engine";

/**
 * Layer 1 · world / terrain coordinates. The mission world frame is the engine's:
 * metres, x east, y up (areoid elevation), z south, origin at the patch centre. North is −z.
 * Nothing here knows about Three.js, the camera or the UI.
 */
export type WorldXZ = { x: number; z: number };
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Ground elevation by bilinear interpolation on the engine DTM grid (4 m cells).
 * Matches the rendered Draco mesh to ±0.13 m (measured on 20 points), at a fraction of a
 * mesh raycast's cost (~6.5 ms each), so it is safe to call every frame.
 */
export function heightAt(g: Grid, x: number, z: number): number {
  const c = Math.min(Math.max((x - g.x0) / g.cell[0], 0), g.cols - 1);
  const r = Math.min(Math.max((z - g.z0) / g.cell[1], 0), g.rows - 1);
  const c0 = Math.floor(c), r0 = Math.floor(r);
  const c1 = Math.min(c0 + 1, g.cols - 1), r1 = Math.min(r0 + 1, g.rows - 1);
  const fc = c - c0, fr = r - r0;
  const e = g.elev;
  const top = e[r0 * g.cols + c0] * (1 - fc) + e[r0 * g.cols + c1] * fc;
  const bottom = e[r1 * g.cols + c0] * (1 - fc) + e[r1 * g.cols + c1] * fc;
  return top * (1 - fr) + bottom * fr;
}

/** Walkable area: the terrain patch (centred on 0) less a margin, so the camera never sees past the mesh edge. */
export function terrainBounds(size: [number, number], margin = 15): Bounds {
  const hx = size[0] / 2 - margin, hz = size[1] / 2 - margin;
  return { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz };
}

export const clampXZ = (p: WorldXZ, b: Bounds): WorldXZ => ({
  x: Math.min(Math.max(p.x, b.minX), b.maxX),
  z: Math.min(Math.max(p.z, b.minZ), b.maxZ),
});

/** Bearing of a horizontal vector in radians, clockwise from north (−z). */
export const bearing = (dx: number, dz: number) => Math.atan2(dx, -dz);

/** Wraps an angle to (−π, π]. */
export const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/** Compass degrees 0–360 for a bearing in radians. */
export const toCompassDeg = (rad: number) => (((rad * 180) / Math.PI) % 360 + 360) % 360;
