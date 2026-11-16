// Automated tests for FOV dynamic pass trajectory, HUD pass sync, and link-budget atmospheric loss.
// Run: node src/sim/fov/pass-track.test.ts (part of npm test)
import assert from "node:assert/strict";

import { DEFAULT_ACTIVE_PASS, DUMMY_COMMS_PASSES, DUMMY_COMMS_LINK } from "../../data/comms.ts";
import { BUDGETS } from "../../data/mission.ts";
import {
  HUD_PASS_STORAGE_KEY,
  HUD_PASS_EVENT,
  getSatelliteTrackState,
  loadHudPass,
  saveHudPass,
  type HudPassData,
} from "../../lib/hud-pass.ts";
import {
  atmosphericLossDb,
  buildWaterfallStages,
  calculateLinkMarginDb,
  deltaAtmosphericMarginDb,
  DOWNLINK_CONFIG,
  receivedPowerDbw,
  UPLINK_CONFIG,
} from "../../lib/orbit.ts";

const near = (a: number, b: number, eps = 1e-3, msg = "") =>
  assert.ok(Math.abs(a - b) <= eps, `${msg}: expected ${b} ± ${eps}, got ${a}`);

// Mock in-memory localStorage for Node test runner
const memoryStorage: Record<string, string> = {};
const mockWindow = {
  localStorage: {
    getItem: (key: string) => memoryStorage[key] ?? null,
    setItem: (key: string, val: string) => {
      memoryStorage[key] = val;
    },
    removeItem: (key: string) => {
      delete memoryStorage[key];
    },
    clear: () => {
      for (const k in memoryStorage) delete memoryStorage[k];
    },
  },
  dispatchedEvents: [] as { type: string; detail: any }[],
  dispatchEvent: (event: any) => {
    mockWindow.dispatchedEvents.push({ type: event.type, detail: event.detail });
    return true;
  },
};

(globalThis as any).window = mockWindow;

/* =========================================================================
   1. FOV Dynamic Pass Trajectory Projection & State Derivation
   ========================================================================= */
console.log("Running FOV pass trajectory tests...");

// 1.1 Default simulated pass has valid points spanning horizon to horizon
{
  assert.ok(DEFAULT_ACTIVE_PASS.track.length >= 10, "track has sufficient points for smooth arc");
  const first = DEFAULT_ACTIVE_PASS.track[0];
  const last = DEFAULT_ACTIVE_PASS.track[DEFAULT_ACTIVE_PASS.track.length - 1];
  assert.ok(first.el >= 0 && first.el <= 10, `AOS starts near horizon: el=${first.el}°`);
  assert.ok(last.el >= 0 && last.el <= 10, `LOS ends near horizon: el=${last.el}°`);
  assert.ok(DEFAULT_ACTIVE_PASS.maxElevationDeg > 20, "pass attains usable elevation");
}

// 1.2 State derivation at snapshot t=0
{
  const state = getSatelliteTrackState(DEFAULT_ACTIVE_PASS, 0);
  assert.ok(state.currentIdx >= 0 && state.currentIdx < DEFAULT_ACTIVE_PASS.track.length);
  assert.equal(state.flown.length, state.currentIdx + 1, "flown trajectory contains points up to current satellite");
  assert.equal(state.predicted.length, DEFAULT_ACTIVE_PASS.track.length, "predicted trajectory contains full pass arc");
  assert.deepEqual(state.aosPt, DEFAULT_ACTIVE_PASS.track[0], "AOS point matches pass entry horizon");
  assert.deepEqual(state.losPt, DEFAULT_ACTIVE_PASS.track[DEFAULT_ACTIVE_PASS.track.length - 1], "LOS point matches pass exit horizon");

  // Dynamic label verification
  assert.match(state.satLabel, /MRS-L1 · el \d+° · az \d{3}° · uplink [+-]?\d+\.\d dB/, "satLabel follows dynamic format");
  assert.equal(state.satPinLabel, "MRS-L1 · out of view");
  assert.equal(state.aosLabel, "AOS 15:35");
  assert.equal(state.losLabel, "LOS 15:44");
}

// 1.3 State derivation along pass progression (time advance)
{
  const earlyState = getSatelliteTrackState(DEFAULT_ACTIVE_PASS, -250);
  const midState = getSatelliteTrackState(DEFAULT_ACTIVE_PASS, 0);
  const lateState = getSatelliteTrackState(DEFAULT_ACTIVE_PASS, 300);

  assert.ok(earlyState.currentIdx <= midState.currentIdx, "early pass index precedes mid pass");
  assert.ok(midState.currentIdx <= lateState.currentIdx, "mid pass index precedes late pass");
  assert.ok(earlyState.flown.length <= midState.flown.length, "flown path expands monotonically");
  assert.ok(midState.flown.length <= lateState.flown.length, "flown path expands monotonically");
}

// 1.4 Custom satellite configuration
{
  const customPass: HudPassData = {
    relayId: "mrs-polar-9",
    relayName: "MRS-Polar-9",
    startS: -120,
    endS: 480,
    maxElevationDeg: 78.4,
    aos: "16:10",
    los: "16:20",
    syncedAt: Date.now(),
    track: [
      { az: 350.0, el: 1.0, marginDb: -15.0, timeS: -120 },
      { az: 355.0, el: 45.0, marginDb: 3.5, timeS: 0 },
      { az: 10.0, el: 78.4, marginDb: 6.2, timeS: 180 },
      { az: 170.0, el: 0.8, marginDb: -16.0, timeS: 480 },
    ],
  };

  const state = getSatelliteTrackState(customPass, 0);
  assert.equal(state.currentIdx, 1, "matches t=0 point");
  assert.equal(state.currentPt.az, 355.0);
  assert.equal(state.currentPt.el, 45.0);
  assert.equal(state.currentPt.marginDb, 3.5);
  assert.equal(state.satLabel, "MRS-Polar-9 · el 45° · az 355° · uplink +3.5 dB");
  assert.equal(state.satPinLabel, "MRS-Polar-9 · out of view");
  assert.equal(state.aosLabel, "AOS 16:10");
  assert.equal(state.losLabel, "LOS 16:20");
}

// 1.5 Edge cases: empty and single-point tracks
{
  const emptyPass: HudPassData = {
    relayId: "test",
    relayName: "TestRelay",
    startS: 0,
    endS: 0,
    maxElevationDeg: 0,
    track: [],
    syncedAt: 0,
  };
  const emptyState = getSatelliteTrackState(emptyPass);
  assert.ok(emptyState.currentPt, "returns fallback point");
  assert.equal(emptyState.flown.length, 0);

  const singlePass: HudPassData = {
    relayId: "single",
    relayName: "MRS-Single",
    startS: 0,
    endS: 0,
    maxElevationDeg: 30,
    track: [{ az: 45, el: 30, marginDb: 2.0, timeS: 0 }],
    syncedAt: 0,
  };
  const singleState = getSatelliteTrackState(singlePass);
  assert.equal(singleState.currentIdx, 0);
  assert.equal(singleState.flown.length, 1);
  assert.equal(singleState.predicted.length, 1);
}

// 1.6 Future pass time synchronization (startS > 0)
{
  const futurePass: HudPassData = {
    relayId: "future-l2",
    relayName: "MRS-Future-2",
    startS: 300,
    endS: 900,
    maxElevationDeg: 55.0,
    aos: "16:00",
    los: "16:10",
    syncedAt: Date.now(),
    track: [
      { az: 180.0, el: 1.0, marginDb: -18.0, timeS: 0 },
      { az: 190.0, el: 30.0, marginDb: 2.0, timeS: 200 },
      { az: 200.0, el: 55.0, marginDb: 5.0, timeS: 300 },
      { az: 220.0, el: 1.2, marginDb: -17.5, timeS: 600 },
    ],
  };

  // At simElapsedS = startS (300), pass is at AOS (timeS = 0)
  const aosState = getSatelliteTrackState(futurePass, 300);
  assert.equal(aosState.currentIdx, 0, "at simElapsedS = startS, matches AOS (timeS = 0)");
  assert.equal(aosState.currentPt.timeS, 0);

  // At simElapsedS = startS + 200 (500), pass is at timeS = 200
  const midState = getSatelliteTrackState(futurePass, 500);
  assert.equal(midState.currentIdx, 1, "at simElapsedS = startS + 200, matches timeS = 200");
  assert.equal(midState.currentPt.timeS, 200);
}

// 1.7 Edge pinning 90° transverse division-by-zero singularity sanitization
{
  // Simulate 90° transverse singularity: sat.front = false, sat.x = -Infinity, sat.y = NaN
  const sat = { x: -Infinity, y: NaN, front: false, visible: false };
  const pose = { yaw: 0.785398 }; // ~45 deg
  const satAz = 315;
  const RAD = Math.PI / 180;
  const FOV_H = 75;
  const W = 1920, H = 1080;
  const left = 304, right = W - 360, top = 88, bottom = H - 180;

  const side = ((satAz - pose.yaw / RAD + 540) % 360) - 180;
  const satFront = sat.front && Number.isFinite(sat.x) && Number.isFinite(sat.y);
  const x = Math.abs(side) > FOV_H / 2 || !satFront ? (side < 0 ? left : right) : Math.min(Math.max(sat.x, left), right);
  const y = satFront ? Math.min(Math.max(sat.y, top), bottom) : top;
  const dx = satFront && Math.abs(side) <= FOV_H / 2 ? sat.x - x : side;
  const dy = satFront ? sat.y - y : -1;
  const ang = (Math.atan2(Number.isFinite(dy) ? dy : -1, Number.isFinite(dx) ? dx : side) / RAD) + 90;

  assert.ok(Number.isFinite(x), `x must be finite: got ${x}`);
  assert.ok(Number.isFinite(y), `y must be finite: got ${y}`);
  assert.ok(Number.isFinite(ang), `ang must be finite: got ${ang}`);
  assert.ok(!isNaN(x) && !isNaN(y) && !isNaN(ang), "pin coordinates and rotation angle must not contain NaN");
}

/* =========================================================================
   2. HUD Pass Synchronization Store & Persistence
   ========================================================================= */
console.log("Running HUD pass sync persistence tests...");

{
  mockWindow.localStorage.clear();
  mockWindow.dispatchedEvents.length = 0;

  // Empty storage returns null
  assert.equal(loadHudPass(), null);

  // Save pass
  const testPass: HudPassData = {
    relayId: "l3",
    relayName: "MRS-L3",
    startS: 0,
    endS: 540,
    maxElevationDeg: 52.1,
    aos: "17:00",
    los: "17:09",
    syncedAt: 123456789,
    track: [
      { az: 120.0, el: 1.2, marginDb: -18.0, timeS: 0 },
      { az: 140.0, el: 52.1, marginDb: 4.8, timeS: 270 },
      { az: 160.0, el: 1.0, marginDb: -19.0, timeS: 540 },
    ],
  };

  saveHudPass(testPass);

  // Check localStorage contents
  const stored = loadHudPass();
  assert.ok(stored !== null, "loaded pass exists");
  assert.equal(stored!.relayId, "l3");
  assert.equal(stored!.relayName, "MRS-L3");
  assert.equal(stored!.maxElevationDeg, 52.1);
  assert.equal(stored!.track.length, 3);
  assert.equal(stored!.track[1].marginDb, 4.8);

  // Check event dispatch
  assert.equal(mockWindow.dispatchedEvents.length, 1);
  assert.equal(mockWindow.dispatchedEvents[0].type, HUD_PASS_EVENT);
  assert.equal(mockWindow.dispatchedEvents[0].detail.relayName, "MRS-L3");

  // Verify DUMMY_COMMS_PASSES includes activePass fallback
  assert.ok(DUMMY_COMMS_PASSES.activePass !== undefined, "DUMMY_COMMS_PASSES has activePass");
  assert.ok(DUMMY_COMMS_PASSES.activePassTrack !== undefined, "DUMMY_COMMS_PASSES has activePassTrack");
  assert.ok(DUMMY_COMMS_PASSES.activePassTrack!.length > 0, "activePassTrack is non-empty");
}

/* =========================================================================
   3. Client-Side Link Budget & Negative Atmospheric Delta Verification
   ========================================================================= */
console.log("Running atmospheric attenuation & negative delta tests...");

// 3.1 Atmospheric loss is strictly positive and bounded by 0.5° floor
{
  for (let el = 0; el <= 90; el += 5) {
    const loss = atmosphericLossDb(el, 0.3);
    assert.ok(loss > 0, `Loss at el ${el}° must be positive: got ${loss}`);
  }

  // Horizon clamping: 0° clamped to 0.5°
  const lossZero = atmosphericLossDb(0.0, 0.3);
  const lossFloor = atmosphericLossDb(0.5, 0.3);
  near(lossZero, lossFloor, 1e-9, "0° clamped to 0.5° floor");
  near(lossFloor, 0.3 / Math.sin((0.5 * Math.PI) / 180.0), 1e-4, "cosecant model at floor");
  near(atmosphericLossDb(90.0, 0.3), 0.3, 1e-4, "zenith loss is exactly 0.3 dB");
}

// 3.2 Atmospheric loss decreases monotonically with elevation
{
  let lastLoss = Infinity;
  for (let el = 0.5; el <= 90; el += 1.0) {
    const loss = atmosphericLossDb(el, 0.3);
    assert.ok(loss <= lastLoss + 1e-9, `Loss must decrease monotonically: el=${el}, loss=${loss}, prev=${lastLoss}`);
    lastLoss = loss;
  }
}

// 3.3 Negative margin delta: Delta = Margin(with) - Margin(without) = -A_atm < 0 dB
{
  for (let el = 0; el <= 90; el += 10) {
    const delta = deltaAtmosphericMarginDb(el, 0.3);
    const loss = atmosphericLossDb(el, 0.3);
    assert.ok(delta < 0, `Delta must be strictly negative: got ${delta} at el ${el}°`);
    near(delta, -loss, 1e-9, "delta matches negative atmospheric loss");

    // Received power test
    const prWithAtmos = receivedPowerDbw(UPLINK_CONFIG, 140.0, loss);
    const prWithoutAtmos = receivedPowerDbw(UPLINK_CONFIG, 140.0, 0.0);
    near(prWithAtmos - prWithoutAtmos, -loss, 1e-9, "received power reduced by atmospheric loss");

    // Link margin test
    const marginWith = calculateLinkMarginDb(UPLINK_CONFIG, el, 400.0, 401.6, 0.3);
    const marginWithout = calculateLinkMarginDb(UPLINK_CONFIG, el, 400.0, 401.6, 0.0);
    near(marginWith - marginWithout, -loss, 1e-3, "margin reduced by atmospheric loss");
    assert.ok(marginWith < marginWithout, "margin with atmospheric loss is strictly lower than without");
  }
}

// 3.4 Waterfall stage builder generates "Atmos" loss stage
{
  const stages = buildWaterfallStages(UPLINK_CONFIG, 30.0, 400.0, 401.6, 0.3);
  const atmosStage = stages.find((s) => s.label === "Atmos");
  assert.ok(atmosStage !== undefined, "waterfall includes Atmos stage");
  assert.equal(atmosStage!.kind, "loss", "Atmos stage is kind 'loss'");
  assert.ok(atmosStage!.value < 0, `Atmos stage value must be negative: got ${atmosStage!.value}`);
}

// 3.5 Frontend BUDGETS fallback data displays "Atmos" loss stage
{
  assert.equal(BUDGETS.length, 2, "BUDGETS contains downlink and uplink");
  for (const budget of BUDGETS) {
    const atmosStage = budget.stages.find((s) => s.label === "Atmos");
    assert.ok(atmosStage !== undefined, `Budget '${budget.title}' contains Atmos stage`);
    assert.equal(atmosStage!.kind, "loss", `Atmos stage kind is 'loss' in '${budget.title}'`);
    assert.ok(atmosStage!.value !== undefined, `Atmos stage has value in '${budget.title}'`);
    assert.match(atmosStage!.value!.text, /^−\d+\.\d$/, `Atmos stage value text is formatted with minus: ${atmosStage!.value!.text}`);
  }
  assert.equal(DUMMY_COMMS_LINK.budgets, BUDGETS, "DUMMY_COMMS_LINK points to updated BUDGETS");
}

console.log("All Milestone 4 pass-track & comms tests passed successfully!");
