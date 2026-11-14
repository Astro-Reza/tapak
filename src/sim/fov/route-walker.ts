import type { ProfileSample, Sample, Suit } from "@/engine";
import { sampleAt } from "../../engine/index.js";
import { bearing, type WorldXZ } from "./world.ts";

/**
 * Layer 2 · astronaut route position. Progress is the mission clock T (EVA minutes), exactly as in
 * MARSWALK/app stepWalk(): the engine profile maps T to distance along the computed route, so
 * position, O₂ and dose come from the same sample the science engine uses. No route geometry is made up here.
 */

/** Simulation rates, simulated seconds per real second (the original app offered 30–900×). */
export const WALK_RATES = [1, 10, 60, 240] as const;
export type WalkRate = (typeof WALK_RATES)[number];

/** Advances the clock by real seconds × rate. Frame-rate independent: N small steps equal one big one. */
export const advanceT = (T: number, dtSec: number, rate: number, endT: number) =>
  Math.min(endT, Math.max(0, T + (dtSec * rate) / 60));

/** Point on the route polyline at a distance along it (metres), by binary search on the profile. */
export function pointAtDist(prof: ProfileSample[], d: number): WorldXZ {
  if (d <= prof[0].dist) return { x: prof[0].x, z: prof[0].z };
  const last = prof[prof.length - 1];
  if (d >= last.dist) return { x: last.x, z: last.z };
  let lo = 0, hi = prof.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (prof[mid].dist <= d) lo = mid;
    else hi = mid;
  }
  const a = prof[lo], b = prof[hi];
  const f = (d - a.dist) / (b.dist - a.dist || 1);
  return { x: a.x + f * (b.x - a.x), z: a.z + f * (b.z - a.z) };
}

/**
 * Walking direction (bearing, rad) at a distance: towards the route point `ahead` metres on.
 * The look-ahead smooths the 4 m grid path's zig-zag; near the end it looks back along the last stretch.
 * Returns null on a zero-length route.
 */
export function routeHeading(prof: ProfileSample[], dist: number, ahead = 20): number | null {
  const total = prof[prof.length - 1].dist;
  const d0 = Math.min(dist, Math.max(total - ahead, 0));
  const from = pointAtDist(prof, d0);
  const to = pointAtDist(prof, Math.min(total, d0 + ahead));
  const dx = to.x - from.x, dz = to.z - from.z;
  return Math.hypot(dx, dz) < 1e-6 ? null : bearing(dx, dz);
}

export type RouteStep = {
  sample: Sample;
  /** the astronaut's own pace in simulated m/s (0 while paused or at a science stop) */
  walkMps: number;
};

/** One route-follow step: new clock, engine sample and walking pace. */
export function stepRoute(prof: ProfileSample[], s: Suit, T: number, dtSec: number, rate: number, endT: number): { T: number; step: RouteStep } {
  const before = sampleAt(prof, T, s);
  const T1 = advanceT(T, dtSec, rate, endT);
  const sample = sampleAt(prof, T1, s);
  const simSec = (T1 - T) * 60;
  return { T: T1, step: { sample, walkMps: simSec > 0 ? (sample.dist - before.dist) / simSec : 0 } };
}
