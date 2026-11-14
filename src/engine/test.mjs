// node app/test.mjs  — checks telemetry numbers and routes on the real grid.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vo2, o2LPerMin, loadFactor, profile, status, SUIT, doseRate, kappa, weatherAt, RADIATION } from './telemetry.js';
import { findPath, planLoop } from './route.js';
import { energy, minettiCw, MODEL_NAMES, MARS_GRAVITY_RATIO } from './models/energy.js';
import { oxygen, vo2FromWatts } from './models/oxygen.js';
import { makeCost, PRESETS, blend } from './models/cost.js';
import { returnField, walkBackCheck, ringCells, reserveL } from './models/returnfield.js';
import { evaluatePlan, windowOptions, legBreakdown, goNoGo } from './models/evaluate.js';
import { simulatePlayback, calibrateKSuit, SIM } from './debrief.js';
import { createLink } from './sync/channel.js';
import { encodePlan, decodePlan, summaryMatches } from './sync/plan.js';
import { loadSurrogate } from './models/surrogate.js';
import { adaptLookup } from './models/lookup.js';
import { speedAt, stationLpm, o2ForLeg } from './telemetry.js';

// ACSM on Earth, unsuited, 80 m/min, 5% grade: 0.1*80 + 1.8*80*0.05 + 3.5 = 18.7 ml/kg/min
const earth = { ...SUIT, suitKg: 0 };
assert.ok(Math.abs(3.5 + (0.1 * 80 + 1.8 * 80 * 0.05) - 18.7) < 1e-9);
assert.ok(Math.abs(loadFactor(earth) - 3.71 / 9.81) < 1e-9);
assert.ok(vo2(50, 0.1) > vo2(50, 0) && vo2(50, -0.1) === vo2(50, 0), 'uphill costs more, downhill no credit');
console.log('flat walk O2 L/min', o2LPerMin(SUIT.walkSpeed, 0).toFixed(3), '| rest', o2LPerMin(0, 0).toFixed(3));

// Flat 1 km out-and-back: reserve must start nominal and end with zero trip home.
const flat = [0, 500, 1000, 500, 0].map((x) => ({ x, z: 0, y: 0, slope: 0 }));
const fp = profile(flat);
const fend = fp[fp.length - 1];
assert.equal(status(fp[0], fend).level, 'nominal');
assert.equal(status(fend, fend).homeO2L, 0);
// Tiny tank: must call for return
assert.equal(status(fp[1], fend, { ...SUIT, o2CapacityL: 1 }).level, 'return');

// Radiation model (Guo+2017): Phi=500 MV gives -kappa 0.135 uGy/day/Pa; reference pressure gives 220 uGy/day
assert.ok(Math.abs(kappa(500) - 0.135) < 1e-9);
assert.ok(Math.abs(doseRate(840) - 220 * 3.05 / 1000) < 1e-9);
assert.ok(doseRate(700) > doseRate(840), 'thinner air, more dose');
assert.ok(Math.abs(doseRate(840, 0.9) - 0.9 * doseRate(840)) < 1e-12, 'terrain shielding scales dose');
// Weather interpolation wraps midnight
const hrs = Array.from({ length: 24 }, (_, h) => ({ lmst_hour: h, air_K: { median: h === 23 ? 200 : h === 0 ? 210 : 0 } }));
assert.equal(weatherAt(hrs, 23.5).airK, 205);

// Real grid
const app = JSON.parse(readFileSync(new URL('../../public/data/app/app.json', import.meta.url)));
const buf = readFileSync(new URL('../../public/data/app/grid.bin', import.meta.url));
const n = app.grid.rows * app.grid.cols;
const f = new Float32Array(buf.buffer, buf.byteOffset, 4 * n);
const g = { ...app.grid, elev: f.subarray(0, n), slope: f.subarray(n, 2 * n), sky: f.subarray(2 * n, 3 * n), rough: f.subarray(3 * n) };

const t0 = performance.now();
const plan = planLoop(g, app.stops);
const ms = performance.now() - t0;
assert.ok(!plan.error, plan.error);
const p = profile(plan.path);
const end = p[p.length - 1];
const maxSlope = Math.max(...plan.path.slice(1, -1).map((q) => q.slope));
assert.ok(end.t > 4 * SUIT.dwellMin, 'dwell time counted at the 4 science stops');
console.log(`loop: ${(end.dist / 1000).toFixed(2)} km, ${end.t.toFixed(0)} min incl. stops, ${end.o2.toFixed(1)} L O2 ` +
  `(${(100 * end.o2 / SUIT.o2CapacityL).toFixed(0)}% of tank), max slope on path ${maxSlope.toFixed(1)}°, A* ${ms.toFixed(0)} ms`);
assert.ok(maxSlope <= SUIT.maxSlopeDeg + 1e-6, 'route stays under the slope limit');
// Straight line between consecutive stops is a lower bound on distance
const direct = app.stops.reduce((d, s, i) => {
  const t = app.stops[(i + 1) % app.stops.length]; return d + Math.hypot(t.xz[0] - s.xz[0], t.xz[1] - s.xz[1]);
}, 0);
assert.ok(end.dist >= direct * 0.97, 'route not shorter than straight lines');
console.log(`straight-line loop ${(direct / 1000).toFixed(2)} km; detour factor ${(end.dist / direct).toFixed(2)}`);
assert.equal(findPath(g, app.stops[0].xz, app.stops[0].xz).length, 1);
// With weather: dose over the EVA is positive and close to rate x time
const wx = JSON.parse(readFileSync(new URL('../../public/data/meda_weather.json', import.meta.url)));
const env = { hourly: wx.hourly, startLmst: 9, refElev: -1820 };
const pe = profile(plan.path, SUIT, env).at(-1);
const st = status(pe, pe, SUIT, env);
console.log(`dose over EVA ${pe.dose.toFixed(3)} mSv (${(pe.dose / pe.t * 1440).toFixed(2)} mSv/day avg); ` +
  `end LMST ${st.lmst.toFixed(1)}, air ${st.airC.toFixed(0)} °C, ground ${st.groundC.toFixed(0)} °C, ${st.pressurePa.toFixed(0)} Pa`);
assert.ok(pe.dose > 0 && pe.dose / pe.t * 1440 < 1.2 * doseRate(st.pressurePa));
// ---------- FigJam energy models (build spec step 2) ----------
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);
// 1. FigJam worked example
const ex = energy({ dx_m: 1000, grade_pct: 10, eta: 1.1 }, { bodyKg: 75, loadKg: 50, speedMs: 1.0, gravityRatio: 0.38, kSuit: 1 }, 'pandolfSantee');
const exO2 = oxygen(ex.powerW, ex.timeS);
assert.ok(near(ex.powerW, 612.7, 0.01) && near(ex.energyJ, 0.613e6, 0.01) && near(exO2.o2L, 30.5, 0.01) && near(exO2.o2g, 43.6, 0.01),
  `worked example ${ex.powerW} W ${exO2.o2L} L`);
// 2. Level Pandolf
const flatCtx = { bodyKg: 80, loadKg: 50, speedMs: 0.833, gravityRatio: MARS_GRAVITY_RATIO, kSuit: 1 };
const lvl = energy({ dx_m: 100, grade_pct: 0, eta: 1 }, flatCtx, 'pandolfSantee');
assert.ok(near(lvl.powerW, 357, 0.01) && near(vo2FromWatts(lvl.powerW), 1.07, 0.01));
// 3. Default model = scaled ACSM, identical to telemetry.js (handoff baseline above stays unchanged)
const acsm = energy({ dx_m: 100, grade_pct: 8 }, flatCtx);
assert.ok(near(vo2FromWatts(acsm.powerW), o2LPerMin(0.833 * 60, 0.08), 1e-9), 'energy.js ACSM matches telemetry.js');
// 4. Minetti level value, and where the minimum really is
assert.equal(minettiCw(0), 2.5);
let iMin = 0; for (let i = -0.45; i <= 0.45; i += 0.001) if (minettiCw(i) < minettiCw(iMin)) iMin = i;
console.log(`Minetti minimum at i = ${iMin.toFixed(3)} (${minettiCw(iMin).toFixed(2)} J/kg/m); value at -0.10 = ${minettiCw(-0.1).toFixed(2)}`);
// 5. Downhill pair: descent cheaper than level when gravity scales uphill only; the all-grades variant fails
const pw = (G, ctx = flatCtx) => energy({ dx_m: 1, grade_pct: G, eta: 1 }, ctx, 'pandolfSantee').powerW;
assert.ok(pw(-10) < pw(0), 'downhill -10% below level');
const allGrades = (G) => { const W = 80, L = 50, V = 0.833, WL = 130, gm = MARS_GRAVITY_RATIO;
  return 1.5 * W + 2 * WL * (L / W) ** 2 + WL * (1.5 * V * V + 0.35 * V * G * gm) - (G * WL * V / 3.5 - WL * (G + 6) ** 2 / W + (25 - V * V)); };
assert.ok(allGrades(-10) > allGrades(0), 'regression: scaling downhill by 0.38 makes descent cost more than level');

// Three-model comparison
const flatW = Object.keys(MODEL_NAMES).map((m) => [m, energy({ dx_m: 1, grade_pct: 0, eta: 1 }, flatCtx, m).powerW]);
console.log('flat walk W80 L50 0.833 m/s:', flatW.map(([m, w]) => `${MODEL_NAMES[m]} ${w.toFixed(0)} W (${vo2FromWatts(w).toFixed(2)} L/min)`).join(' | '));
console.log('grade %  ' + Object.values(MODEL_NAMES).join(' | ') + '   (W)');
for (const G of [-20, -15, -10, -5, 0, 5, 10, 15]) {
  console.log(`${String(G).padStart(4)}     ` + Object.keys(MODEL_NAMES).map((m) => energy({ dx_m: 1, grade_pct: G, eta: 1 }, flatCtx, m).powerW.toFixed(0).padStart(6)).join(' | '));
}
// Same route, whole EVA, each model (speed taper and stop time as in telemetry.js)
const stopO2 = plan.path.reduce((s, p) => s + (p.dwell || 0), 0) * stationLpm();
for (const m of Object.keys(MODEL_NAMES)) {
  let walkL = 0;
  for (let k = 1; k < plan.path.length; k++) {
    const a = plan.path[k - 1], b = plan.path[k], run = Math.hypot(b.x - a.x, b.z - a.z);
    if (!run) continue;
    const e = energy({ dx_m: run, grade_pct: 100 * (b.y - a.y) / run, eta: 1 },
      { ...flatCtx, speedMs: speedAt(Math.max(a.slope, b.slope)) / 60 }, m);
    walkL += oxygen(e.powerW, e.timeS).o2L;
  }
  console.log(`EVA O2 with ${MODEL_NAMES[m]}: walking ${walkL.toFixed(1)} L + stops ${stopO2.toFixed(1)} L = ${(walkL + stopO2).toFixed(1)} L (${(100 * (walkL + stopO2) / SUIT.o2CapacityL).toFixed(0)}% of tank)`);
}
// Time breakdown behind the 3 h 37 min total
const walkMin = end.t - plan.path.reduce((s, p) => s + (p.dwell || 0), 0);
console.log(`time: walking ${walkMin.toFixed(1)} min (flat-speed would be ${(end.dist / SUIT.walkSpeed).toFixed(1)}) + ${plan.path.filter((p) => p.dwell).length} stops x ${SUIT.dwellMin} min`);

// ---------- Step 3: risk, cost, modes, Q ----------
const modes = {};
for (const [name, w] of Object.entries(PRESETS)) {
  const cost = makeCost(g, { weights: w });
  const t1 = performance.now(), pl = planLoop(g, app.stops, SUIT, cost.edge), ms3 = performance.now() - t1;
  assert.ok(!pl.error, `${name}: ${pl.error}`);
  const pr = profile(pl.path).at(-1);
  modes[name] = { pl, pr, cost, ms3 };
  assert.ok(pr.o2 < SUIT.o2CapacityL, `${name} within O2`);
}
const key = (pl) => pl.path.map((p) => p.cell).join(',');
assert.ok(new Set(Object.values(modes).map((m) => key(m.pl))).size === 3, 'three modes give three different routes');
// Score every route on the same (balanced) scale so Q is comparable
const judge = modes.balanced.cost;
console.log('mode       km    walk min  O2 L   max slope  >15° m  mean rough  Q(balanced)  search ms');
const scored = Object.entries(modes).map(([name, m]) => {
  const sc = judge.score(m.pl.path.map((p) => p.cell), { withFatigue: false, refLenM: direct });
  const walkMin = m.pr.t - m.pl.path.reduce((t, p) => t + (p.dwell || 0), 0);
  const ms = Math.max(...m.pl.path.slice(1, -1).map((p) => p.slope));
  const mr = m.pl.path.reduce((t, p) => t + g.rough[p.cell], 0) / m.pl.path.length;
  const steepM = m.pl.path.slice(1).reduce((t, b, k) => { const a = m.pl.path[k];
    return t + (Math.max(a.slope, b.slope) > 15 ? Math.hypot(b.x - a.x, b.z - a.z) : 0); }, 0);
  console.log(`${name.padEnd(9)} ${(m.pr.dist / 1000).toFixed(2)}  ${walkMin.toFixed(1).padStart(7)}  ${m.pr.o2.toFixed(1).padStart(6)}  ${ms.toFixed(1).padStart(8)}°  ${steepM.toFixed(0).padStart(5)}  ${mr.toFixed(2).padStart(9)}  ${sc.Q.toFixed(1).padStart(10)}  ${m.ms3.toFixed(0).padStart(8)}`);
  assert.ok(sc.Q >= 0 && sc.Q <= 100);
  return { name, ...sc };
});
// Q falls as cost rises; the balanced route is the cheapest on the balanced scale (search excludes fatigue)
const byCost = [...scored].sort((a, b) => a.sumC - b.sumC);
for (let k = 1; k < byCost.length; k++) assert.ok(byCost[k].Q <= byCost[k - 1].Q, 'Q higher for cheaper route');
assert.equal(byCost[0].name, 'balanced');
assert.deepEqual(blend(0), PRESETS.efficient);
assert.ok(Math.abs(blend(1).beta - PRESETS.safest.beta) < 1e-12);
// 15-degree limit: does a route still exist?
const s15 = { ...SUIT, maxSlopeDeg: 15 }, pl15 = planLoop(g, app.stops, s15);
console.log(`15° limit: ${pl15.error ? 'NO route — ' + pl15.error : `route exists, ${(profile(pl15.path, s15).at(-1).dist / 1000).toFixed(2)} km`}`);

// ---------- Step 4: walk-back return field ----------
const t4 = performance.now(), field = returnField(g, app.stops[0].xz), ms4 = performance.now() - t4;
const reach = field.cost.filter(Number.isFinite);
console.log(`return field: ${ms4.toFixed(0)} ms; reachable cells ${(100 * reach.length / field.cost.length).toFixed(0)}%; ` +
  `costliest walk home on the map ${reach.reduce((a, b) => Math.max(a, b), 0).toFixed(1)} L (reserve ${reserveL().toFixed(1)} L)`);
assert.equal(field.cost[field.start], 0);
for (const [name, pl] of [['default', plan], ...Object.entries(modes).map(([k, m]) => [k, m.pl])]) {
  const wb = walkBackCheck(profile(pl.path), field);
  console.log(`walk-back ${name}: ${wb.ok ? 'OK' : 'FAIL'}, tightest margin ${wb.minMarginL.toFixed(1)} L above reserve`);
  assert.ok(wb.ok, `${name} route keeps the walk-back reserve`);
}
// Each stop's return cost matches walking the planned way home or less (the field is the cheapest way)
const homeLeg = profile(plan.path).at(-1).o2 - profile(plan.path).find((p) => p.cell === plan.path[plan.legs.at(-1).startIdx].cell).o2;
assert.ok(field.cost[plan.path[plan.legs.at(-1).startIdx].cell] <= homeLeg + 1e-9, 'field <= planned last leg');
// Ring: at full tank it lies beyond this 2 km map; with a nearly empty tank it appears, and at its cells
// the O2 left on arriving home equals the reserve (within one grid move).
assert.equal(ringCells(g, field, SUIT.o2CapacityL).length, 0);
const left = reserveL() + 5, ring = ringCells(g, field, left);
assert.ok(ring.length > 0, 'ring appears when only 5 L above reserve');
// worst single move: a diagonal step straight up a slope at the limit, at the slowest speed
const diag = Math.hypot(...g.cell), oneMove = o2ForLeg(diag, Math.tan(SUIT.maxSlopeDeg * Math.PI / 180), SUIT.maxSlopeDeg);
const edge = ring.map((i) => left - field.cost[i] - reserveL());
console.log(`ring at reserve+5 L: ${ring.length} cells; O2 above reserve on arrival home ${Math.min(...edge).toFixed(3)}-${Math.max(...edge).toFixed(3)} L`);
assert.ok(Math.min(...edge) >= 0 && Math.max(...edge) <= oneMove, 'ring cells arrive home with the reserve, give or take one move');

// ---------- Step 5: plan evaluation, EVA window, debrief ----------
const ctx5 = { grid: g, stops: app.stops, env: { ...env, startLmst: 9 }, field, judge };
const evE = evaluatePlan(PRESETS.efficient, ctx5);
assert.ok(evE.go && Math.abs(evE.row.km - 1.33) < 0.01 && Math.abs(evE.row.o2LeftL - (SUIT.o2CapacityL - 126.6)) < 0.2, 'efficient mode reproduces the baseline');
assert.equal(evE.row.targets, 4);
const late = goNoGo(evE.prof, evE.wb, { ...env, startLmst: 15 });
assert.ok(!late.go && /daylight/.test(late.reasons[0]), 'a 15:00 start runs past daylight -> NO-GO');
const tiny = { ...SUIT, o2CapacityL: 100 };
assert.ok(!goNoGo(evE.prof, walkBackCheck(evE.prof, field, tiny), ctx5.env, tiny).go, '100 L tank -> NO-GO');
const win = windowOptions(wx.hourly, evE.end.t);
console.log(`EVA windows: ${win.opts.map((o) => `${o.hour}:00 [${Math.round(o.groundMinC)}..${Math.round(o.groundMaxC)} °C]`).join(' ')} -> best ${win.best}:00`);
assert.ok(win.opts.every((o) => o.hour + evE.end.t / 61.65 <= 17) && win.best === win.opts.reduce((b, o) => (o.groundMinC > b.groundMinC ? o : b)).hour);
const legs = legBreakdown(evE.plan, evE.prof);
assert.ok(Math.abs(legs.reduce((t, l) => t + l.walkO2L + l.stopO2L, 0) - evE.end.o2) < 1e-6, 'legs sum to the EVA total');
const kEst = calibrateKSuit(simulatePlayback(legs));
console.log(`debrief: simulated true k_suit ${SIM.trueKSuit}, recovered ${kEst.toFixed(3)}`);
assert.ok(Math.abs(kEst - SIM.trueKSuit) < 0.03, 'calibration recovers the hidden k_suit');
assert.ok(Math.abs(calibrateKSuit(simulatePlayback(legs, SIM, 1.1), 1.1) - kEst) < 1e-9, 'calibration is stable once k_suit is applied');

// ---------- Step 6: master / astronaut link ----------
const recipe = { v: 1, mode: 'balanced', sliderT: 0.5, modelKey: 'acsmScaled', startLmst: 11, kSuit: 1, o2CapacityL: 378, summary: { km: 1.36, o2L: 127.1 } };
const enc = encodePlan(recipe);
assert.deepEqual(decodePlan(enc), recipe);
console.log(`plan URL parameter: ${enc.length} characters`);
for (const bad of [{ ...recipe, mode: 'yolo' }, { ...recipe, kSuit: 9 }, { ...recipe, startLmst: 9.5 }, { ...recipe, v: 2 }, { ...recipe, modelKey: '__proto__' }])
  assert.throws(() => encodePlan(bad));
assert.throws(() => decodePlan('x'.repeat(3000)));
assert.ok(summaryMatches(recipe.summary, { km: 1.364, o2L: 127.3 }) && !summaryMatches(recipe.summary, { km: 1.43, o2L: 127.1 }));
// Plan sent with a delay, master closes at once: the astronaut still receives it after the delay, then keeps running.
const DELAY = 0.4, got = [];
const astro = createLink({ role: 'astronaut', onMessage: (m) => got.push({ m, at: Date.now() }) });
const master = createLink({ role: 'master', onMessage: () => {} });
master.setDelay(DELAY);
const sentAt = Date.now();
master.send('plan', recipe);
master.close();
await new Promise((r) => setTimeout(r, 150));
assert.equal(got.length, 0, 'not delivered before the delay');
await new Promise((r) => setTimeout(r, 450));
assert.equal(got.length, 1, 'delivered after the delay, master already closed');
assert.ok(got[0].at - sentAt >= DELAY * 1000 - 5 && got[0].m.type === 'plan');
assert.deepEqual(decodePlan(encodePlan(got[0].m.payload)), recipe);
astro.send('status', { t: 1 }); // nobody listening: must not throw, astronaut carries on
astro.close();
console.log(`sync: plan delivered ${got[0].at - sentAt} ms after send (delay ${DELAY * 1000} ms), master closed first`);

// ---------- Step 7: optional surrogate grids ----------
const synth = (over = {}) => ({ version: 1, rows: g.rows, cols: g.cols, source: 'synthetic test grid',
  cot: Array.from(g.slope, (sl, i) => (i % 97 === 0 ? null : 1000 * (1 + sl / 10))),
  pFall: Array.from(g.slope, (sl) => Math.min(1, (sl / 25) ** 3)), ...over });
const sur = loadSurrogate(synth(), g);
assert.ok(sur.cot.every(Number.isFinite) && sur.pFall.every(Number.isFinite), 'nulls filled with medians');
assert.throws(() => loadSurrogate(synth({ rows: 10 }), g), /grid/);
assert.throws(() => loadSurrogate(synth({ pFall: [...synth().pFall.slice(1), 2] }), g), /out of range/);
assert.throws(() => loadSurrogate(synth({ cot: ['1'] }), g));
assert.throws(() => loadSurrogate({ version: 2 }, g), /version/);
// all-zero fall probability must not break the cost (Rref guard)
const zeroCost = makeCost(g, { weights: PRESETS.balanced, surrogate: loadSurrogate(synth({ pFall: new Array(n).fill(0) }), g) });
assert.ok(Number.isFinite(zeroCost.edge(1000, 1001, g.cell[0])));
// Behaviour: mark a 'boulder field' (pFall 0.9) across the middle of the safest analytic route; the surrogate
// route must avoid it, and O2 still comes from the analytic model.
const mid = modes.safest.pl.path[Math.floor(modes.safest.pl.path.length / 3)].cell;
const mr0 = (mid / g.cols) | 0, mc0 = mid % g.cols, boulders = synth();
for (let r = mr0 - 6; r <= mr0 + 6; r++) for (let c = mc0 - 6; c <= mc0 + 6; c++) boulders.pFall[r * g.cols + c] = 0.9;
const surCost = makeCost(g, { weights: PRESETS.safest, surrogate: loadSurrogate(boulders, g) });
const surPl = planLoop(g, app.stops, SUIT, surCost.edge);
const inField = (p) => Math.abs(((p.cell / g.cols) | 0) - mr0) <= 6 && Math.abs(p.cell % g.cols - mc0) <= 6;
const hits = (pl) => pl.path.filter(inField).length;
console.log(`surrogate: boulder field cells on route, analytic ${hits(modes.safest.pl)} -> surrogate ${hits(surPl)}; source "${surCost.source}"`);
assert.ok(hits(modes.safest.pl) > 0 && hits(surPl) < hits(modes.safest.pl), 'surrogate steers around high fall probability');
const sc7 = surCost.score(surPl.path.map((p) => p.cell), { withFatigue: false });
assert.ok(sc7.walkO2L > 10 && sc7.walkO2L < 60, `O2 stays analytic litres (${sc7.walkO2L.toFixed(1)} L)`);

// ---------- Step 8: marswalk-model planner_lookup_mars.json adapter ----------
// Fixture in the exact shape train.py planner_lookup() writes: tables are [roughness][slope].
const LS = Array.from({ length: 51 }, (_, k) => k - 25), LR = [0, 0.01, 0.02, 0.04, 0.06];
const lookupFix = (over = {}) => ({ slope_deg: LS, roughness_m: LR, gravity: 3.711, suit_mass_kg: 50,
  cot: LR.map((r) => LS.map((s) => 2 + 0.25 * Math.max(s, 0) + 0.05 * Math.max(-s - 10, 0) + 20 * r)),
  fall: LR.map((r) => LS.map((s) => Math.min(1, 0.01 + (s / 25) ** 2 * 0.3 + 5 * r))),
  mos: LR.map(() => LS.map(() => 0.05)), ...over });
const lk = adaptLookup(lookupFix(), { suitKg: 50, gravity: 3.71 });
assert.equal(lk.at(10, 0.02).cot, 2 + 2.5 + 0.4, 'exact at a grid node');
assert.ok(Math.abs(lk.at(10.5, 0.03).cot - (2 + 2.625 + 0.6)) < 1e-9, 'bilinear between nodes');
assert.ok(lk.at(10, 0).cot > lk.at(-10, 0).cot, 'signed slope: uphill costs more than the same downhill');
lk.at(30, 0.2); assert.equal(lk.stats.slopeClamped, 1); assert.equal(lk.stats.roughClamped, 1);
assert.equal(lk.at(30, 0.2).cot, lk.at(25, 0.06).cot, 'outside the trained range: clamped to the edge, counted');
// rejected: other suit / gravity, wrong shape, bad values, unsorted axes
assert.throws(() => adaptLookup(lookupFix({ suit_mass_kg: 40 }), { suitKg: 50, gravity: 3.71 }), /40 kg suit/);
assert.throws(() => adaptLookup(lookupFix({ gravity: 9.81 }), { suitKg: 50, gravity: 3.71 }), /g = 9.81/);
assert.throws(() => adaptLookup(lookupFix({ cot: lookupFix().cot.slice(1) }), {}), /roughness rows/);
assert.throws(() => adaptLookup(lookupFix({ fall: [[2, ...lookupFix().fall[0].slice(1)], ...lookupFix().fall.slice(1)] }), {}), /out of range/);
assert.throws(() => adaptLookup(lookupFix({ slope_deg: [...LS].reverse() }), {}), /increasing/);
assert.throws(() => adaptLookup(lookupFix({ gravity: undefined }), {}), /gravity missing/);
// End to end on the real grid with roughness in metres (data/app/rough_m.bin, scripts/export_rough_m.py)
let roughM = null;
try { roughM = new Float32Array(readFileSync(new URL('../../public/data/app/rough_m.bin', import.meta.url)).buffer.slice(0)); } catch { /* not exported */ }
if (roughM && roughM.length === n) {
  const gl = { ...g, roughM }, lk2 = adaptLookup(lookupFix(), { suitKg: SUIT.suitKg, gravity: 3.71 });
  const lkCost = makeCost(gl, { weights: PRESETS.balanced, surrogate: lk2 });
  const lkPl = planLoop(gl, app.stops, SUIT, lkCost.edge);
  assert.ok(!lkPl.error && lkPl.path.length > 10, 'lookup cost still finds the loop');
  const sc8 = lkCost.score(lkPl.path.map((p) => p.cell), { withFatigue: false });
  assert.ok(sc8.walkO2L > 10 && sc8.walkO2L < 60, `O2 stays analytic litres (${sc8.walkO2L.toFixed(1)} L)`);
  console.log(`lookup: loop ${(lkPl.path.length)} cells, O2 ${sc8.walkO2L.toFixed(1)} L; moves outside trained roughness ` +
    `${(100 * lk2.stats.roughClamped / lk2.stats.calls).toFixed(0)}%, slope ${(100 * lk2.stats.slopeClamped / lk2.stats.calls).toFixed(1)}%`);
} else console.log('lookup: rough_m.bin not exported, end-to-end check skipped');

console.log('all tests passed');
