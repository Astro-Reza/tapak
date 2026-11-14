// Phase 3 physiology validation. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { planMission, SUIT, analyticWorkload, kinesisReadiness, kinesisWorkload, selectWorkload,
  activityTimeline, metabolicBudget, metabolicAt, crewStatus, PROVENANCE, CREW, validateSensorFrame, activityVo2, CATALOG } from './index.js';
import { lpmFromMlKgMin, wattsFromLpm, btuhFromKjh, kpaFromPsi } from './physiology/units.js';
import { oxygenPartialPressures, ppco2EmuReference } from './physiology/atmosphere.js';
import { heatStorageKJperKg, mrEnvelope } from './physiology/thermal.js';
import { heartRateFromMr } from './physiology/heartrate.js';
import { J_PER_L_O2 } from './models/oxygen.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const pub = (p) => new URL(`../../public/data/${p}`, import.meta.url);
const app = JSON.parse(readFileSync(pub('app/app.json')));
const n = app.grid.rows * app.grid.cols;
const raw = new Float32Array(readFileSync(pub('app/grid.bin')).buffer.slice(0));
const grid = { ...app.grid, elev: raw.subarray(0, n), slope: raw.subarray(n, 2 * n), sky: raw.subarray(2 * n, 3 * n), rough: raw.subarray(3 * n) };
const wx = JSON.parse(readFileSync(pub('meda_weather.json')));
const el = app.stops.map((s) => s.elev).sort((a, b) => a - b);
const plan = planMission({ grid, stops: app.stops, hourly: wx.hourly, refElev: el[el.length >> 1] }, {});
const ev = plan.modes.efficient, s = plan.s, crew = CREW[0];

// 1. Units and reference conditions
{
  // Chappell Table 4 kcal/h column reconciles only per kg BODY mass at 80.7 kg -> ~4.82 kcal/L O2
  for (const [v, kcalh] of [[3.9, 91.1], [15.4, 359.4], [13.2, 308.1], [17.0, 396.8], [18.1, 422.4]]) {
    near(kcalh / (lpmFromMlKgMin(v, 80.7) * 60), 4.82, 0.005, `implied kcal/L for ${v}`);
    assert.ok(Math.abs(kcalh / (lpmFromMlKgMin(v, 80.7 + 121) * 60) - 4.82) > 2, 'body+suit normalisation would not reconcile');
  }
  near(J_PER_L_O2 / 4184, 4.82, 0.03, 'engine energy equivalent vs Chappell-implied');
  // Rev F [V2 11011] rationale gives the envelope in both units: 528-2220 kJ/h = 500-2100 BTU/h
  near(btuhFromKjh(528), 500, 1, 'kJ/h -> BTU/h low'); near(btuhFromKjh(2220), 2100, 5, 'kJ/h -> BTU/h high');
  // Rev F p.50: EMU 4.3 psia, 100 % O2 -> ppO2 222 mmHg, PIO2 175 mmHg
  const o2 = oxygenPartialPressures(kpaFromPsi(4.3), 1);
  near(o2.ppO2, 222, 1, 'EMU ppO2'); near(o2.pio2, 175, 1, 'EMU PIO2');
  assert.equal(o2.band, 'within the indefinite-exposure range');
  assert.throws(() => oxygenPartialPressures(-1, 1)); assert.throws(() => oxygenPartialPressures(29.6, 0));
  console.log(`units: Chappell implied 4.82 kcal/L; EMU ppO2 ${o2.ppO2.toFixed(0)} / PIO2 ${o2.pio2.toFixed(0)} mmHg`);
}

// 2. Activity catalog: exact Table 4 values, per kg body mass, unknown activity rejected
{
  const want = { rover_rest: 3.9, walk: 15.4, stationary_light: 13.2, stationary_heavy: 17.0, mobile_heavy: 18.1 };
  for (const [a, v] of Object.entries(want)) {
    const x = activityVo2(a);
    assert.equal(x.mlKgMin, v); assert.match(x.cite, /CHAPPELL-2010 Table 4, p\.13/);
  }
  assert.throws(() => activityVo2('running'));
  for (const v of CATALOG.values) assert.ok(v.permittedUse, `${v.id} has a permitted use`);
  for (const v of CATALOG.values.filter((x) => x.unit === 'mL/kg/min')) assert.match(v.normalization, /body mass/);
}

// 3. Regression: 'engine' mode = Phase 2 O2 exactly; analytic workload source reproduces it
const segs = activityTimeline(ev.prof, s);
const engine = metabolicBudget(segs, crew, 'engine');
{
  near(engine.o2L, ev.end.o2, 1e-9, 'engine budget = Phase 2 end O2');
  near(engine.minutes, ev.end.t, 1e-9, 'timeline covers the EVA');
  for (let k = 1; k < segs.length; k++) near(segs[k].t0, segs[k - 1].t1, 1e-9, 'segments contiguous');
  const viaSource = metabolicBudget(segs, crew, 'source', { workload: analyticWorkload(null), s });
  near(viaSource.o2L, ev.end.o2, 1e-6, 'analytic WorkloadSource = engine');
  console.log(`regression: physiology engine-mode O2 ${engine.o2L.toFixed(1)} L = Phase 2 ${ev.end.o2.toFixed(1)} L`);
}

// 4. Activity-specific oxygen (analog, experimental) and the stop-rate gap
const analogStops = metabolicBudget(segs, crew, 'analog-stops');
{
  const stopMin = segs.filter((x) => x.kind === 'stop').reduce((t, x) => t + x.t1 - x.t0, 0);
  const walkEngine = segs.filter((x) => x.kind === 'walk').reduce((t, x) => t + x.engineO2L, 0);
  near(analogStops.o2L, walkEngine + (13.2 * crew.bodyKg / 1000) * stopMin, 1e-9, 'analog-stops = engine walking + 13.2 mL/kg/min stops');
  near((13.2 * 80 / 1000) * 180, 190.08, 1e-9, '4 x 45 min at 13.2 mL/kg/min, 80 kg');
  console.log(`activity O2: engine ${engine.o2L.toFixed(1)} L (${(100 * engine.o2L / s.o2CapacityL).toFixed(0)} %), analog stops ${analogStops.o2L.toFixed(1)} L (${(100 * analogStops.o2L / s.o2CapacityL).toFixed(0)} %)`);
}

// 5. Plausibility against OCHMO-TB-050 suited metabolic rates (Apollo lunar surface 517-2607 kJ/h)
{
  const [lo, , hi] = CATALOG.values.find((v) => v.id === 'mr.suited_ops_table').value.apolloLunarSurfaceEVA;
  const kjh = (b) => b.rows.map((x) => x.kjh);
  for (const [name, b] of [['engine', engine], ['analog-stops', analogStops]]) {
    const v = kjh(b), mn = Math.min(...v), mx = Math.max(...v);
    assert.ok(mn >= lo * 0.9 && mx <= hi, `${name} metabolic rates ${mn.toFixed(0)}-${mx.toFixed(0)} kJ/h near the Apollo range`);
    console.log(`plausibility ${name}: ${mn.toFixed(0)}-${mx.toFixed(0)} kJ/h (Apollo ${lo}-${hi})`);
  }
  assert.equal(mrEnvelope(wattsFromLpm(lpmFromMlKgMin(13.2, 80))).position, 'inside');
}

// 6. Thermal energy conservation
{
  assert.equal(heatStorageKJperKg([{ dtS: 3600, productionW: 300, removalW: 300 }], 80), 0);
  near(heatStorageKJperKg([{ dtS: 3600, productionW: 400, removalW: 300 }], 80), 4.5, 1e-12, '100 W surplus for 1 h at 80 kg');
  const split = heatStorageKJperKg(Array.from({ length: 60 }, () => ({ dtS: 60, productionW: 400, removalW: 300 })), 80);
  near(split, 4.5, 1e-9, 'additive over intervals');
  near(heatStorageKJperKg([{ dtS: 600, productionW: 200, removalW: 500 }], 80), -2.25, 1e-12, 'net cooling stores negative heat');
  assert.throws(() => heatStorageKJperKg([{ dtS: 60, productionW: 300 }], 80), /unavailable/);
}

// 7. Heart rate: only with an individual calibration, only inside its range
{
  assert.equal(heartRateFromMr(500, null).status, 'unavailable');
  const cal = { interceptBtuH: -400, slopeBtuHPerBpm: 15, mrRangeBtuH: [600, 2000], source: 'test calibration' };
  const w = (1500 * 1.05506) / 3.6; // 1500 BTU/h in W
  near(heartRateFromMr(w, cal).bpm, (1500 + 400) / 15, 1e-9, 'inverse of MR = a + b HR');
  assert.equal(heartRateFromMr(3000 * 1.05506 / 3.6, cal).status, 'unavailable', 'outside calibrated range');
  assert.equal(heartRateFromMr(w, { ...cal, slopeBtuHPerBpm: 0 }).status, 'unavailable', 'invalid calibration');
  assert.equal(heartRateFromMr(w, { ...cal, source: '' }).status, 'unavailable', 'calibration needs a source');
}

// 8. Kinesis compatibility: disabled under today's conditions, never double-counted
{
  const today = kinesisReadiness({ lookup: { suitMassKg: 40, gravity: 3.71 }, suitKg: s.suitKg, gravity: 3.71, roughCoverage: 0.05, validated: false });
  assert.equal(today.ready, false);
  for (const k of ['40 kg suit', 'roughness', 'not validated', 'calibration']) assert.ok(today.reasons.some((r) => r.includes(k)), `reason: ${k}`);
  const fakeLookup = { suitMassKg: 50, gravity: 3.71, at: () => ({ cot: 2, pFall: 0 }) };
  const kOff = kinesisWorkload(fakeLookup, today, null, 80, 50);
  assert.throws(() => kOff.walking({ distM: 4, grade: 0, slopeDeg: 0 }, s), /disabled/);
  assert.equal(selectWorkload(analyticWorkload(), kOff).kind, 'analytic');
  const cal = { metabolicJPerCotJ: 3, basalW: 100, sourceId: 'test' };
  const ok = kinesisReadiness({ lookup: fakeLookup, suitKg: 50, gravity: 3.71, roughCoverage: 0.99, validated: true, calibration: cal });
  assert.equal(ok.ready, true);
  const kOn = kinesisWorkload(fakeLookup, ok, cal, 80, 50);
  assert.equal(selectWorkload(analyticWorkload(), kOn).kind, 'kinesis');
  const b = metabolicBudget(segs, crew, 'source', { workload: kOn, s });
  const stops = segs.filter((x) => x.kind === 'stop').reduce((t, x) => t + x.engineO2L, 0);
  const walk = b.rows.filter((x) => x.kind === 'walk').reduce((t, x) => t + x.o2L, 0);
  near(b.o2L, walk + stops, 1e-9, 'walking from one source + stops, no double counting');
  assert.equal(b.rows.length, segs.length, 'one row per segment');
}

// 9. Invalid and missing sensor data
{
  assert.deepEqual(validateSensorFrame(null), { accepted: {}, rejected: [] });
  const v = validateSensorFrame({ hrBpm: NaN, suitPressureKPa: 500, ppCO2MmHg: 3, ppO2MmHg: 'x' });
  assert.deepEqual(Object.keys(v.accepted), ['ppCO2MmHg']);
  assert.equal(v.rejected.length, 3);
  assert.equal(validateSensorFrame({ hrBpm: 90, ageS: 30 }).rejected[0].reason, 'stale (30 s old)');
  const base = crewStatus({ budget: engine, T: 60, crew, tankL: s.o2CapacityL, analog: analogStops });
  const by = Object.fromEntries(base.readings.map((x) => [x.id, x]));
  for (const x of base.readings) assert.ok(PROVENANCE.includes(x.provenance), `${x.id} provenance`);
  assert.equal(by.hr.provenance, 'UNAVAILABLE'); assert.equal(by.storage.provenance, 'UNAVAILABLE');
  assert.equal(by.psuit.provenance, 'ASSUMED'); assert.equal(by.ppo2.provenance, 'DERIVED');
  assert.equal(by.ppco2.confidence, 'experimental');
  assert.ok(!base.readings.some((x) => x.provenance === 'MEASURED'), 'no live telemetry claimed');
  const withSensor = crewStatus({ budget: engine, T: 60, crew, tankL: s.o2CapacityL, sensor: { hrBpm: 95, suitPressureKPa: Infinity } });
  const ws = Object.fromEntries(withSensor.readings.map((x) => [x.id, x]));
  assert.equal(ws.hr.provenance, 'MEASURED'); assert.equal(ws.psuit.provenance, 'ASSUMED', 'bad pressure falls back');
  assert.equal(withSensor.rejected[0].field, 'suitPressureKPa');
  console.log(`status at T=60: ${base.readings.map((x) => `${x.id}=${x.value ?? '—'}[${x.provenance}]`).join(' ')}`);
}

// 10. Uncertainty and sensitivity (Table 4 gives no uncertainty: vary sourced inputs instead)
{
  const cohort = CATALOG.values.find((v) => v.id === 'cohort.ist2').value.bodyMassKg;
  const rows = [cohort.min, cohort.mean, cohort.max].map((kg) => metabolicBudget(segs, { ...crew, bodyKg: kg }, 'analog-stops').o2L);
  assert.ok(rows[0] < rows[1] && rows[1] < rows[2], 'analog O2 rises with body mass');
  const spread = metabolicAt(engine, ev.end.t, crew).o2L;
  console.log(`sensitivity: analog-stops O2 ${rows.map((x) => x.toFixed(0)).join(' / ')} L for ${cohort.min} / ${cohort.mean} / ${cohort.max} kg; model choice engine ${spread.toFixed(0)} L vs analog ${analogStops.o2L.toFixed(0)} L`);
}

// 11. Module separation: physiology never imports mission policy; workload never imports physiology state
{
  const dir = new URL('./physiology/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    assert.ok(!readFileSync(new URL(f, dir), 'utf8').includes('profiles.js'), `${f} must not import mission policy`);
  }
  assert.ok(!readFileSync(new URL('./workload.js', import.meta.url), 'utf8').includes('physiology/status'), 'biomechanics separate from status');
  assert.equal(JSON.stringify(plan.modes.efficient.end.o2.toFixed(1)), '"126.6"', 'Phase 2 plan unchanged');
}
console.log('physiology tests passed');
