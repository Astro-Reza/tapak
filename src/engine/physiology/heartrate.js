// Heart rate from metabolic rate. No rendering code.
// Hoffmann 2021 (NTRS 20210024317): a group HR-MR regression explains only 40 % of variance (R2 0.402); individual
// regressions reach R2 > 0.82. So HR is estimated ONLY from a crew member's own calibration MR = a + b x HR,
// and only inside the MR range that calibration covered. There are no group coefficients in this engine.
import { btuhFromKjh, kjhFromWatts } from './units.js';

export function validCalibration(c) {
  return !!c && Number.isFinite(c.interceptBtuH) && Number.isFinite(c.slopeBtuHPerBpm) && c.slopeBtuHPerBpm > 0
    && Array.isArray(c.mrRangeBtuH) && c.mrRangeBtuH.length === 2 && c.mrRangeBtuH[0] < c.mrRangeBtuH[1] && !!c.source;
}

/** {bpm, status, reason}: status 'estimated' | 'unavailable'. */
export function heartRateFromMr(metabolicW, calibration) {
  if (!validCalibration(calibration)) return { bpm: null, status: 'unavailable', reason: 'no individual HR-MR calibration' };
  const mr = btuhFromKjh(kjhFromWatts(metabolicW));
  const [lo, hi] = calibration.mrRangeBtuH;
  if (mr < lo || mr > hi) return { bpm: null, status: 'unavailable', reason: `metabolic rate ${Math.round(mr)} BTU/h outside the calibrated ${lo}-${hi} BTU/h` };
  return { bpm: (mr - calibration.interceptBtuH) / calibration.slopeBtuHPerBpm, status: 'estimated', reason: `individual calibration (${calibration.source})` };
}
