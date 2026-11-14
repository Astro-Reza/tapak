// Thermal load. No rendering code.
// Heat storage needs the 41-Node Man or Wissler model (NASA-STD-3001 V2 Rev F [V2 11011], p.226); neither is in this
// engine, so storage is computed only from an EXPLICIT heat-removal series and is EXPERIMENTAL. Removal is never
// assumed equal to production (Kuznetz 1977: the LCG is controlled, it does not track metabolism by itself).
import { value } from './catalog.js';
import { kjhFromWatts } from './units.js';

/** Metabolic heat production, W. External mechanical work is unknown, so it defaults to 0 (upper bound on heat). */
export const heatProductionW = (metabolicW, externalWorkW = 0) => Math.max(0, metabolicW - externalWorkW);

/** Where a metabolic rate sits relative to the Rev F nominal design range (528-2220 kJ/h). Reference, not an alarm. */
export function mrEnvelope(metabolicW) {
  const [lo, hi] = value('thermal.mr_envelope').value, kjh = kjhFromWatts(metabolicW);
  return { kjh, lo, hi, position: kjh < lo ? 'below' : kjh > hi ? 'above' : 'inside' };
}

/**
 * Net heat stored, kJ per kg body mass, from samples [{dtS, productionW, removalW}] (energy balance:
 * stored = sum((production - removal) * dt)). Throws if any removal value is missing: there is no default.
 */
export function heatStorageKJperKg(samples, bodyKg) {
  let joules = 0;
  for (const x of samples) {
    if (!Number.isFinite(x.removalW)) throw new Error('heat removal unknown: heat storage unavailable');
    joules += (x.productionW - x.removalW) * x.dtS;
  }
  return joules / 1000 / bodyKg;
}
