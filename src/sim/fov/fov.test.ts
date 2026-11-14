// FoV movement + camera tests (pure modules, no browser). Run: node src/sim/fov/fov.test.ts (part of npm test)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { planMission, sampleAt } from "../../engine/index.js";
import { BOB_LEVELS, BOB_REST, composeCamera, EYE_M, PITCH_MAX, PITCH_MIN, stepBob, type Bob } from "./camera-rig.ts";
import { EXPLORE_MPS, stepExplore } from "./explore.ts";
import { MAX_CALIBRATION_RESIDUAL_M, progressCounts, type PoseFrame } from "./pose-source.ts";
import { advanceT, pointAtDist, routeHeading, stepRoute } from "./route-walker.ts";
import { bearing, heightAt, terrainBounds } from "./world.ts";

const pub = (p: string) => new URL(`../../../public/data/${p}`, import.meta.url);
const app = JSON.parse(readFileSync(pub("app/app.json"), "utf8"));
const n = app.grid.rows * app.grid.cols;
const raw = new Float32Array(readFileSync(pub("app/grid.bin")).buffer.slice(0));
const grid = { ...app.grid, elev: raw.subarray(0, n), slope: raw.subarray(n, 2 * n), sky: raw.subarray(2 * n, 3 * n), rough: raw.subarray(3 * n) };
const wx = JSON.parse(readFileSync(pub("meda_weather.json"), "utf8"));
const elevs = app.stops.map((s: { elev: number }) => s.elev).sort((a: number, b: number) => a - b);
const result = planMission({ grid, stops: app.stops, hourly: wx.hourly, refElev: elevs[elevs.length >> 1] }, {});
const ev = result.modes.efficient;
const prof = ev.prof!, end = ev.end!, s = result.s;
const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// 1. Terrain height: exact on grid nodes, bilinear between them.
{
  const r = 200, c = 250;
  const x = grid.x0 + c * grid.cell[0], z = grid.z0 + r * grid.cell[1];
  near(heightAt(grid, x, z), grid.elev[r * grid.cols + c], 1e-3, "height at a grid node");
  const mid = heightAt(grid, x + grid.cell[0] / 2, z);
  const a = grid.elev[r * grid.cols + c], b = grid.elev[r * grid.cols + c + 1];
  near(mid, (a + b) / 2, 1e-3, "height halfway along a cell edge");
  for (const p of prof) near(heightAt(grid, p.x, p.z), p.y, 1.5, `route point ${p.i} height vs engine elevation`);
}

// 2. Delta-time clock: frame-rate independent, clamped to [0, end].
{
  let a = 30;
  for (let i = 0; i < 144; i++) a = advanceT(a, 1 / 144, 60, end.t);
  near(a, advanceT(30, 1, 60, end.t), 1e-9, "144 small steps = 1 big step");
  assert.equal(advanceT(end.t - 0.001, 5, 240, end.t), end.t);
  assert.equal(advanceT(0, -1, 60, end.t), 0);
}

// 3. Follow route, start -> every waypoint -> end, at 30 / 60 / 144 fps: same samples as the engine.
const arrivals = [0, ...ev.plan.legs.slice(1).map((l) => prof.findIndex((p) => p.i === l.startIdx)), prof.length - 1];
for (const fps of [30, 60, 144]) {
  let T = 0, lastDist = 0, reached = 0, steps = 0;
  while (T < end.t) {
    const r = stepRoute(prof, s, T, 1 / fps, 240, end.t);
    T = r.T;
    steps++;
    const sm = r.step.sample;
    assert.ok(sm.dist >= lastDist - 1e-9, "never walks backwards");
    lastDist = sm.dist;
    // on the computed route: the walker never invents geometry
    const on = pointAtDist(prof, sm.dist);
    near(Math.hypot(on.x - sm.x, on.z - sm.z), 0, 0.05, `on route at ${sm.dist.toFixed(1)} m`);
    const want = arrivals[reached];
    if (want != null && sm.dist >= prof[want].dist - 1e-6) reached++;
    // science engine untouched: O2 is exactly the engine's at that clock
    assert.equal(sm.o2, sampleAt(prof, T, s).o2);
    assert.ok(r.step.walkMps >= 0 && r.step.walkMps < 3, `walking pace ${r.step.walkMps} m/s is human`);
    assert.ok(steps < 1e6);
  }
  assert.equal(reached, arrivals.length, `${fps} fps: passed every waypoint in order`);
  const last = sampleAt(prof, T, s);
  near(last.dist, end.dist, 1e-6, `${fps} fps: ends at the route end`);
  near(last.o2, end.o2, 1e-6, `${fps} fps: O2 at the end matches the plan`);
}

// 4. Heading follows route geometry; look never changes position or walking direction.
{
  for (let d = 0; d < end.dist; d += 25) assert.notEqual(routeHeading(prof, d), null, `heading defined at ${d} m`);
  const a = pointAtDist(prof, 100), b = pointAtDist(prof, 120);
  near(routeHeading(prof, 100)!, bearing(b.x - a.x, b.z - a.z), 1e-9, "heading = bearing to the point 20 m on");
  const body = { x: 10, z: -20, ground: -1900, heading: 1 };
  const ahead = composeCamera(body, 0, { yaw: 0, pitch: 0 }, BOB_REST);
  const back = composeCamera(body, 0, { yaw: Math.PI, pitch: 0.4 }, BOB_REST);
  assert.deepEqual([back.x, back.y, back.z], [ahead.x, ahead.y, ahead.z], "looking back does not move you");
  near(back.yaw - ahead.yaw, Math.PI, 1e-12, "camera yaw = walking heading + look");
  near(ahead.y, body.ground + EYE_M, 1e-12, "eye 1.7 m above the terrain");
  const up = composeCamera(body, 0, { yaw: 0, pitch: 10 }, BOB_REST), down = composeCamera(body, 0, { yaw: 0, pitch: -10 }, BOB_REST);
  assert.equal(up.pitch, PITCH_MAX);
  assert.equal(down.pitch, PITCH_MIN);
  assert.equal(up.roll, 0);
}

// 5. Head bob: bounded, proportional to pace, zero when stationary or Off, frame-rate independent.
{
  const run = (fps: number, secs: number, mps: number, intensity: number, from: Bob = BOB_REST) => {
    let b = from, vmax = 0, lmax = 0;
    for (let i = 0; i < fps * secs; i++) {
      b = stepBob(b, 1 / fps, mps, intensity);
      vmax = Math.max(vmax, Math.abs(b.vertical));
      lmax = Math.max(lmax, Math.abs(b.lateral));
    }
    return { b, vmax, lmax };
  };
  const full = run(60, 4, 1.2, BOB_LEVELS.normal);
  assert.ok(full.vmax > 0.02 && full.vmax <= 0.028, `vertical bob ${full.vmax} m`);
  assert.ok(full.lmax > 0.008 && full.lmax <= 0.012, `lateral sway ${full.lmax} m`);
  const reduced = run(60, 4, 1.2, BOB_LEVELS.reduced);
  near(reduced.b.amp, 0.4 * full.b.amp, 0.01, "reduced is 40 % of normal");
  const slow = run(60, 4, 0.55, BOB_LEVELS.normal);
  near(slow.b.amp, full.b.amp / 2, 0.01, "half pace, half bob");
  assert.deepEqual(run(60, 4, 1.2, BOB_LEVELS.off).b, BOB_REST, "Off means no bob");
  assert.deepEqual(run(60, 3, 0, 1, full.b).b, BOB_REST, "standing still fades to zero");
  const a30 = run(30, 0.5, 1.2, 1).b.amp, a144 = run(144, 0.5, 1.2, 1).b.amp;
  near(a30, a144, 1e-9, "bob ease is frame-rate independent");
  // presentation only: bob moves the eye a few cm, never the body or the clock
  const body = { x: 0, z: 0, ground: 0, heading: 0 };
  const cam = composeCamera(body, 0, { yaw: 0, pitch: 0 }, full.b);
  assert.ok(Math.hypot(cam.x, cam.z) <= 0.012 + 1e-9 && Math.abs(cam.y - EYE_M) <= 0.028 + 1e-9);
}

// 6. Free explore: walks where you look, never faster on diagonals, never off the terrain.
{
  const bounds = terrainBounds(app.terrain.size);
  const east = stepExplore({ x: 0, z: 0 }, { forward: 1, right: 0, fast: false }, Math.PI / 2, 1, bounds);
  near(east.p.x, EXPLORE_MPS, 1e-9, "forward while facing east moves +x");
  near(east.p.z, 0, 1e-9, "and not sideways");
  const diag = stepExplore({ x: 0, z: 0 }, { forward: 1, right: 1, fast: false }, 0, 1, bounds);
  near(diag.movedM, EXPLORE_MPS, 1e-9, "diagonal is not faster");
  let p = { x: 0, z: 0 };
  for (let i = 0; i < 4000; i++) p = stepExplore(p, { forward: 1, right: 0, fast: true }, Math.PI / 2, 0.1, bounds).p;
  assert.equal(p.x, bounds.maxX, "stops at the terrain edge");
  assert.ok(bounds.maxX < app.terrain.size[0] / 2, "edge sits inside the mesh");
}

// 7. Phase 4 rule: physical movement counts as progress only when tracked AND calibrated.
{
  const frame = (tracking: PoseFrame["tracking"]): PoseFrame => ({ pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 }, tracking, at: 0 });
  const cal = (residualM: number) => ({ residualM, toWorld: () => frame("normal").pose });
  assert.equal(progressCounts(frame("normal"), cal(0.5)), true);
  assert.equal(progressCounts(frame("normal"), null), false, "uncalibrated");
  assert.equal(progressCounts(frame("limited"), cal(0.5)), false, "limited tracking");
  assert.equal(progressCounts(frame("lost"), cal(0.5)), false, "tracking lost");
  assert.equal(progressCounts(frame("normal"), cal(MAX_CALIBRATION_RESIDUAL_M + 0.1)), false, "calibration too loose");
}

console.log(`fov: route ${(end.dist / 1000).toFixed(2)} km, ${arrivals.length} arrivals walked at 30/60/144 fps; bob, look, explore, AR progress rule`);
console.log("fov tests passed");
