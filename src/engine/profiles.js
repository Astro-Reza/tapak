// Configuration profiles. No rendering code.
// SCIENCE profiles change model parameters (what the body and suit do).
// POLICY profiles change mission rules (what the crew is allowed to do).
// Neither is chosen silently: the UI shows the active pair and lets the planner switch.
// Every value names its source; "engine" = MARSWALK/app telemetry.js SUIT, unchanged.
import { SUIT } from './telemetry.js';

export const SCIENCE_PROFILES = {
  'app-60kg': {
    label: 'Suit 60 kg (MARSWALK)',
    params: { suitKg: 60 },
    source: { suitKg: 'suit + PLSS (60 kg)' },
  },
  'app-50kg': {
    label: 'Suit 50 kg (engine)',
    params: { suitKg: 50 },
    source: { suitKg: 'engine SUIT.suitKg (telemetry.js), assumed suit + PLSS' },
  },
  'model-40kg': {
    label: 'Suit 40 kg (marswalk-model)',
    params: { suitKg: 40 },
    source: { suitKg: 'marswalk-model default suit_mass (train.py), assumed' },
  },
};

export const POLICY_PROFILES = {
  engine: {
    label: 'Engine rules (MARSWALK app)',
    params: { maxSlopeDeg: 20, cautionSlopeDeg: 15, reserveFrac: 0.15, reserveFactor: 1.5, evaLimitMin: 360, walkbackMaxKm: null },
    source: {
      maxSlopeDeg: 'engine SUIT.maxSlopeDeg, assumed',
      cautionSlopeDeg: 'engine SUIT.cautionSlopeDeg, assumed',
      reserveFrac: 'engine SUIT.reserveFrac (walk-back reserve), assumed',
      reserveFactor: 'engine SUIT.reserveFactor, assumed',
      evaLimitMin: 'engine SUIT.evaLimitMin, assumed',
      walkbackMaxKm: 'not applied (O2 return field only)',
    },
  },
  'hold-sheet': {
    label: 'Hold criteria (team sheet)',
    params: { maxSlopeDeg: 16, cautionSlopeDeg: 15, reserveFrac: 0.40, reserveFactor: 1.5, evaLimitMin: 240, walkbackMaxKm: 10 },
    source: {
      maxSlopeDeg: 'eva-checklist.ts hold-slope "Prototype default 16°" (mission rule)',
      cautionSlopeDeg: 'not in the sheet; engine value kept (assumed)',
      reserveFrac: 'mission.ts EVA tile "≥ 40 at return" (prototype value), applied as the walk-back reserve',
      reserveFactor: 'not in the sheet; engine value kept (assumed)',
      evaLimitMin: 'mission.ts "4 h cap" (prototype value)',
      walkbackMaxKm: 'eva-checklist.ts hold-walkback "10 km from habitat without rover" (Apollo-derived)',
    },
  },
};

export const DEFAULT_SCIENCE = 'app-50kg';
export const DEFAULT_POLICY = 'engine';

// Suit object for the engine: SUIT with the science and policy values applied (SUIT itself is never mutated).
export function suitFor(scienceId = DEFAULT_SCIENCE, policyId = DEFAULT_POLICY, extra = {}) {
  const sci = SCIENCE_PROFILES[scienceId], pol = POLICY_PROFILES[policyId];
  if (!sci) throw new Error(`unknown science profile ${scienceId}`);
  if (!pol) throw new Error(`unknown policy profile ${policyId}`);
  const { walkbackMaxKm, ...suitPolicy } = pol.params;
  return { ...SUIT, ...sci.params, ...suitPolicy, ...extra };
}
