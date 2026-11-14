// One-call mission planning for the UI: route every mode, then a three-state verdict. No rendering code.
// Calls the engine exactly as MARSWALK/app main.js replanAll() does, with the suit built from profiles.
import { returnField } from './models/returnfield.js';
import { makeCost, PRESETS, blend } from './models/cost.js';
import { evaluatePlan } from './models/evaluate.js';
import { POLICY_PROFILES, suitFor } from './profiles.js';

export const MODES = ['efficient', 'balanced', 'safest'];

// data = {grid, stops, hourly, refElev}; opts = {scienceId, policyId, startLmst, kSuit, modelKey, o2CapacityL}
export function planMission(data, opts = {}) {
  const { scienceId, policyId, startLmst = 9, kSuit = 1, modelKey = 'acsmScaled', o2CapacityL } = opts;
  const extra = { kSuit };
  if (o2CapacityL) extra.o2CapacityL = o2CapacityL;
  const s = suitFor(scienceId, policyId, extra);
  const model = modelKey === 'acsmScaled' ? null : modelKey; // null = the handoff ACSM path, as in main.js
  const env = { hourly: data.hourly, startLmst, refElev: data.refElev };
  const field = returnField(data.grid, data.stops[0].xz, s, model);
  const judge = makeCost(data.grid, { weights: PRESETS.balanced, model: modelKey, s });
  const ctx = { grid: data.grid, stops: data.stops, env, field, judge, model, s };
  const modes = {};
  for (const m of MODES) modes[m] = withVerdict(evaluatePlan(PRESETS[m], ctx), data, s, policyId);
  return { s, env, field, modes, policy: POLICY_PROFILES[policyId ?? 'engine'], planSlider: (t) => withVerdict(evaluatePlan(blend(t), ctx), data, s, policyId) };
}

// GO / CAUTION / NO-GO: hard reasons -> NO-GO; no reasons but cautions -> CAUTION; else GO.
export function verdictOf(reasons, cautions) {
  return reasons.length ? 'NO-GO' : cautions.length ? 'CAUTION' : 'GO';
}

// Adds the policy checks the engine's goNoGo does not know: distance walk-back cap and slope caution on the route.
export function withVerdict(ev, data, s, policyId = 'engine') {
  const reasons = [...ev.reasons], cautions = [...(ev.cautions ?? [])];
  const cap = POLICY_PROFILES[policyId]?.params.walkbackMaxKm;
  let maxFromStartKm = 0, maxSlope = 0;
  if (ev.prof) {
    const [x0, z0] = data.stops[0].xz;
    for (const p of ev.prof) {
      maxFromStartKm = Math.max(maxFromStartKm, Math.hypot(p.x - x0, p.z - z0) / 1000);
      maxSlope = Math.max(maxSlope, p.slope);
    }
    if (cap != null && maxFromStartKm > cap) reasons.push(`Route goes ${maxFromStartKm.toFixed(2)} km from the start, over the ${cap} km walk-back distance.`);
    if (maxSlope > s.cautionSlopeDeg) cautions.push(`Slope up to ${maxSlope.toFixed(1)}° on the route, above the ${s.cautionSlopeDeg}° caution level (limit ${s.maxSlopeDeg}°).`);
  }
  return { ...ev, reasons, cautions, go: reasons.length === 0, verdict: verdictOf(reasons, cautions), maxFromStartKm, maxSlope };
}
