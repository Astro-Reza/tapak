// Adapter for marswalk-model's planner_lookup_mars.json (scripts/train.py, planner_lookup). No rendering code.
// Verified against Astro-Reza/marswalk-model@main (2026-11-14):
//   { slope_deg: [S], roughness_m: [R], gravity, suit_mass_kg, cot: [R][S], fall: [R][S], mos?: [R][S] }
//   slope_deg   signed slope ALONG the walking direction, uphill > 0 (terrain.py: z = tan(slope) * s)
//   roughness_m std of height residual after a plane fit over one 12 x 16 m patch (terrain.py patch_stats)
//   cot         net cost of transport, J/kg/m, a muscle-work proxy (relative only, README)
//   fall        probability of falling somewhere in one patch, not per step (train.py "fell", clf)
// Unlike cost_surrogate.json (one value per cell), this is looked up per MOVE, with the move's signed grade.
// The file is untrusted input: anything malformed or built for another suit/gravity is rejected, and the app
// keeps the analytic model.

const isAxis = (a, n) => Array.isArray(a) && a.length >= 2 && a.every((v, k) => Number.isFinite(v) && (k === 0 || v > a[k - 1]))
  && (n == null || a.length === n);

function table(json, name, R, S, lo, hi) {
  const t = json[name];
  if (!Array.isArray(t) || t.length !== R) throw new Error(`lookup: ${name} must have ${R} roughness rows`);
  const out = new Float64Array(R * S);
  t.forEach((row, r) => {
    if (!Array.isArray(row) || row.length !== S) throw new Error(`lookup: ${name}[${r}] must have ${S} slope values`);
    row.forEach((v, s) => {
      if (typeof v !== 'number' || !(v >= lo && v <= hi)) throw new Error(`lookup: ${name}[${r}][${s}] out of range`);
      out[r * S + s] = v;
    });
  });
  return out;
}

// Index + fraction of x on a sorted axis, clamped to its ends (clamped = true when x lies outside).
function locate(axis, x) {
  const n = axis.length;
  if (!(x > axis[0])) return { k: 0, f: 0, clamped: x < axis[0] };
  if (!(x < axis[n - 1])) return { k: n - 2, f: 1, clamped: x > axis[n - 1] };
  let k = 0; while (axis[k + 1] <= x) k++;
  return { k, f: (x - axis[k]) / (axis[k + 1] - axis[k]), clamped: false };
}

// opts: { suitKg, gravity } of the suit the app plans for; tolerances say how close the lookup must be.
export function adaptLookup(json, { suitKg, gravity, suitTolKg = 2.5, gravityTol = 0.05 } = {}) {
  if (!json || typeof json !== 'object') throw new Error('lookup: not an object');
  if (!isAxis(json.slope_deg) || !isAxis(json.roughness_m)) throw new Error('lookup: slope_deg / roughness_m must be increasing number arrays');
  if (!(json.roughness_m[0] >= 0)) throw new Error('lookup: roughness_m must be >= 0');
  for (const k of ['gravity', 'suit_mass_kg']) if (!Number.isFinite(json[k])) throw new Error(`lookup: ${k} missing`);
  if (gravity != null && Math.abs(json.gravity - gravity) > gravityTol) throw new Error(`lookup: built for g = ${json.gravity}, app uses ${gravity}`);
  // suit mass changes the energy cost directly, so a lookup for another suit is not used silently
  if (suitKg != null && Math.abs(json.suit_mass_kg - suitKg) > suitTolKg) throw new Error(`lookup: built for a ${json.suit_mass_kg} kg suit, app plans for ${suitKg} kg`);
  const slopes = json.slope_deg, roughs = json.roughness_m, S = slopes.length, R = roughs.length;
  const cot = table(json, 'cot', R, S, 1e-6, 1e3), fall = table(json, 'fall', R, S, 0, 1);
  const stats = { calls: 0, slopeClamped: 0, roughClamped: 0 };
  const interp = (t, a, b) => {
    const v = (r, s) => t[r * S + s];
    const r0 = a.k, s0 = b.k;
    return (1 - a.f) * ((1 - b.f) * v(r0, s0) + b.f * v(r0, s0 + 1)) + a.f * ((1 - b.f) * v(r0 + 1, s0) + b.f * v(r0 + 1, s0 + 1));
  };
  return {
    source: `marswalk-model lookup · g ${json.gravity} · suit ${json.suit_mass_kg} kg`,
    slopeRange: [slopes[0], slopes[S - 1]], roughRange: [roughs[0], roughs[R - 1]], stats,
    // signed grade along the move (uphill > 0) and roughness in metres -> relative cot and patch fall probability
    at(gradeDeg, roughM) {
      const b = locate(slopes, gradeDeg), a = locate(roughs, roughM);
      stats.calls++; if (b.clamped) stats.slopeClamped++; if (a.clamped) stats.roughClamped++;
      return { cot: interp(cot, a, b), pFall: interp(fall, a, b) };
    },
  };
}
