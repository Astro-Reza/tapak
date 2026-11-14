// Route cost c = alpha*E/Eref + beta*R + delta*t/tref (alpha+beta+delta = 1), mode presets and path quality Q.
// No rendering code.
import { energy, DEFAULT_MODEL, MARS_GRAVITY_RATIO } from './energy.js';
import { oxygen, J_PER_L_O2 } from './oxygen.js';
import { riskSegment, RISK_WEIGHTS } from './risk.js';
import { SUIT, speedAt } from '../telemetry.js';

// Design choices to tune, not measured values.
export const PRESETS = {
  efficient: { alpha: 0.70, beta: 0.10, delta: 0.20 },
  safest: { alpha: 0.15, beta: 0.75, delta: 0.10 },
  balanced: { alpha: 0.40, beta: 0.40, delta: 0.20 },
};
// Slider: t = 0 efficient ... 1 safest.
export function blend(t) {
  const a = PRESETS.efficient, b = PRESETS.safest, k = Math.min(1, Math.max(0, t));
  return { alpha: a.alpha + k * (b.alpha - a.alpha), beta: a.beta + k * (b.beta - a.beta), delta: a.delta + k * (b.delta - a.delta) };
}

const ctxFor = (s, slopeDeg) => ({ bodyKg: s.bodyKg, loadKg: s.suitKg, speedMs: speedAt(slopeDeg, s) / 60,
  gravityRatio: MARS_GRAVITY_RATIO, kSuit: s.kSuit ?? 1 });

// Raw terms of the move i -> j on grid g (run in metres). With a surrogate (models/surrogate.js), its relative
// cost of transport and fall probability replace the analytic energy and risk in the COST; Ea (analytic energy)
// is still kept for oxygen, since simulated energy is only relative.
function terms(g, i, j, run, s, model, eta, fatigue = 0, rw = RISK_WEIGHTS, sur = null) {
  const slope = Math.max(g.slope[i], g.slope[j]), rough = Math.max(g.rough?.[i] ?? 0, g.rough?.[j] ?? 0);
  const grade_pct = 100 * (g.elev[j] - g.elev[i]) / run;
  const e = energy({ dx_m: run, grade_pct, roughness: rough, eta }, ctxFor(s, slope), model);
  const R = riskSegment({ slopeDeg: slope, roughness: rough, grade_pct, fatigue }, s.maxSlopeDeg, rw);
  // per-move lookup (models/lookup.js): signed grade along the move + roughness in metres (g.roughM)
  if (sur?.at) {
    const x = sur.at(Math.atan(grade_pct / 100) * 180 / Math.PI, Math.max(g.roughM[i], g.roughM[j]));
    return { E: x.cot * run, t: e.timeS, R: x.pFall, Ea: e.energyJ };
  }
  if (sur) return { E: (sur.cot[i] + sur.cot[j]) / 2 * run, t: e.timeS, R: (sur.pFall[i] + sur.pFall[j]) / 2, Ea: e.energyJ };
  return { E: e.energyJ, t: e.timeS, R, Ea: e.energyJ };
}

// Build the cost for one grid, suit and weight set. Eref / tref = median over the walkable grid's
// east and south moves; cWorst = their 95th-percentile cost (used by Q).
export function makeCost(g, { weights = PRESETS.balanced, s = SUIT, model = DEFAULT_MODEL, eta = 1, riskWeights = RISK_WEIGHTS, surrogate = null } = {}) {
  const Es = [], ts = [], Rs = [];
  for (let r = 0; r < g.rows - 1; r++) for (let c = 0; c < g.cols - 1; c++) {
    const i = r * g.cols + c;
    if (g.slope[i] > s.maxSlopeDeg) continue;
    for (const [j, run] of [[i + 1, g.cell[0]], [i + g.cols, g.cell[1]]]) {
      if (g.slope[j] > s.maxSlopeDeg) continue;
      const x = terms(g, i, j, run, s, model, eta, 0, riskWeights, surrogate); Es.push(x.E); ts.push(x.t); Rs.push(x.R);
    }
  }
  const med = (a) => Float64Array.from(a).sort()[a.length >> 1];
  // risk is divided by its median too, so all three terms sit on the same scale as the weights assume
  const Eref = med(Es), tref = med(ts), Rref = med(Rs) || 1, refRun = (g.cell[0] + g.cell[1]) / 2; // || 1: a surrogate may report zero risk for most cells
  const { alpha, beta, delta } = weights;
  // risk counts per metre walked, so a diagonal move is not cheaper per metre than a straight one
  const combine = (x, run) => alpha * x.E / Eref + beta * x.R / Rref * run / refRun + delta * x.t / tref;
  const cs = Es.map((E, k) => combine({ E, t: ts[k], R: Rs[k] }, refRun));
  const cWorst = Float64Array.from(cs).sort()[Math.floor(0.95 * cs.length)];
  return {
    weights, model, Eref, tref, Rref, cWorst, source: surrogate ? `surrogate: ${surrogate.source}` : 'analytic',
    // ponytail: the search leaves out the fatigue term (it depends on the path so far, which A*/Dijkstra
    // can't carry); score() adds it back. Upgrade to an energy-state search if fatigue must steer routes.
    edge: (i, j, run) => combine(terms(g, i, j, run, s, model, eta, 0, riskWeights, surrogate), run),
    // Score a finished path of grid cells: total cost (with fatigue), O2, and Q = 100 (1 - sum c / sum c_worst).
    // sum c_worst = cWorst over `refLenM` (pass the straight-line length of the trip) so that every route
    // between the same stops shares one yardstick and a cheaper route always scores higher.
    score(cells, { withFatigue = true, refLenM = null } = {}) {
      let sumC = 0, Ej = 0, o2L = 0, n = 0;
      const budgetJ = s.o2CapacityL * J_PER_L_O2;
      for (let k = 1; k < cells.length; k++) {
        const i = cells[k - 1], j = cells[k];
        const run = Math.hypot((j % g.cols - i % g.cols) * g.cell[0], (((j / g.cols) | 0) - ((i / g.cols) | 0)) * g.cell[1]);
        if (!run) continue;
        const x = terms(g, i, j, run, s, model, eta, withFatigue ? Ej / budgetJ : 0, riskWeights, surrogate);
        sumC += combine(x, run); Ej += x.Ea; o2L += oxygen(x.Ea / x.t, x.t).o2L; n += run / refRun;
      }
      const ref = refLenM ? refLenM / refRun : n;
      return { sumC, walkO2L: o2L, Q: Math.min(100, Math.max(0, 100 * (1 - sumC / (ref * cWorst)))) };
    },
  };
}
