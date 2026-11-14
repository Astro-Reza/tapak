// Crew physiological status as labelled readings for a HUD. No rendering code.
// Every reading says how it was obtained: MEASURED (valid sensor value), DERIVED (closed formula on assumed or modelled
// inputs), MODELLED, ASSUMED, SIMULATED, UNAVAILABLE; confidence 'experimental' marks analog or heritage relations.
import { cite } from './catalog.js';
import { metabolicAt } from './metabolic.js';
import { heatProductionW, mrEnvelope } from './thermal.js';
import { oxygenPartialPressures, ppco2EmuReference, SUIT_SETPOINT } from './atmosphere.js';
import { heartRateFromMr } from './heartrate.js';
import { validateSensorFrame } from './crew.js';
import { kjhFromWatts } from './units.js';

export const PROVENANCE = ['MEASURED', 'DERIVED', 'MODELLED', 'ASSUMED', 'SIMULATED', 'UNAVAILABLE'];

const r = (id, label, value, unit, provenance, source, note = '', confidence = 'nominal') =>
  ({ id, label, value, unit, provenance, source, note, confidence });

/**
 * budget: metabolicBudget(...) of the plan; T: EVA minute; crew: CREW entry; tankL: suit O2 inventory (L);
 * sensor: optional live frame (none exists today); analog: optional second budget for comparison.
 */
export function crewStatus({ budget, T, crew, tankL, sensor = null, analog = null }) {
  const now = metabolicAt(budget, T, crew);
  const { accepted, rejected } = validateSensorFrame(sensor);
  const w = now.row?.watts ?? 0;
  const env = mrEnvelope(w);
  const out = [];
  out.push(r('activity', 'Activity', now.row ? (now.row.kind === 'walk' ? 'Walking' : 'Science stop') : '—', '', 'SIMULATED', 'plan playback',
    now.row?.kind === 'stop' ? `modelled as ${now.row.activity.replace('_', ' ')}` : ''));
  out.push(r('mr', 'Metabolic rate', Math.round(env.kjh), 'kJ/h', 'MODELLED', budget.mode === 'engine' ? 'engine energy model' : 'activity catalog',
    `Rev F nominal design range ${env.lo}-${env.hi} kJ/h: ${env.position}`));
  out.push(r('vo2', 'O₂ uptake', now.row ? now.row.lpm.toFixed(2) : '—', 'L/min', 'MODELLED', 'engine energy model'));
  const leftPct = (100 * (tankL - now.o2L)) / tankL;
  out.push(r('o2left', 'O₂ remaining (metabolic only)', leftPct.toFixed(0), '%', 'MODELLED', 'tank 378 L ASSUMED',
    'leakage and purge not included: upper bound'));
  if (analog) {
    const a = metabolicAt(analog, T, crew);
    out.push(r('o2left-analog', 'O₂ remaining, analog activity rates', ((100 * (tankL - a.o2L)) / tankL).toFixed(0), '%', 'MODELLED',
      cite('vo2.stationary_light'), 'lunar-analog stop rate; Mars gravity outside tested range', 'experimental'));
  }
  out.push(r('energy', 'Energy used', Math.round(now.energyKJ), 'kJ', 'MODELLED', 'integrated metabolic rate'));
  out.push(now.pctVo2peak == null
    ? r('pctpeak', 'Workload', null, '% VO₂peak', 'UNAVAILABLE', '', 'VO₂peak unknown')
    : r('pctpeak', 'Workload', now.pctVo2peak.toFixed(0), '% VO₂peak', 'DERIVED', crew.vo2peakSource, 'no fatigue threshold is sourced', 'experimental'));
  out.push(r('heat', 'Heat production', Math.round(kjhFromWatts(heatProductionW(w))), 'kJ/h', 'MODELLED', 'metabolic rate, external work 0',
    'heat storage needs 41-Node Man/Wissler: unavailable'));
  out.push(r('storage', 'Heat storage', null, 'kJ/kg', 'UNAVAILABLE', cite('thermal.heat_storage_limit'), 'no validated thermal model'));
  if ('hrBpm' in accepted) out.push(r('hr', 'Heart rate', Math.round(accepted.hrBpm), 'bpm', 'MEASURED', 'suit sensor'));
  else {
    const hr = heartRateFromMr(w, crew.hrCalibration);
    out.push(hr.status === 'estimated'
      ? r('hr', 'Heart rate', Math.round(hr.bpm), 'bpm', 'MODELLED', hr.reason, '', 'experimental')
      : r('hr', 'Heart rate', null, 'bpm', 'UNAVAILABLE', cite('hr.mr_relation'), hr.reason));
  }
  const pKPa = accepted.suitPressureKPa ?? SUIT_SETPOINT.pressureKPa;
  out.push(r('psuit', 'Suit pressure', pKPa.toFixed(1), 'kPa', 'suitPressureKPa' in accepted ? 'MEASURED' : 'ASSUMED', 'suitPressureKPa' in accepted ? 'suit sensor' : cite('suit.pressure_emu'),
    'suitPressureKPa' in accepted ? '' : 'EMU set-point, 100 % O₂'));
  const o2 = oxygenPartialPressures(pKPa, SUIT_SETPOINT.fio2);
  out.push('ppO2MmHg' in accepted
    ? r('ppo2', 'ppO₂', Math.round(accepted.ppO2MmHg), 'mmHg', 'MEASURED', 'suit sensor')
    : r('ppo2', 'ppO₂ / PIO₂', `${Math.round(o2.ppO2)} / ${Math.round(o2.pio2)}`, 'mmHg', 'DERIVED', cite('atm.pio2_formula'), `PIO₂ ${o2.band}`));
  out.push('ppCO2MmHg' in accepted
    ? r('ppco2', 'ppCO₂', accepted.ppCO2MmHg.toFixed(1), 'mmHg', 'MEASURED', 'suit sensor')
    : r('ppco2', 'ppCO₂ (EMU reference)', ppco2EmuReference(w).toFixed(1), 'mmHg', 'MODELLED', cite('atm.ppco2_emu_regression'),
      'heritage verification regression, not a Mars-suit prediction', 'experimental'));
  return { readings: out, rejected, now };
}
