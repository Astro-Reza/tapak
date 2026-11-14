// Activity timeline and metabolic budget along a planned EVA. No rendering code.
// 'engine' mode reproduces the Phase 2 O2 exactly (it reads the profile's own litres);
// 'analog' mode uses the NASA lunar-analog activity rates (catalog) and is EXPERIMENTAL.
import { stationLpm, SUIT } from '../telemetry.js';
import { activityVo2 } from './catalog.js';
import { lpmFromMlKgMin, wattsFromLpm, kjhFromWatts } from './units.js';

/**
 * Split a Phase 2 profile into walking and stop segments (minutes from egress).
 * Each walking segment carries the engine's own O2 for that step, so nothing is recomputed or counted twice.
 */
export function activityTimeline(prof, s = SUIT, { stopActivity = 'stationary_light' } = {}) {
  const segs = [];
  for (let k = 1; k < prof.length; k++) {
    const a = prof[k - 1], b = prof[k];
    const dwell = b.dwell || 0, stopO2 = dwell * stationLpm(s);
    const t1 = b.t - dwell;
    if (t1 > a.t) {
      segs.push({ kind: 'walk', activity: 'walk', t0: a.t, t1, distM: b.dist - a.dist, rise: b.y - a.y,
        slopeDeg: Math.max(a.slope, b.slope), engineO2L: b.o2 - stopO2 - a.o2 });
    }
    if (dwell > 0) segs.push({ kind: 'stop', activity: stopActivity, t0: t1, t1: b.t, distM: 0, rise: 0, slopeDeg: b.slope, engineO2L: stopO2 });
  }
  return segs;
}

/**
 * O2 uptake rate (L/min) of one segment under a mode.
 * 'source': walking from a WorkloadSource (workload.js; analytic today, Kinesis when validated), stops as 'engine'.
 */
export function segmentLpm(seg, crew, mode, { workload = null, s = SUIT } = {}) {
  const minutes = seg.t1 - seg.t0;
  if (mode === 'source' && seg.kind === 'walk') {
    if (!workload) throw new Error("mode 'source' needs a workload source");
    return workload.walking({ distM: seg.distM, grade: seg.rise / seg.distM, slopeDeg: seg.slopeDeg }, s).o2L / minutes;
  }
  if (mode === 'engine' || mode === 'source' || (mode === 'analog-stops' && seg.kind === 'walk')) return seg.engineO2L / minutes;
  return lpmFromMlKgMin(activityVo2(seg.activity).mlKgMin, crew.bodyKg);
}

/**
 * Metabolic O2 uptake and energy over the timeline.
 * mode: 'engine' (Phase 2), 'analog-stops' (engine walking + analog stop activity), 'analog' (analog for both).
 */
export function metabolicBudget(segs, crew, mode = 'engine', ctx = {}) {
  let o2L = 0, energyKJ = 0;
  const rows = segs.map((seg) => {
    const lpm = segmentLpm(seg, crew, mode, ctx), minutes = seg.t1 - seg.t0;
    const w = wattsFromLpm(lpm);
    o2L += lpm * minutes; energyKJ += (w * minutes * 60) / 1000;
    return { ...seg, lpm, watts: w, kjh: kjhFromWatts(w), o2L: lpm * minutes };
  });
  return { mode, rows, o2L, energyKJ, minutes: segs.length ? segs.at(-1).t1 - segs[0].t0 : 0 };
}

/** State at EVA minute T: current activity and accumulated uptake/energy. */
export function metabolicAt(budget, T, crew) {
  let o2L = 0, energyKJ = 0, cur = budget.rows[0] ?? null;
  for (const r of budget.rows) {
    const dt = Math.max(0, Math.min(T, r.t1) - r.t0);
    o2L += r.lpm * dt; energyKJ += (r.watts * dt * 60) / 1000;
    if (T >= r.t0 && T <= r.t1) cur = r;
  }
  if (cur && T > cur.t1) cur = budget.rows.at(-1);
  const pctVo2peak = crew.vo2peakMlKgMin && cur ? (100 * (cur.lpm * 1000) / crew.bodyKg) / crew.vo2peakMlKgMin : null;
  return { row: cur, o2L, energyKJ, pctVo2peak };
}
