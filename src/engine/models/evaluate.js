// Before-EVA planning: route a mode, measure it, decide go / no-go, pick the EVA window. No rendering code.
import { SUIT, profile, stationLpm, weatherAt, MARS_HOUR_MIN } from '../telemetry.js';
import { planLoop } from '../route.js';
import { makeCost } from './cost.js';
import { walkBackCheck } from './returnfield.js';

export const DAYLIGHT = [7, 17]; // LMST hours treated as the safe working window (assumed)
export const COLD_GROUND_K = 200; // below this, glove contact with rock is limited (assumed)

// Straight-line length of the stop loop: the shared yardstick for Q.
export const loopLength = (stops) => stops.reduce((d, s, i) => {
  const t = stops[(i + 1) % stops.length]; return d + Math.hypot(t.xz[0] - s.xz[0], t.xz[1] - s.xz[1]);
}, 0);

// Plan one mode. weights = null keeps the handoff's least-oxygen search.
// ctx = {grid, stops, env, field, judge, model, s}; judge = makeCost(...balanced) used to score every route alike.
export function evaluatePlan(weights, { grid, stops, env, field, judge, model = null, s = SUIT, surrogate = null }) {
  const cost = weights ? makeCost(grid, { weights, model: model ?? undefined, s, surrogate }) : null;
  const plan = planLoop(grid, stops, s, cost?.edge);
  if (plan.error) return { plan, error: plan.error, go: false, reasons: [plan.error], cautions: [] };
  const prof = profile(plan.path, s, env, model), end = prof.at(-1);
  const stopMin = plan.path.reduce((t, p) => t + (p.dwell || 0), 0);
  const wb = walkBackCheck(prof, field, s);
  const Q = judge.score(plan.path.map((p) => p.cell), { withFatigue: false, refLenM: loopLength(stops) }).Q;
  const row = {
    km: end.dist / 1000, walkMin: end.t - stopMin, stopMin, o2LeftL: s.o2CapacityL - end.o2,
    o2LeftPct: 100 * (1 - end.o2 / s.o2CapacityL), doseMSv: end.dose, targets: plan.legs.length - 1,
    targetsOf: stops.length - 1, Q, flatPaceMin: end.dist / s.walkSpeed,
  };
  return { plan, prof, end, wb, row, ...goNoGo(prof, wb, env, s) };
}

// Hard reasons stop the EVA; cautions are shown but do not.
export function goNoGo(prof, wb, env, s = SUIT) {
  const end = prof.at(-1), reasons = [], cautions = [];
  if (!wb.ok) reasons.push(`Walk-back fails: ${(-wb.minMarginL).toFixed(0)} L short of the ${(s.reserveFrac * 100).toFixed(0)}% reserve.`);
  if (end.t > s.evaLimitMin) reasons.push(`EVA runs ${Math.round(end.t)} min, over the ${s.evaLimitMin} min limit.`);
  if (env) {
    const t0 = env.startLmst, t1 = t0 + end.t / MARS_HOUR_MIN;
    if (t0 < DAYLIGHT[0] || t1 > DAYLIGHT[1]) reasons.push(`Outside the ${DAYLIGHT[0]}:00–${DAYLIGHT[1]}:00 LMST daylight window (ends ${fmtH(t1)}).`);
    const cold = minGroundK(env.hourly, t0, t1);
    if (cold < COLD_GROUND_K) cautions.push(`Ground down to ${Math.round(cold - 273.15)} °C during the walk: limit glove contact.`);
  }
  return { go: reasons.length === 0, reasons, cautions };
}

const fmtH = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
function minGroundK(hourly, t0, t1) {
  let m = Infinity;
  for (let h = t0; h <= t1; h += 0.25) m = Math.min(m, weatherAt(hourly, h).groundK ?? Infinity);
  return m;
}

// EVA start hours that fit the daylight window, each with its ground-temperature range; the warmest-coldest
// moment wins (maximise the minimum ground temperature over the walk).
export function windowOptions(hourly, durationMin, from = DAYLIGHT[0], to = DAYLIGHT[1]) {
  const hours = durationMin / MARS_HOUR_MIN, opts = [];
  for (let h = from; h + hours <= to + 1e-9; h++) {
    let lo = Infinity, hi = -Infinity;
    for (let t = h; t <= h + hours; t += 0.25) { const g = weatherAt(hourly, t).groundK; lo = Math.min(lo, g); hi = Math.max(hi, g); }
    opts.push({ hour: h, groundMinC: lo - 273.15, groundMaxC: hi - 273.15 });
  }
  const best = opts.reduce((b, o) => (!b || o.groundMinC > b.groundMinC ? o : b), null);
  return { opts, best: best?.hour ?? null };
}

// Walking and stop O2 per leg, predicted (used by the debrief).
export function legBreakdown(plan, prof, s = SUIT) {
  const at = (pathIdx) => prof.find((p) => p.i === pathIdx);
  return plan.legs.map((leg, k) => {
    const a = k === 0 ? prof[0] : at(leg.startIdx);
    const nextStart = plan.legs[k + 1]?.startIdx, b = nextStart != null ? at(nextStart) : prof.at(-1);
    const dwell = b.dwell || 0;
    return { from: leg.from, to: leg.to, walkO2L: b.o2 - dwell * stationLpm(s) - a.o2, walkMin: b.t - dwell - a.t,
      stopO2L: dwell * stationLpm(s), stopMin: dwell };
  });
}
