import type { Evaluation, Grid, MissionResult, ProfileSample } from "@/engine";
import type { RelayOrbit } from "@/lib/orbit";
import { sampleAt, status, toCell } from "../engine/index.js";
import { orbitLinkAt, type OrbitLink } from "../lib/orbit.ts";

/** Earth minutes per Mars hour (engine telemetry.js). */
const MARS_HOUR_MIN = 61.65;

/**
 * What Mission Control tells the suit every few seconds over the light-time link (a `status` from "master"):
 * the live environment and consumables at the suit's own planned time, and the orbit link to the relays.
 * The Marswalk AR phone app shows it on the visor HUD; it never computes these itself.
 */
export type McStatus = {
  /** EVA minute this describes (the suit's planned time at its physical progress). */
  t: number;
  lmst: number;
  level: "nominal" | "caution" | "return";
  airC: number | null;
  groundC: number | null;
  pressurePa: number;
  sky: number;
  /** terrain roughness index underfoot (grid.bin rough layer), when the grid carries it */
  rough: number | null;
  doseRateMSvDay: number;
  o2LeftL: number;
  homeO2L: number;
  evaLeftMin: number;
  orbit: OrbitLink | null;
};

export type Constellation = { site: { latDeg: number; lonDeg: number }; relays: RelayOrbit[]; snapshotLmst: number };

const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function missionControlStatus(result: MissionResult, ev: Evaluation, T: number, sky: Constellation, grid?: Grid): McStatus | null {
  if (!ev.prof || !ev.end) return null;
  const now = sampleAt(ev.prof, T, result.s);
  const st = status(now as unknown as ProfileSample, ev.end, result.s, result.env);
  const lmst = result.env.startLmst + T / MARS_HOUR_MIN;
  const [row, col] = grid ? toCell(grid, now.x, now.z) : [0, 0];
  const rough = grid?.rough ? grid.rough[row * grid.cols + col] : undefined;
  const orbit = orbitLinkAt(sky.site, sky.relays, sky.snapshotLmst, lmst);
  return {
    t: r(T, 2),
    lmst: r(lmst, 4),
    level: st.level,
    airC: st.airC == null ? null : r(st.airC, 1),
    groundC: st.groundC == null ? null : r(st.groundC, 1),
    pressurePa: r(st.pressurePa, 0),
    sky: r(st.sky, 3),
    rough: rough == null ? null : r(rough, 2),
    doseRateMSvDay: r((st.doseRateUSvH * 24) / 1000, 3),
    o2LeftL: r(st.o2LeftL, 1),
    homeO2L: r(st.homeO2L, 1),
    evaLeftMin: r(st.evaLeftMin, 1),
    orbit: orbit && {
      ...orbit,
      aosLmst: r(orbit.aosLmst, 4),
      losLmst: r(orbit.losLmst, 4),
      maxElDeg: r(orbit.maxElDeg, 1),
      track: orbit.track.map((p) => ({ lmst: r(p.lmst, 4), azDeg: r(p.azDeg, 1), elDeg: r(p.elDeg, 1), marginDb: r(p.marginDb, 1) })),
    },
  };
}
