import type { CameraPose } from "./camera-rig.ts";

/**
 * AR-ready seam (Phase 4). Interfaces only; no AR dependency is added in this phase.
 *
 * Today the desktop FoV produces the camera pose by simulation (route walker or free explore
 * + look input + head bob). In the Android/iOS app, ARCore/ARKit 6DoF tracking will produce it
 * instead: the user walks and turns the phone, with no joystick, D-pad, simulated rotation or
 * head bob. Both feed the same renderer through CameraPose, and neither touches the science engine:
 * mission telemetry stays a function of the planned route and the mission clock.
 */

export type TrackingQuality = "normal" | "limited" | "lost";

/** One camera pose in the mission world frame, with how much to trust it. */
export interface PoseFrame {
  pose: CameraPose;
  tracking: TrackingQuality;
  /** ms, performance.now() clock */
  at: number;
}

export interface CameraPoseSource {
  readonly kind: "simulated" | "device-6dof";
  /** Latest pose; for a device source this is the tracked pose mapped through the calibration. */
  current(): PoseFrame | null;
  dispose?(): void;
}

/** A device pose in the AR session's own frame (metres, arbitrary origin and heading). */
export type DevicePose = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number };

/**
 * Maps the AR session frame onto the mission world frame (for example from two surveyed
 * anchor points). `residualM` is the fit error: large residuals mean waypoints will drift.
 */
export interface WorldCalibration {
  toWorld(p: DevicePose): CameraPose;
  residualM: number;
}

/** Calibration error above which physical movement is shown but not trusted, m. */
export const MAX_CALIBRATION_RESIDUAL_M = 2;

/**
 * Phase 4 rule: physical walking only counts as route progress when the device is tracked
 * normally AND the session frame is calibrated to the mission frame within tolerance.
 * Otherwise the UI must warn and keep the committed route unchanged.
 */
export function progressCounts(frame: PoseFrame | null, cal: WorldCalibration | null): boolean {
  return !!frame && frame.tracking === "normal" && !!cal && cal.residualM <= MAX_CALIBRATION_RESIDUAL_M;
}
