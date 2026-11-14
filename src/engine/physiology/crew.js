// Crew physiological profiles and sensor-frame validation. No rendering code.
import { SUIT } from '../telemetry.js';
import { value } from './catalog.js';

const cohort = value('cohort.ist2').value;

/** Demo crew. Values are ASSUMED and say where they come from; there is no real crew data. */
export const CREW = [
  {
    id: 'EVA-1',
    label: 'EVA-1',
    bodyKg: SUIT.bodyKg,
    bodyKgSource: 'ASSUMED: engine SUIT.bodyKg',
    vo2peakMlKgMin: cohort.vo2pkMlKgMin.mean,
    vo2peakSource: 'ASSUMED: IST-2 cohort mean (NORCROSS-2010-216125 Table 1)',
    hrCalibration: null,
  },
];

/**
 * Physical plausibility ranges used ONLY to reject corrupt sensor values (NaN, unit errors, dropouts).
 * They are not medical limits and never raise alerts.
 */
export const SENSOR_RANGES = { hrBpm: [20, 250], suitPressureKPa: [0, 120], ppO2MmHg: [0, 900], ppCO2MmHg: [0, 100] };
export const MAX_SENSOR_AGE_S = 10;

/** Split a sensor frame into accepted values and rejected fields with reasons. Missing frame -> nothing accepted. */
export function validateSensorFrame(frame) {
  const accepted = {}, rejected = [];
  if (!frame || typeof frame !== 'object') return { accepted, rejected };
  const stale = Number.isFinite(frame.ageS) && frame.ageS > MAX_SENSOR_AGE_S;
  for (const [k, [lo, hi]] of Object.entries(SENSOR_RANGES)) {
    if (!(k in frame) || frame[k] == null) continue;
    const v = frame[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) rejected.push({ field: k, reason: 'not a finite number' });
    else if (v < lo || v > hi) rejected.push({ field: k, reason: `outside the plausible ${lo}-${hi} range` });
    else if (stale) rejected.push({ field: k, reason: `stale (${frame.ageS} s old)` });
    else accepted[k] = v;
  }
  return { accepted, rejected };
}
