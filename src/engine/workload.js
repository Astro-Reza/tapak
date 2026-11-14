// Walking workload sources behind one typed contract (types: index.d.ts WorkloadSource). No rendering code.
// Biomechanics only: a source says what walking costs. Physiology (physiology/*) turns that into O2, heat, HR;
// mission policy (profiles.js) decides what is allowed. A walking segment takes its energy from ONE source.
import { legO2, speedAt, SUIT } from './telemetry.js';
import { wattsFromLpm, lpmFromWatts } from './physiology/units.js';

/** The Phase 2 analytic model, unchanged: absolute metabolic power from the same legO2() the route uses. */
export function analyticWorkload(model = null) {
  return {
    id: `analytic:${model ?? 'acsmScaled'}`,
    kind: 'analytic',
    absolute: true,
    validated: true,
    /** seg = {distM, grade, slopeDeg}; returns {watts, minutes, o2L} */
    walking(seg, s = SUIT) {
      const v = speedAt(seg.slopeDeg, s); // m/min
      const minutes = seg.distM / v;
      const o2L = legO2(seg.distM, seg.grade, seg.slopeDeg, s, model);
      return { watts: wattsFromLpm(o2L / minutes), minutes, o2L };
    },
  };
}

/**
 * Kinesis Walker (marswalk-model planner_lookup) as a workload source.
 * Its cot is a NET muscle-work proxy in J/kg/m and is RELATIVE (models/lookup.js header), so it cannot give metabolic
 * power on its own. It becomes usable only when every readiness check passes, including an absolute calibration
 * {metabolicJPerCotJ, basalW, sourceId} that maps the proxy to whole-body metabolic power.
 */
export function kinesisReadiness({ lookup, suitKg, gravity, roughCoverage, validated, calibration } = {}) {
  const reasons = [];
  if (!lookup) reasons.push('no planner_lookup loaded');
  if (lookup && Math.abs(lookup.suitMassKg - suitKg) > 2.5) reasons.push(`lookup built for a ${lookup.suitMassKg} kg suit, plan uses ${suitKg} kg`);
  if (lookup && Math.abs(lookup.gravity - gravity) > 0.05) reasons.push(`lookup built for g = ${lookup.gravity}, plan uses ${gravity}`);
  if (!(roughCoverage >= 0.95)) reasons.push(`only ${Math.round((roughCoverage ?? 0) * 100)} % of route moves inside the trained roughness range (need 95 %)`);
  if (validated !== true) reasons.push('walker not validated (check_walker has not passed)');
  if (!calibration || !(calibration.metabolicJPerCotJ > 0) || !(calibration.basalW >= 0) || !calibration.sourceId) {
    reasons.push('no absolute calibration from relative cot to metabolic power');
  }
  return { ready: reasons.length === 0, reasons };
}

export function kinesisWorkload(lookup, readiness, calibration, bodyKg, loadKg) {
  return {
    id: 'kinesis:planner_lookup',
    kind: 'kinesis',
    absolute: !!readiness?.ready,
    validated: !!readiness?.ready,
    walking(seg, s = SUIT) {
      if (!readiness?.ready) throw new Error(`Kinesis workload disabled: ${readiness?.reasons.join('; ') ?? 'not checked'}`);
      const v = speedAt(seg.slopeDeg, s) / 60; // m/s
      const { cot } = lookup.at((Math.atan(seg.grade) * 180) / Math.PI, seg.roughM ?? 0);
      const watts = calibration.basalW + calibration.metabolicJPerCotJ * cot * (bodyKg + loadKg) * v;
      const minutes = seg.distM / (v * 60);
      return { watts, minutes, o2L: lpmFromWatts(watts) * minutes };
    },
  };
}

/** Pick the walking source: Kinesis only when ready, otherwise the analytic model. Never both. */
export const selectWorkload = (analytic, kinesis) => (kinesis?.validated ? kinesis : analytic);
