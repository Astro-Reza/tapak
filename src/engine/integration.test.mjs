// Integration + regression tests for the React app's use of the engine. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUIT, evaluatePlan, returnField, makeCost, PRESETS, planMission, verdictOf, suitFor, POLICY_PROFILES } from './index.js';

const pub = (p) => new URL(`../../public/data/${p}`, import.meta.url);
const app = JSON.parse(readFileSync(pub('app/app.json')));
const n = app.grid.rows * app.grid.cols;
const raw = new Float32Array(readFileSync(pub('app/grid.bin')).buffer.slice(0));
assert.equal(raw.length, 4 * n);
const grid = { ...app.grid, elev: raw.subarray(0, n), slope: raw.subarray(n, 2 * n), sky: raw.subarray(2 * n, 3 * n), rough: raw.subarray(3 * n) };
const wx = JSON.parse(readFileSync(pub('meda_weather.json')));
const elevs = app.stops.map((s) => s.elev).sort((a, b) => a - b);
const data = { grid, stops: app.stops, hourly: wx.hourly, refElev: elevs[elevs.length >> 1] };
const suitBefore = JSON.stringify(SUIT);

// 1. Regression: the default profiles reproduce MARSWALK/app main.js replanAll() exactly.
const base = planMission(data, {});
const env = { hourly: wx.hourly, startLmst: 9, refElev: data.refElev };
const field = returnField(grid, app.stops[0].xz, SUIT, null);
const judge = makeCost(grid, { weights: PRESETS.balanced, model: 'acsmScaled' });
for (const m of ['efficient', 'balanced', 'safest']) {
  const ref = evaluatePlan(PRESETS[m], { grid, stops: app.stops, env, field, judge, model: null });
  const got = base.modes[m];
  assert.equal(got.end.o2, ref.end.o2, `${m} O2 identical`);
  assert.equal(got.end.dist, ref.end.dist, `${m} distance identical`);
  assert.equal(got.end.dose, ref.end.dose, `${m} dose identical`);
  assert.equal(got.wb.minMarginL, ref.wb.minMarginL, `${m} walk-back identical`);
  assert.equal(got.row.Q, ref.row.Q, `${m} Q identical`);
}
// Golden values printed by MARSWALK/app test.mjs on 14 Nov 2026 (efficient loop)
const eff = base.modes.efficient;
assert.equal((eff.end.dist / 1000).toFixed(2), '1.33');
assert.equal(eff.end.o2.toFixed(1), '126.6');
assert.equal(Math.round(eff.end.t), 217);
assert.equal(eff.end.dose.toFixed(3), '0.106');
console.log(`regression: default profiles = original engine (efficient ${eff.end.o2.toFixed(1)} L, ${eff.verdict})`);

// 2. Units: O2 litres, time minutes, distance metres, dose mSv; tank and reserve consistent.
assert.ok(eff.row.o2LeftL > 0 && eff.row.o2LeftL < SUIT.o2CapacityL);
assert.ok(Math.abs(eff.row.o2LeftL + eff.end.o2 - SUIT.o2CapacityL) < 1e-9);
assert.ok(eff.end.dose > 0 && eff.end.dose < 1, 'one EVA dose in mSv, not uGy');

// 3. Verdict mapping
assert.equal(verdictOf([], []), 'GO');
assert.equal(verdictOf([], ['x']), 'CAUTION');
assert.equal(verdictOf(['x'], ['y']), 'NO-GO');

// 4. Profiles are explicit and isolated
assert.equal(JSON.stringify(SUIT), suitBefore, 'SUIT never mutated');
assert.equal(suitFor('model-40kg', 'engine').suitKg, 40);
assert.equal(suitFor('app-50kg', 'hold-sheet').maxSlopeDeg, 16);
assert.throws(() => suitFor('nope', 'engine'));
const light = planMission(data, { scienceId: 'model-40kg' });
assert.ok(light.modes.efficient.end.o2 < eff.end.o2, '40 kg suit uses less O2');
const sheet = planMission(data, { policyId: 'hold-sheet' });
for (const m of ['efficient', 'balanced', 'safest']) {
  const ev = sheet.modes[m];
  if (ev.prof) assert.ok(ev.maxSlope <= 16 + 1e-6 || ev.prof[0].slope > 16, `${m}: route respects the 16° sheet limit`);
  console.log(`hold-sheet ${m}: ${ev.verdict}${ev.error ? ` (${ev.error})` : ''}; ${ev.reasons.concat(ev.cautions).join(' | ')}`);
}
const evaCap = POLICY_PROFILES['hold-sheet'].params.evaLimitMin;
assert.ok(sheet.modes.efficient.reasons.some((r) => r.includes(`${evaCap} min`)) || sheet.modes.efficient.end?.t <= evaCap);
assert.equal(JSON.stringify(SUIT), suitBefore, 'SUIT never mutated after planning');

// 5. Playback: start, end and monotonic O2; status() consumes a sample like the original HUD.
import { sampleAt, status, walkBackMargin } from './index.js';
{
  const prof = eff.prof, s0 = sampleAt(prof, 0), s1 = sampleAt(prof, eff.end.t);
  assert.equal(s0.o2, 0); assert.ok(Math.abs(s1.o2 - eff.end.o2) < 1e-9); assert.ok(Math.abs(s1.dist - eff.end.dist) < 1e-9);
  let last = -1;
  for (let T = 0; T <= eff.end.t; T += 3) { const x = sampleAt(prof, T); assert.ok(x.o2 >= last - 1e-9); last = x.o2; }
  const st = status(sampleAt(prof, 60), eff.end, base.s, base.env);
  assert.ok(['nominal', 'caution', 'return'].includes(st.level));
  assert.ok(walkBackMargin(grid, base.field, sampleAt(prof, 60), base.s) > 0);
  console.log(`playback: T=60 min O2 ${st.o2Pct.toFixed(0)}% level ${st.level}`);
}
console.log('integration tests passed');
