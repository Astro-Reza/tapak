// AR mission package: contract tests. Run: node src/sim/ar-package.test.ts (part of npm test)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { planMission } from "../engine/index.js";
import { AR_PACKAGE_FORMAT, AR_PACKAGE_VERSION, arPackageFileName, buildArPackage, PROFILE_FIELDS, type ArMissionPackage } from "./ar-package.ts";

const pub = (p: string) => new URL(`../../public/data/${p}`, import.meta.url);
const app = JSON.parse(readFileSync(pub("app/app.json"), "utf8"));
const n = app.grid.rows * app.grid.cols;
const raw = new Float32Array(readFileSync(pub("app/grid.bin")).buffer.slice(0));
const grid = { ...app.grid, elev: raw.subarray(0, n), slope: raw.subarray(n, 2 * n), sky: raw.subarray(2 * n, 3 * n), rough: raw.subarray(3 * n) };
const wx = JSON.parse(readFileSync(pub("meda_weather.json"), "utf8"));
const elevs = app.stops.map((s: { elev: number }) => s.elev).sort((a: number, b: number) => a - b);
const data = {
  grid,
  stops: app.stops,
  hourly: wx.hourly,
  refElev: elevs[elevs.length >> 1],
  terrain: { size: app.terrain.size as [number, number], center: app.terrain.center },
  credits: app.credits ?? [],
};
const settings = { scienceId: "app-50kg", policyId: "engine", startLmst: 9, kSuit: 1, modelKey: "acsmScaled" } as const; // the app defaults (mission.tsx DEFAULTS)
const result = planMission(data, settings as never);
const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

/**
 * Reference port of the lookup, written only from docs/AR_MISSION_PACKAGE.md (not from the engine source).
 * The Unity C# port follows the same steps; if this matches the package's checks, the spec is right.
 */
function referenceLookup(pkg: ArMissionPackage, T: number) {
  const col = Object.fromEntries(pkg.profile.fields.map((f, i) => [f, i])) as Record<string, number>;
  const R = pkg.profile.rows, get = (r: number[], f: string) => r[col[f]];
  let k = 1;
  while (k < R.length - 1 && get(R[k], "t") < T) k++;
  const a = R[k - 1], b = R[k];
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const span = (v: number) => v || 1;
  const dwell = get(b, "dwell"), arrive = get(b, "t") - dwell, dwellO2 = dwell * pkg.suit.stationLpm;
  const g = clamp01((T - get(a, "t")) / span(get(b, "t") - get(a, "t")));
  const dose = get(a, "dose") + g * (get(b, "dose") - get(a, "dose"));
  if (T < arrive || dwell === 0) {
    const f = clamp01((T - get(a, "t")) / span(arrive - get(a, "t")));
    const lerp = (q: string) => get(a, q) + f * (get(b, q) - get(a, q));
    return { k, dwelling: false, x: lerp("x"), y: lerp("y"), z: lerp("z"), dist: lerp("dist"), dose, o2: get(a, "o2") + f * (get(b, "o2") - dwellO2 - get(a, "o2")) };
  }
  return { k, dwelling: true, x: get(b, "x"), y: get(b, "y"), z: get(b, "z"), dist: get(b, "dist"), dose, o2: get(b, "o2") - dwellO2 + (T - arrive) * pkg.suit.stationLpm };
}

for (const mode of ["efficient", "balanced", "safest"] as const) {
  const ev = result.modes[mode];
  if (!ev.prof || !ev.end) continue;
  const pkg = buildArPackage({ data, result, mode, settings, createdAt: "2026-11-14T00:00:00.000Z" });

  // 1. header, deterministic, JSON-safe, small enough to ship to a phone
  assert.equal(pkg.format, AR_PACKAGE_FORMAT);
  assert.equal(pkg.version, AR_PACKAGE_VERSION);
  const json = JSON.stringify(pkg);
  assert.deepEqual(JSON.parse(json), pkg, "round-trips through JSON");
  assert.equal(json, JSON.stringify(buildArPackage({ data, result, mode, settings, createdAt: "2026-11-14T00:00:00.000Z" })), "deterministic");
  assert.ok(json.length < 400_000, `${mode}: ${json.length} bytes`);

  // 2. profile matches the engine within the stated rounding
  assert.deepEqual(pkg.profile.fields, PROFILE_FIELDS);
  assert.equal(pkg.profile.rows.length, ev.prof.length);
  for (const [i, p] of ev.prof.entries()) {
    const r = pkg.profile.rows[i];
    assert.equal(r.length, PROFILE_FIELDS.length);
    near(r[0], p.t, 5e-5, "t");
    near(r[1], p.dist, 5e-3, "dist");
    near(r[2], p.x, 5e-3, "x");
    near(r[5], p.o2, 5e-5, "o2");
    assert.ok(r.every(Number.isFinite), `row ${i} finite`);
  }
  near(pkg.route.distanceM, ev.end.dist, 5e-3, "route distance");
  near(pkg.route.o2UsedL, ev.end.o2, 5e-4, "route O2");

  // 3. waypoints: start, every stop, home; in route order, on the profile
  assert.equal(pkg.waypoints[0].id, "WP1");
  assert.equal(pkg.waypoints.at(-1)!.name, "Return");
  assert.equal(pkg.waypoints.length, ev.plan.legs.length + 1);
  for (let i = 1; i < pkg.waypoints.length; i++) {
    const w = pkg.waypoints[i], prev = pkg.waypoints[i - 1];
    assert.ok(w.dist >= prev.dist && w.arriveT >= prev.departT - 1e-6, `${w.id} after ${prev.id}`);
    assert.deepEqual([w.x, w.z], [pkg.profile.rows[w.profileIndex][2], pkg.profile.rows[w.profileIndex][4]]);
    near(w.departT - w.arriveT, w.dwellMin, 1e-3, `${w.id} dwell`);
  }

  // 4. calibration: origin at the start, heading marker on a long enough baseline
  const [origin, heading] = pkg.calibration.markers;
  assert.equal(origin.waypoint, "WP1");
  assert.ok(Math.hypot(heading.x - origin.x, heading.z - origin.z) >= 50, "heading baseline >= 50 m");
  assert.equal(pkg.rules.progressRequires.maxResidualM, pkg.calibration.maxResidualM);
  assert.equal(pkg.rules.scaledModeCountsProgress, false);

  // 5. golden checks: the spec's reference lookup reproduces every one (what the C# port must also do)
  assert.ok(pkg.checks.length >= 10 && pkg.checks.some((c) => c.dwelling) && pkg.checks.some((c) => !c.dwelling));
  for (const c of pkg.checks) {
    const r = referenceLookup(pkg, c.T);
    assert.equal(r.k, c.k, `k at T=${c.T}`);
    assert.equal(r.dwelling, c.dwelling, `dwelling at T=${c.T}`);
    for (const f of ["x", "y", "z", "dist", "o2", "dose"] as const) near(r[f], c[f], 1e-9, `${f} at T=${c.T}`);
  }
  const first = pkg.checks[0], last = pkg.checks.at(-1)!;
  assert.ok(first.T < 0 && first.dist === 0, "before the start clamps to the start");
  near(last.dist, pkg.route.distanceM, 1e-9, "after the end clamps to the end");

  console.log(`ar-package ${mode}: ${pkg.profile.rows.length} samples, ${pkg.waypoints.length} waypoints, ${pkg.checks.length} checks, ${(json.length / 1024).toFixed(0)} kB`);
}

assert.equal(arPackageFileName("efficient", 9), "marswalk-ar-efficient-0900.json");
assert.equal(arPackageFileName("safest", 13.5), "marswalk-ar-safest-1330.json");
console.log("ar-package tests passed");
