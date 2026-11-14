import { wrapPi } from "./world.ts";

/**
 * Layers 3 + 4 · camera pose and camera animation effects. Pure math, no Three.js.
 * The astronaut's body (position + walking heading) comes from the route walker or free explore;
 * the head (look yaw/pitch) comes from input; head bob is presentation only and never feeds back
 * into position, route progress or any science calculation.
 */

/** Astronaut eye height above ground, m (MARSWALK/app main.js EYE). */
export const EYE_M = 1.7;

const DEG = Math.PI / 180;
/** Look pitch limits: comfortable head + torso range in a suit, and no flipping over the top. */
export const PITCH_MIN = -60 * DEG;
export const PITCH_MAX = 50 * DEG;
export const clampPitch = (p: number) => Math.min(Math.max(p, PITCH_MIN), PITCH_MAX);

/** World-frame camera pose. yaw: radians clockwise from north (−z); pitch: up positive; roll kept 0 (nausea). */
export type CameraPose = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number };

/** The body the head sits on. `heading` is the walking direction, tracked separately from where the camera looks. */
export type Body = { x: number; z: number; ground: number; heading: number };

/** Head orientation relative to the body. yaw is unbounded (full 360° and beyond), pitch is clamped. */
export type Look = { yaw: number; pitch: number };

/* ---------- smoothing ---------- */

/** Frame-rate independent exponential approach: after 1/rate seconds ~63% of the gap is closed. */
export const damp = (cur: number, target: number, rate: number, dtSec: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dtSec));

/** Same as damp() for angles, taking the short way round. */
export const dampAngle = (cur: number, target: number, rate: number, dtSec: number) =>
  cur + wrapPi(target - cur) * (1 - Math.exp(-rate * dtSec));

/* ---------- head bob ---------- */

export const BOB_LEVELS = { off: 0, reduced: 0.4, normal: 1 } as const;
export type BobLevel = keyof typeof BOB_LEVELS;

/** Peak vertical / lateral head travel at full intensity, m. Small on purpose: no shake, no roll. */
const BOB_VERTICAL_M = 0.028;
const BOB_LATERAL_M = 0.012;
/** Walking pace that reaches full bob, m/s (a brisk suited walk). */
const BOB_FULL_MPS = 1.1;

export type Bob = { amp: number; phase: number; vertical: number; lateral: number };
export const BOB_REST: Bob = { amp: 0, phase: 0, vertical: 0, lateral: 0 };

/**
 * Advances head bob. Amplitude eases towards intensity × pace (so starts and stops are smooth and
 * a standstill fades to zero); the stride phase advances at a human cadence for that pace in REAL
 * time, so 60× playback does not turn into a 60× shake.
 */
export function stepBob(b: Bob, dtSec: number, walkMps: number, intensity: number): Bob {
  const pace = Math.min(Math.max(walkMps, 0) / BOB_FULL_MPS, 1);
  const amp = damp(b.amp, intensity * pace, 4, dtSec);
  if (amp < 1e-4) return BOB_REST;
  const strideHz = 0.75 + 0.35 * pace; // stride (two steps) per second
  const phase = (b.phase + 2 * Math.PI * strideHz * dtSec) % (2 * Math.PI);
  return { amp, phase, vertical: amp * BOB_VERTICAL_M * Math.sin(2 * phase), lateral: amp * BOB_LATERAL_M * Math.sin(phase) };
}

/* ---------- composition ---------- */

/** Camera pose = body + eye height + bob offset (along the body's right) + head look. */
export function composeCamera(body: Body, basePitch: number, look: Look, bob: Bob): CameraPose {
  const rx = Math.cos(body.heading), rz = Math.sin(body.heading); // body right vector (heading + 90°)
  return {
    x: body.x + rx * bob.lateral,
    y: body.ground + EYE_M + bob.vertical,
    z: body.z + rz * bob.lateral,
    yaw: body.heading + look.yaw,
    pitch: clampPitch(basePitch + look.pitch),
    roll: 0,
  };
}

/** True when two poses would render the same frame (skip the render, save battery). */
export const samePose = (a: CameraPose | null, b: CameraPose) =>
  !!a && Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4 && Math.abs(a.z - b.z) < 1e-4 &&
  Math.abs(a.yaw - b.yaw) < 1e-5 && Math.abs(a.pitch - b.pitch) < 1e-5;
