import type { Evaluation, Mode, MissionResult, ProfileSample, Recipe, Stop } from "@/engine";
import { sampleAt, stationLpm, validatePlan } from "../engine/index.js";
import type { Settings } from "./mission";
import { arrivalIndices, stopName } from "./stops.ts";

/**
 * AR mission package: everything the phone AR app (Unity / AR Foundation, Phase 4) needs to follow a planned EVA,
 * computed by the science engine here so the phone never re-plans. Spec: docs/AR_MISSION_PACKAGE.md.
 */
export const AR_PACKAGE_FORMAT = "marswalk.ar-mission";
export const AR_PACKAGE_VERSION = 1;

/** Columns of `profile.rows`, in order. */
export const PROFILE_FIELDS = ["t", "dist", "x", "y", "z", "o2", "dose", "dwell", "slope", "sky"] as const;
type Field = (typeof PROFILE_FIELDS)[number];
/** Decimal places per column: cm for positions, 0.1 mL for O2, 0.001 µSv for dose. */
const DECIMALS: Record<Field, number> = { t: 4, dist: 2, x: 2, y: 2, z: 2, o2: 4, dose: 6, dwell: 2, slope: 2, sky: 3 };

/** Calibration fit error above which walking is shown but never counted as route progress, m. */
export const MAX_CALIBRATION_RESIDUAL_M = 2;
/** The heading marker must be at least this far from the origin marker, m (short baselines give a poor heading). */
const MIN_BASELINE_M = 50;

export type ArWaypoint = {
  id: string;
  name: string;
  stopId: string;
  lat: number;
  lon: number;
  /** row in profile.rows */
  profileIndex: number;
  x: number;
  y: number;
  z: number;
  /** metres along the route */
  dist: number;
  /** EVA minutes */
  arriveT: number;
  departT: number;
  dwellMin: number;
  /** steepest slope on the leg into this waypoint, degrees */
  legMaxSlopeDeg: number;
};

export type ArCheck = { T: number; k: number; dwelling: boolean; x: number; y: number; z: number; dist: number; o2: number; dose: number };

export type ArMissionPackage = {
  format: typeof AR_PACKAGE_FORMAT;
  version: typeof AR_PACKAGE_VERSION;
  createdAt: string;
  plan: Recipe & { scienceId: string; policyId: string; verdict: string; reasons: string[]; cautions: string[] };
  frame: { units: "m"; axes: string; origin: { lat: number; lon: number }; patchSizeM: [number, number] };
  suit: { o2CapacityL: number; reserveFrac: number; evaLimitMin: number; maxSlopeDeg: number; cautionSlopeDeg: number; stationLpm: number };
  route: { distanceM: number; durationMin: number; o2UsedL: number; doseMSv: number };
  profile: { fields: typeof PROFILE_FIELDS; rows: number[][] };
  waypoints: ArWaypoint[];
  calibration: { markers: { id: "origin" | "heading"; waypoint: string; x: number; y: number; z: number }[]; maxResidualM: number };
  rules: { progressRequires: { tracking: "normal"; calibrated: true; maxResidualM: number }; reanchorAtWaypoints: true; scaledModeCountsProgress: false };
  checks: ArCheck[];
  credits: string[];
};

const round = (v: number, d: number) => Number(v.toFixed(d));
const num = (v: number | undefined) => (Number.isFinite(v) ? (v as number) : 0);

/** Rebuilds engine profile samples from package rows (used for the golden checks and by tests). */
export function rowsToProfile(rows: number[][]): ProfileSample[] {
  return rows.map((r, i) => {
    const o = Object.fromEntries(PROFILE_FIELDS.map((f, j) => [f, r[j]])) as Record<Field, number>;
    return { ...o, i, cell: 0 } as unknown as ProfileSample;
  });
}

export function buildArPackage(input: {
  data: { stops: Stop[]; terrain: { size: [number, number]; center: { lat: number; lon: number } }; credits?: string[] };
  result: MissionResult;
  mode: Mode;
  settings: Pick<Settings, "scienceId" | "policyId" | "startLmst" | "kSuit" | "modelKey">;
  createdAt?: string;
}): ArMissionPackage {
  const { data, result, mode, settings } = input;
  const ev: Evaluation = result.modes[mode];
  if (!ev.prof || !ev.end) throw new Error(`no route for the ${mode} plan: ${ev.error ?? "unknown"}`);
  const s = result.s, end = ev.end;

  // Rounded rows are the package's truth: checks are computed from them, so a port can match exactly.
  const rows = ev.prof.map((p) => PROFILE_FIELDS.map((f) => round(num((p as unknown as Record<string, number>)[f]), DECIMALS[f])));
  const prof = rowsToProfile(rows);
  const arrivals = arrivalIndices(ev);

  const waypoints: ArWaypoint[] = arrivals.map((pi, k) => {
    const last = k === arrivals.length - 1;
    const st = data.stops[last ? 0 : k];
    const p = prof[pi];
    let legMax = 0;
    for (let j = k ? arrivals[k - 1] : 0; j <= pi; j++) legMax = Math.max(legMax, prof[j].slope);
    const dwell = num(p.dwell);
    return {
      id: `WP${k + 1}`,
      name: last ? "Return" : k === 0 ? `Start · ${stopName(st.id)}` : stopName(st.id),
      stopId: st.id,
      lat: st.lat,
      lon: st.lon,
      profileIndex: pi,
      x: p.x,
      y: p.y,
      z: p.z,
      dist: p.dist,
      arriveT: round(p.t - dwell, 4),
      departT: p.t,
      dwellMin: dwell,
      legMaxSlopeDeg: round(legMax, 2),
    };
  });

  // Two-point calibration: origin at the start, heading from the first waypoint far enough away.
  const start = waypoints[0];
  const far = waypoints.slice(1).find((w) => Math.hypot(w.x - start.x, w.z - start.z) >= MIN_BASELINE_M);
  if (!far) throw new Error(`no waypoint ${MIN_BASELINE_M} m from the start to calibrate heading`);
  const marker = (id: "origin" | "heading", w: ArWaypoint) => ({ id, waypoint: w.id, x: w.x, y: w.y, z: w.z });

  // Golden samples: start, every stop (walking in, mid-dwell), the end, and both clamps.
  const times = new Set<number>([-1, 0, end.t, end.t + 10]);
  for (const w of waypoints) {
    if (w.dwellMin > 0) times.add(round(w.arriveT + w.dwellMin / 2, 4));
    times.add(round(Math.max(0, w.arriveT - 3), 4));
  }
  for (let f = 0.1; f < 1; f += 0.2) times.add(round(end.t * f, 4));
  const checks = [...times].sort((a, b) => a - b).map((T) => {
    const m = sampleAt(prof, T, s);
    return { T, k: m.k, dwelling: m.dwelling, x: m.x, y: m.y, z: m.z, dist: m.dist, o2: m.o2, dose: m.dose };
  });

  const recipe = validatePlan({
    v: 1,
    mode,
    sliderT: mode === "safest" ? 1 : mode === "balanced" ? 0.5 : 0,
    modelKey: settings.modelKey,
    startLmst: settings.startLmst,
    kSuit: settings.kSuit,
    o2CapacityL: s.o2CapacityL,
    summary: { km: end.dist / 1000, o2L: end.o2 },
  });

  return {
    format: AR_PACKAGE_FORMAT,
    version: AR_PACKAGE_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    plan: { ...recipe, scienceId: settings.scienceId, policyId: settings.policyId, verdict: ev.verdict, reasons: ev.reasons, cautions: ev.cautions },
    frame: {
      units: "m",
      axes: "x east, y up (areoid elevation), z south; north is -z; origin at the terrain patch centre",
      origin: data.terrain.center,
      patchSizeM: data.terrain.size,
    },
    suit: {
      o2CapacityL: s.o2CapacityL,
      reserveFrac: s.reserveFrac,
      evaLimitMin: s.evaLimitMin,
      maxSlopeDeg: s.maxSlopeDeg,
      cautionSlopeDeg: s.cautionSlopeDeg,
      stationLpm: stationLpm(s),
    },
    route: { distanceM: round(end.dist, 2), durationMin: round(end.t, 4), o2UsedL: round(end.o2, 4), doseMSv: round(end.dose, 6) },
    profile: { fields: PROFILE_FIELDS, rows },
    waypoints,
    calibration: { markers: [marker("origin", start), marker("heading", far)], maxResidualM: MAX_CALIBRATION_RESIDUAL_M },
    rules: { progressRequires: { tracking: "normal", calibrated: true, maxResidualM: MAX_CALIBRATION_RESIDUAL_M }, reanchorAtWaypoints: true, scaledModeCountsProgress: false },
    checks,
    credits: data.credits ?? [],
  };
}

/** File name for a download, e.g. marswalk-ar-efficient-0900.json */
export const arPackageFileName = (mode: Mode, startLmst: number) =>
  `marswalk-ar-${mode}-${String(Math.floor(startLmst)).padStart(2, "0")}${String(Math.round((startLmst % 1) * 60)).padStart(2, "0")}.json`;
