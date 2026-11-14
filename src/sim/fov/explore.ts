import { clampXZ, type Bounds, type WorldXZ } from "./world.ts";

/**
 * Free Explore: walk anywhere on the terrain, desktop/tablet simulation only.
 * This state is separate from the committed plan: it never touches the mission clock,
 * route progress or consumables, and nothing here is written back to the EVA plan.
 */

/** Movement intent from keys or on-screen buttons, each axis −1…1. */
export type MoveInput = { forward: number; right: number; fast: boolean };
export const NO_MOVE: MoveInput = { forward: 0, right: 0, fast: false };

/** Suited walking pace, m/s; "fast" is a fly-over convenience, labelled as such in the UI. */
export const EXPLORE_MPS = 1.2;
export const EXPLORE_FAST_X = 10;

/** Moves relative to where the camera looks (yaw, rad clockwise from north) and keeps you on the terrain. */
export function stepExplore(p: WorldXZ, move: MoveInput, yaw: number, dtSec: number, bounds: Bounds): { p: WorldXZ; movedM: number } {
  let f = move.forward, r = move.right;
  const len = Math.hypot(f, r);
  if (len < 1e-6) return { p, movedM: 0 };
  if (len > 1) { f /= len; r /= len; } // diagonals are not faster
  const step = EXPLORE_MPS * (move.fast ? EXPLORE_FAST_X : 1) * dtSec;
  const fx = Math.sin(yaw), fz = -Math.cos(yaw); // forward
  const rx = Math.cos(yaw), rz = Math.sin(yaw); // right
  const next = clampXZ({ x: p.x + (fx * f + rx * r) * step, z: p.z + (fz * f + rz * r) * step }, bounds);
  return { p: next, movedM: Math.hypot(next.x - p.x, next.z - p.z) };
}
