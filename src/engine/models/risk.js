// Segment risk R (dimensionless, ~0-1). No rendering code.
// R = w1 (slope/slopeMax)^2 + w2 roughness + w3 max(0, -i - 0.20) + w4 F
// i = grade (rise/run), F = energy spent so far / energy budget (fatigue).
// Roughness is a DTM proxy (slope spread inside a 4 m cell); individual rocks are not in the map.

// Weights are design choices (assumed), not from a source; tune them with the team.
export const RISK_WEIGHTS = { slope: 0.6, rough: 0.2, steepDown: 0.1, fatigue: 0.1 }; // tuned 2026-11-14: cuts >15° ground on the balanced route 182 m -> 57 m

export function riskSegment({ slopeDeg, roughness = 0, grade_pct = 0, fatigue = 0 }, slopeMaxDeg, w = RISK_WEIGHTS) {
  const i = grade_pct / 100;
  return w.slope * (slopeDeg / slopeMaxDeg) ** 2 + w.rough * roughness
    + w.steepDown * Math.max(0, -i - 0.20) + w.fatigue * fatigue;
}
