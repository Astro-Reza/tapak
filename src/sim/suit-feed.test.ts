// Mission Control → suit status and the orbit link. Run: node src/sim/suit-feed.test.ts (part of npm test)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { planMission } from "../engine/index.js";
import { lookAngles, orbitLinkAt, orbitPoint, relayAt, uplinkMarginDb, type RelayOrbit } from "../lib/orbit.ts";
import { missionControlStatus } from "./suit-feed.ts";

// the comms scenario (src/data/comms.ts, backend config.py): MRS-L1 about 25° up at 15.63 LMST over Jezero West
const site = { latDeg: 18.43, lonDeg: 77.42 };
const relays: RelayOrbit[] = [
  { id: "l1", name: "MRS-L1", altitudeKm: 400, inclinationDeg: 75, raanDeg: 70, argLatDeg: 9 },
  { id: "l2", name: "MRS-L2", altitudeKm: 400, inclinationDeg: 52, raanDeg: 190, argLatDeg: 300 },
  { id: "l3", name: "MRS-L3", altitudeKm: 400, inclinationDeg: 52, raanDeg: 310, argLatDeg: 70 },
  { id: "l4", name: "MRS-L4", altitudeKm: 400, inclinationDeg: 75, raanDeg: 70, argLatDeg: 189 },
];
const snapshotLmst = 15.63;

assert.deepEqual(relayAt(relays[0], 0), orbitPoint(relays[0]), "t = 0 is the snapshot");
const l1 = lookAngles(site, relayAt(relays[0], 0));
assert.ok(l1.elDeg > 15 && l1.elDeg < 35, `MRS-L1 about 25° up at the snapshot, got ${l1.elDeg}`);
for (const r of relays.slice(1)) assert.ok(lookAngles(site, relayAt(r, 0)).elDeg < 0, `${r.name} below the horizon at the snapshot`);
// the relay moves: 60 s later it is somewhere else
assert.notDeepEqual(relayAt(relays[0], 60), relayAt(relays[0], 0));
assert.ok(uplinkMarginDb(90, 400) > uplinkMarginDb(10, 400), "margin grows with elevation");

const now = orbitLinkAt(site, relays, snapshotLmst, snapshotLmst)!;
assert.equal(now.relay, "MRS-L1");
assert.ok(now.aosLmst <= snapshotLmst && snapshotLmst <= now.losLmst, "pass in progress spans now");
assert.ok(now.track.length >= 2 && now.track.every((p) => p.elDeg >= -1), "track stays above the horizon");
assert.ok(now.losLmst - now.aosLmst < 0.5, `a 400 km pass lasts minutes, got ${(now.losLmst - now.aosLmst) * 60} Mars min`);

const next = orbitLinkAt(site, relays, snapshotLmst, now.losLmst + 0.01)!;
assert.ok(next && next.aosLmst > now.losLmst, "after LOS the next pass is in the future");

// a planned EVA (same data as ar-package.test.ts)
const pub = (p: string) => new URL(`../../public/data/${p}`, import.meta.url);
const app = JSON.parse(readFileSync(pub("app/app.json"), "utf8"));
const n = app.grid.rows * app.grid.cols;
const raw = new Float32Array(readFileSync(pub("app/grid.bin")).buffer.slice(0));
const grid = { ...app.grid, elev: raw.subarray(0, n), slope: raw.subarray(n, 2 * n), sky: raw.subarray(2 * n, 3 * n), rough: raw.subarray(3 * n) };
const wx = JSON.parse(readFileSync(pub("meda_weather.json"), "utf8"));
const elevs = app.stops.map((s: { elev: number }) => s.elev).sort((a: number, b: number) => a - b);
const data = { grid, stops: app.stops, hourly: wx.hourly, refElev: elevs[elevs.length >> 1] };
const result = planMission(data, { scienceId: "app-50kg", policyId: "engine", startLmst: 9, kSuit: 1, modelKey: "acsmScaled" } as never);
const ev = result.modes.efficient;
const a = missionControlStatus(result, ev, 0, { site, relays, snapshotLmst }, grid)!;
const b = missionControlStatus(result, ev, 60, { site, relays, snapshotLmst })!;
assert.equal(a.lmst, 9);
assert.ok(b.lmst > a.lmst && b.o2LeftL < a.o2LeftL, "an hour later: later LMST, less O2");
for (const k of ["pressurePa", "doseRateMSvDay", "o2LeftL", "homeO2L", "evaLeftMin"] as const) assert.ok(Number.isFinite(a[k]), k);
assert.ok(a.rough != null && a.rough >= 0, "roughness underfoot from the grid");
assert.ok(a.airC != null && a.groundC != null, "MEDA weather present");
assert.ok(a.orbit && a.orbit.track.length >= 2, "orbit link found within a sol");
assert.ok(JSON.stringify(a).length < 8000, "small enough to send every few seconds");
if (process.env.WRITE_FIXTURE) (await import("node:fs")).writeFileSync(process.env.WRITE_FIXTURE, JSON.stringify(a, null, 1));
console.log(`suit-feed ok · pass ${now.relay} ${now.aosLmst.toFixed(2)}–${now.losLmst.toFixed(2)} LMST, max el ${now.maxElDeg.toFixed(0)}° · status ${JSON.stringify(a).length} B`);
