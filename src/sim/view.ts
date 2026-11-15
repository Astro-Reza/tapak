/**
 * Typed adapters: engine results (metres, minutes, litres, mSv) -> view models in design pixels and display strings.
 * No React here, so every screen formats numbers the same way and tests can call these directly.
 */
import type { Point, Cell } from "@/components/marswalk/map";
import type { Status as ChipStatus, LogLevel } from "@/components/marswalk/primitives";
import {
  doseRate,
  envAt,
  legBreakdown,
  ringCells,
  sampleAt,
  status,
  walkBackMargin,
  type Evaluation,
  type MissionResult,
  type ProfileSample,
  type Sample,
  type Status,
} from "@/engine";
import type { LoadedData, OrbitalLayers } from "./load";
import { arrivalIndices, stopName } from "./stops";

export { arrivalIndices, stopName };

/* ---------- formatting ---------- */

export const MARS_HOUR_MIN = 61.65; // Earth minutes per Mars hour (engine telemetry.js)
export const fmtHM = (min: number) => `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, "0")}`;
export const fmtLmst = (h: number) => {
  const x = ((h % 24) + 24) % 24;
  return `${String(Math.floor(x)).padStart(2, "0")}:${String(Math.floor((x % 1) * 60)).padStart(2, "0")}`;
};
const lat = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const lon = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;

/* ---------- projection: world metres -> design pixels ---------- */

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Projection = {
  /** design pixels per metre */
  scale: number;
  px: (x: number, z: number) => Point;
  world: (px: number, py: number) => [number, number];
  /** ortho image placement (covers the whole terrain patch) */
  basemap: { left: number; top: number; width: number; height: number };
};

/** Fit the points (x east, z south: north up) into `box`, uniform scale. */
export function fitProjection(points: { x: number; z: number }[], box: Box, terrain: LoadedData["terrain"]): Projection {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const scale = Math.min((box.x1 - box.x0) / Math.max(maxX - minX, 1), (box.y1 - box.y0) / Math.max(maxZ - minZ, 1));
  const ox = (box.x0 + box.x1) / 2 - ((minX + maxX) / 2) * scale;
  const oy = (box.y0 + box.y1) / 2 - ((minZ + maxZ) / 2) * scale;
  const [sx, sz] = terrain.size;
  return {
    scale,
    px: (x, z) => [ox + x * scale, oy + z * scale],
    world: (px, py) => [(px - ox) / scale, (py - oy) / scale],
    basemap: { left: ox - (sx / 2) * scale, top: oy - (sz / 2) * scale, width: sx * scale, height: sz * scale },
  };
}

const thin = (pts: Point[], minPx = 3): Point[] =>
  pts.filter((p, i) => i === 0 || i === pts.length - 1 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) >= minPx);

/* ---------- data layers on the 24 px design grid ---------- */

const CELL = 24;
const stepped = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 4) / 4; // stepped cells, never soft gradients
const mix = (low: string, high: string, mid: string | null, v: number) =>
  mid
    ? v < 0.5
      ? `color-mix(in srgb, ${low}, ${mid} ${v * 200}%)`
      : `color-mix(in srgb, ${mid}, ${high} ${(v - 0.5) * 200}%)`
    : `color-mix(in srgb, ${low}, ${high} ${v * 100}%)`;

export type LayerCells = {
  slope: Cell[];
  dose: Cell[];
  doseRange: [number, number];
  noGo: Cell[];
  /** orbital dataset layers by id (cells with no data are left out) */
  orbital: Record<string, Cell[]>;
  /** the value range each orbital layer's ramp spans: the dataset range, or the data in view when stretched */
  orbitalRange: Record<string, [number, number]>;
};

/** Per 24 px cell layer values, before colouring. */
export type LayerSamples = {
  cells: { x: number; y: number; slope: number; dose: number; noGo: number; orb: number[] }[];
  orb: OrbitalLayers["layers"];
};

const RAMPS: Record<string, [string, string, string | null]> = {
  minerals: ["var(--data-mineral-low)", "var(--data-mineral-high)", null],
  thermal: ["var(--data-thermal-low)", "var(--data-thermal-high)", "var(--data-thermal-mid)"],
};

/**
 * Slope (0-35°, the layer ramp), quiet-sun dose rate, no-go share and the orbital layers per 24 px cell.
 * `nearPx` keeps only cells within that distance of the route; null covers the whole terrain patch.
 */
export function layerCells(
  data: LoadedData,
  result: MissionResult,
  proj: Projection,
  route: Point[],
  design: { width: number; height: number },
  nearPx: number | null = 80,
  orbital?: OrbitalLayers | null,
): LayerCells {
  return colorCells(layerSamples(data, result, proj, route, design, nearPx, orbital));
}

/** The sampling half of `layerCells`: average every layer under each 24 px cell. */
export function layerSamples(
  data: LoadedData,
  result: MissionResult,
  proj: Projection,
  route: Point[],
  design: { width: number; height: number },
  nearPx: number | null = 80,
  orbital?: OrbitalLayers | null,
): LayerSamples {
  const g = data.grid;
  const orb = orbital?.layers ?? [];
  const raw: LayerSamples["cells"] = [];
  // near the route: the design frame; whole patch: the ortho footprint
  const b = proj.basemap;
  const [xa, ya, xb, yb] = nearPx == null
    ? [Math.floor(b.left / CELL) * CELL, Math.floor(b.top / CELL) * CELL, b.left + b.width, b.top + b.height]
    : [0, 0, design.width, design.height];
  for (let py = ya; py < yb; py += CELL) {
    for (let px = xa; px < xb; px += CELL) {
      const cx = px + CELL / 2, cy = py + CELL / 2;
      if (nearPx != null && !route.some(([x, y]) => Math.hypot(x - cx, y - cy) < nearPx)) continue;
      // average the 4 m grid cells under this design cell
      const [wx0, wz0] = proj.world(px, py), [wx1, wz1] = proj.world(px + CELL, py + CELL);
      const c0 = Math.max(0, Math.floor((wx0 - g.x0) / g.cell[0])), c1 = Math.min(g.cols - 1, Math.ceil((wx1 - g.x0) / g.cell[0]));
      const r0 = Math.max(0, Math.floor((wz0 - g.z0) / g.cell[1])), r1 = Math.min(g.rows - 1, Math.ceil((wz1 - g.z0) / g.cell[1]));
      let n = 0, slope = 0, sky = 0, elev = 0, noGo = 0;
      const sum = orb.map(() => 0), cnt = orb.map(() => 0);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * g.cols + c;
        slope += g.slope[i]; sky += g.sky?.[i] ?? 1; elev += g.elev[i]; n++;
        if (g.slope[i] > result.s.maxSlopeDeg) noGo++;
        for (let k = 0; k < orb.length; k++) {
          const v = orb[k].values[i];
          if (!Number.isNaN(v)) { sum[k] += v; cnt[k]++; }
        }
      }
      if (!n) continue;
      const pressure = envAt(result.env, 0, elev / n).pressurePa;
      raw.push({
        x: px + 1, y: py + 1, slope: slope / n, dose: doseRate(pressure, sky / n), noGo: noGo / n,
        orb: sum.map((v, k) => (cnt[k] ? v / cnt[k] : NaN)),
      });
    }
  }
  return { cells: raw, orb };
}

/** Min and max of the finite values, or null when there are none. */
const extent = (values: number[]): [number, number] | null => {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return lo <= hi ? [lo, hi] : null;
};

/**
 * Colour the sampled cells. With `stretch` (a design-pixel box, the map in view) the dose and orbital
 * ramps span only the cells inside it, so local contrast shows; slope keeps its fixed 0-35° ramp because
 * its colours mean the caution and no-go limits.
 */
export function colorCells({ cells: raw, orb }: LayerSamples, stretch?: Box | null): LayerCells {
  const inView = stretch
    ? raw.filter((c) => c.x + CELL / 2 >= stretch.x0 && c.x + CELL / 2 <= stretch.x1 && c.y + CELL / 2 >= stretch.y0 && c.y + CELL / 2 <= stretch.y1)
    : raw;
  const fullDose = extent(raw.map((c) => c.dose)) ?? [0, 0];
  const [lo, hi] = (stretch && extent(inView.map((c) => c.dose))) || fullDose;
  const orbitalCells: Record<string, Cell[]> = {};
  const orbitalRange: Record<string, [number, number]> = {};
  orb.forEach((l, k) => {
    const [low, high, mid] = RAMPS[l.ramp] ?? RAMPS.minerals;
    const [a, z] = (stretch && extent(inView.map((c) => c.orb[k]))) || l.range;
    orbitalRange[l.id] = [a, z];
    orbitalCells[l.id] = raw
      .filter((c) => !Number.isNaN(c.orb[k]))
      .map((c) => ({ x: c.x, y: c.y, color: mix(low, high, mid, stepped((c.orb[k] - a) / (z - a || 1))) }));
  });
  return {
    slope: raw.map((c) => ({ x: c.x, y: c.y, color: mix("var(--data-slope-low)", "var(--data-slope-high)", "var(--data-slope-mid)", stepped(c.slope / 35)) })),
    dose: raw.map((c) => ({ x: c.x, y: c.y, color: mix("var(--data-radiation-low)", "var(--data-radiation-high)", null, stepped((c.dose - lo) / (hi - lo || 1))) })),
    doseRange: [lo, hi],
    noGo: raw.filter((c) => c.noGo >= 0.5).map((c) => ({ x: c.x, y: c.y, color: "var(--route-hazard)" })),
    orbital: orbitalCells,
    orbitalRange,
  };
}

/* ---------- point readout (hover) ---------- */

const MARS_R = 3396190; // m, IAU sphere

export type PointReadout = { lat: string; lon: string; rows: StatView[] } | null;

/** Values of every layer at world point (x east, z south), metres. Null outside the grid. */
export function pointReadout(data: LoadedData, result: MissionResult, orbital: OrbitalLayers | null, x: number, z: number): PointReadout {
  const g = data.grid;
  const c = Math.floor((x - g.x0) / g.cell[0]), r = Math.floor((z - g.z0) / g.cell[1]);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return null;
  const i = r * g.cols + c;
  const { lat: lat0, lon: lon0 } = data.terrain.center;
  const la = lat0 - (z / MARS_R) * (180 / Math.PI);
  const lo = lon0 + (x / (MARS_R * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI);
  const elev = g.elev[i];
  const dose = (doseRate(envAt(result.env, 0, elev).pressurePa, g.sky?.[i] ?? 1) * 24) / 1000;
  const fmt = (v: number) => (Number.isNaN(v) ? "no data" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4));
  return {
    lat: `${Math.abs(la).toFixed(5)}° ${la >= 0 ? "N" : "S"}`,
    lon: `${Math.abs(lo).toFixed(5)}° ${lo >= 0 ? "E" : "W"}`,
    rows: [
      { label: "Elevation", value: elev.toFixed(1), unit: "m" },
      { label: "Slope", value: g.slope[i].toFixed(1), unit: g.slope[i] > result.s.maxSlopeDeg ? "° · no-go" : "°" },
      { label: "Dose rate (quiet)", value: dose.toFixed(3), unit: "mSv/day" },
      ...(orbital?.layers ?? []).map((l) => ({ label: l.name, value: fmt(l.values[i]), unit: Number.isNaN(l.values[i]) ? "" : l.unit })),
    ],
  };
}

/* ---------- Plan ---------- */

export type WaypointView = {
  id: string;
  name: string;
  detail: string;
  status: ChipStatus;
  at: Point;
  /** km from the previous stop, and what the leg needs */
  legNote: string;
};

export type StatView = { label: string; value: string; unit?: string };
export type ProfileView = {
  line: Point[];
  caution: Point[][];
  stops: { label: string; x: number; y: number }[];
  axis: { label: string; x: number }[];
  datum: string;
  meta: string;
};

/** Profile chart in a w x h box, distance on x, elevation on y (top..bottom px). */
function profileView(prof: ProfileSample[], arrivals: number[], s: { cautionSlopeDeg: number }, box: { x0: number; x1: number; top: number; bottom: number }): ProfileView {
  const total = prof.at(-1)!.dist || 1;
  const ys = prof.map((p) => p.y), lo = Math.min(...ys), hi = Math.max(...ys);
  const X = (d: number) => box.x0 + (d / total) * (box.x1 - box.x0);
  const Y = (y: number) => box.bottom - ((y - lo) / (hi - lo || 1)) * (box.bottom - box.top);
  const line = thin(prof.map((p) => [X(p.dist), Y(p.y)] as Point), 2);
  const caution: Point[][] = [];
  let cur: Point[] = [];
  for (let k = 1; k < prof.length; k++) {
    if (prof[k].slope > s.cautionSlopeDeg) {
      if (!cur.length) cur.push([X(prof[k - 1].dist), Y(prof[k - 1].y)]);
      cur.push([X(prof[k].dist), Y(prof[k].y)]);
    } else if (cur.length) { caution.push(cur); cur = []; }
  }
  if (cur.length) caution.push(cur);
  const km = total / 1000;
  let climb = 0;
  for (let k = 1; k < prof.length; k++) climb += Math.max(0, prof[k].y - prof[k - 1].y);
  return {
    line,
    caution,
    stops: arrivals.map((pi, k) => {
      const p = prof[pi];
      return { label: `WP${k + 1}`, x: X(p.dist), y: Y(p.y) };
    }),
    axis: [0, 0.25, 0.5, 0.75, 1].map((f, i) => ({ label: i === 4 ? `${(km * f).toFixed(2)} km` : (km * f).toFixed(2), x: X(total * f) - 4 })),
    datum: `${Math.round(lo).toLocaleString("en-US").replace(",", " ")} m`,
    meta: `${km.toFixed(2)} km · +${Math.round(climb)} m · max ${Math.max(...prof.map((p) => p.slope)).toFixed(0)}°`,
  };
}

/** Profile index of each stop arrival (stop 0 = start), then the return home. */

/** The next arrival (waypoint, or home) after EVA minute T. Shared by EVA Map and FoV so both name the same stop. */
export function nextArrival(prof: ProfileSample[], arrivals: number[], T: number) {
  const k = arrivals.findIndex((pi) => prof[pi].t - (prof[pi].dwell ?? 0) > T + 1e-6);
  const index = k < 0 ? arrivals.length - 1 : k;
  const point = prof[arrivals[index]];
  return { index, point, label: index === arrivals.length - 1 ? "Home" : `WP${index + 1}`, minutes: Math.max(0, point.t - (point.dwell ?? 0) - T) };
}

export type PlanView = {
  ok: boolean;
  error?: string;
  subtitle: string;
  waypoints: WaypointView[];
  route: Point[];
  caution: Point[][];
  summary: StatView[];
  verdict: Evaluation["verdict"];
  reasons: string[];
  hazard: { title: string; body: string; action: string } | null;
  profile: ProfileView | null;
  proj: Projection;
};

export function planView(data: LoadedData, result: MissionResult, ev: Evaluation, design: Box): PlanView {
  const s = result.s;
  const pts = ev.prof ?? data.stops.map((st) => ({ x: st.xz[0], z: st.xz[1] }));
  const proj = fitProjection([...pts, ...data.stops.map((st) => ({ x: st.xz[0], z: st.xz[1] }))], design, data.terrain);
  if (!ev.prof || !ev.end || !ev.row) {
    return {
      ok: false, error: ev.error, subtitle: `${data.stops.length} stops · Jezero HiRISE DTM`, waypoints: [], route: [], caution: [], summary: [],
      verdict: ev.verdict, reasons: ev.reasons, hazard: null, profile: null, proj,
    };
  }
  const prof = ev.prof, end = ev.end, row = ev.row;
  const arrivals = arrivalIndices(ev);
  const waypoints: WaypointView[] = arrivals.map((pi, k) => {
    const last = k === arrivals.length - 1;
    const st = data.stops[last ? 0 : k];
    const p = prof[pi];
    const prev = k ? prof[arrivals[k - 1]] : p;
    let legMax = 0;
    for (let j = k ? arrivals[k - 1] : 0; j <= pi; j++) legMax = Math.max(legMax, prof[j].slope);
    const caution = legMax > s.cautionSlopeDeg;
    return {
      id: last ? `WP${arrivals.length}` : `WP${k + 1}`,
      name: last ? "Return" : k === 0 ? `Start · ${stopName(st.id)}` : stopName(st.id),
      detail: `${(p.dist / 1000).toFixed(2)} km · ${lat(st.lat)} ${lon(st.lon)}`,
      status: caution ? "caution" : "safe",
      at: proj.px(p.x, p.z),
      legNote: k === 0
        ? `Start of route · rover stop ${st.id} · ${p.dwell ? `${p.dwell} min` : "no"} science stop`
        : `Leg ${k}: ${((p.dist - prev.dist) / 1000).toFixed(2)} km · ${(p.t - (p.dwell ?? 0) - prev.t).toFixed(0)} min walk · ${(p.o2 - prev.o2).toFixed(1)} L O₂ · max ${legMax.toFixed(1)}°${caution ? " · CAUTION" : ""}`,
    };
  });
  const route = thin(prof.map((p) => proj.px(p.x, p.z)));
  const caution: Point[][] = [];
  let cur: Point[] = [];
  for (let k = 1; k < prof.length; k++) {
    if (prof[k].slope > s.cautionSlopeDeg) {
      if (!cur.length) cur.push(proj.px(prof[k - 1].x, prof[k - 1].z));
      cur.push(proj.px(prof[k].x, prof[k].z));
    } else if (cur.length) { caution.push(cur); cur = []; }
  }
  if (cur.length) caution.push(cur);

  // hazard card: the longest stretch above the caution slope
  let hazard: PlanView["hazard"] = null;
  {
    let best = { len: 0, max: 0, after: 0 }, run = { len: 0, max: 0, after: 0 };
    for (let k = 1; k < prof.length; k++) {
      if (prof[k].slope > s.cautionSlopeDeg) {
        if (!run.len) run.after = arrivals.filter((a) => a <= k - 1).length - 1;
        run.len += prof[k].dist - prof[k - 1].dist;
        run.max = Math.max(run.max, prof[k].slope);
        if (run.len > best.len) best = { ...run };
      } else run = { len: 0, max: 0, after: 0 };
    }
    if (best.len > 0) {
      const safest = result.modes.safest;
      hazard = {
        title: `Slope ${best.max.toFixed(0)}° for ${Math.round(best.len)} m after ${waypoints[Math.max(0, best.after)].id}`,
        body: `Above the ${s.cautionSlopeDeg}° caution level; the route already avoids ground over the ${s.maxSlopeDeg}° limit`,
        action: safest.prof && safest !== ev
          ? `Short steps here, or plan Safest: max ${safest.maxSlope.toFixed(1)}°, ${((safest.end!.dist - end.dist) >= 0 ? "+" : "")}${Math.round(safest.end!.dist - end.dist)} m`
          : "Short steps, slow pace on this stretch",
      };
    }
  }
  let climb = 0;
  for (let k = 1; k < prof.length; k++) climb += Math.max(0, prof[k].y - prof[k - 1].y);
  const o2Pct = (100 * end.o2) / s.o2CapacityL;
  return {
    ok: true,
    subtitle: `${data.stops.length} stops · Jezero HiRISE DTM · start ${fmtLmst(result.env.startLmst)} LMST`,
    waypoints,
    route,
    caution,
    summary: [
      { label: "Distance", value: (end.dist / 1000).toFixed(2), unit: "km" },
      { label: "Climb", value: `+${Math.round(climb)}`, unit: "m" },
      { label: "Max slope", value: ev.maxSlope.toFixed(1), unit: "°" },
      { label: "Duration (incl. stops)", value: fmtHM(end.t), unit: "h:mm" },
      { label: "O₂ used (modelled)", value: end.o2.toFixed(1), unit: `L · ${o2Pct.toFixed(0)} %` },
      { label: "Walk-back margin", value: ev.wb ? `${ev.wb.minMarginL >= 0 ? "+" : ""}${ev.wb.minMarginL.toFixed(0)}` : "—", unit: "L" },
      { label: "EVA dose (modelled)", value: end.dose.toFixed(3), unit: "mSv" },
    ],
    verdict: ev.verdict,
    reasons: [
      `${row.targets}/${row.targetsOf} stops`,
      `${fmtHM(end.t)} of ${fmtHM(s.evaLimitMin)} cap`,
      `max slope ${ev.maxSlope.toFixed(1)}° (limit ${s.maxSlopeDeg}°)`,
      `O₂ left ${row.o2LeftPct.toFixed(0)} % (reserve ${Math.round(s.reserveFrac * 100)} %)`,
      ...ev.reasons,
      ...ev.cautions.filter((c) => !c.startsWith("Slope up to")),
    ],
    hazard,
    profile: profileView(prof, arrivals, s, { x0: 40, x1: 600, top: 60, bottom: 140 }),
    proj,
  };
}

/* ---------- EVA (live, at minute T) ---------- */

export type EvaView = {
  now: Sample;
  st: Status;
  marginL: number;
  tiles: { label: string; value: string; unit: string; sub: string }[];
  prediction: StatView[];
  walked: Point[];
  remaining: Point[];
  you: Point;
  youTag: string;
  markers: { label: string; x: number; y: number; next: boolean }[];
  ring: Cell[];
  profile: { walked: Point[]; ahead: Point[]; nowX: number; nowLabel: string; meta: string };
  telemetry: StatView[];
  log: { time: string; level: LogLevel; message: string }[];
  proj: Projection;
};

export function evaView(data: LoadedData, result: MissionResult, ev: Evaluation, T: number, design: Box): EvaView | null {
  if (!ev.prof || !ev.end) return null;
  const s = result.s, prof = ev.prof, end = ev.end;
  const proj = fitProjection(prof, design, data.terrain);
  const now = sampleAt(prof, T, s);
  const st = status(now as unknown as ProfileSample, end, s, result.env);
  const marginL = walkBackMargin(data.grid, result.field, now, s);
  const arrivals = arrivalIndices(ev);
  const { index: next, point: nextP, label: nextLabel, minutes: minToNext } = nextArrival(prof, arrivals, T);
  const lmstNow = result.env.startLmst + T / MARS_HOUR_MIN;
  const lmstEnd = result.env.startLmst + end.t / MARS_HOUR_MIN;
  const doseDay = (st.doseRateUSvH * 24) / 1000;

  const walkedPts: Point[] = [...prof.slice(0, now.k).map((p) => proj.px(p.x, p.z)), proj.px(now.x, now.z)];
  const remainingPts: Point[] = [proj.px(now.x, now.z), ...prof.slice(now.k).map((p) => proj.px(p.x, p.z))];
  const you = proj.px(now.x, now.z);

  // no-return ring at the O2 in hand (cells you can still walk home from with the reserve intact)
  const g = data.grid;
  const ring: Cell[] = [];
  const seen = new Set<string>();
  for (const i of ringCells(g, result.field, st.o2LeftL, s)) {
    const r = (i / g.cols) | 0, c = i % g.cols;
    const [x, y] = proj.px(g.x0 + c * g.cell[0], g.z0 + r * g.cell[1]);
    const key = `${Math.round(x / 6)}:${Math.round(y / 6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ring.push({ x: x - 3, y: y - 3, color: "var(--status-danger)" });
  }

  // profile chart 660 x 148, baseline 130
  const total = end.dist || 1;
  const ys = prof.map((p) => p.y), lo = Math.min(...ys), hi = Math.max(...ys);
  const X = (d: number) => 30 + (d / total) * 600, Y = (y: number) => 120 - ((y - lo) / (hi - lo || 1)) * 70;
  const nowX = X(now.dist);
  const pWalk = thin([...prof.slice(0, now.k).map((p) => [X(p.dist), Y(p.y)] as Point), [nowX, Y(now.y)]], 2);
  const pAhead = thin([[nowX, Y(now.y)], ...prof.slice(now.k).map((p) => [X(p.dist), Y(p.y)] as Point)], 2);
  let aheadMax = 0;
  for (let j = now.k; j <= arrivals[next]; j++) aheadMax = Math.max(aheadMax, prof[j].slope);
  const rise = nextP.y - now.y;

  // log: arrivals and departures so far, newest first, plus what is ahead
  const log: EvaView["log"] = [];
  const clock = (t: number) => `${fmtLmst(result.env.startLmst + t / MARS_HOUR_MIN)}`;
  arrivals.forEach((pi, k) => {
    const p = prof[pi], arrive = p.t - (p.dwell ?? 0);
    if (k > 0 && arrive <= T) log.push({ time: clock(arrive), level: "info", message: `Arrived ${k === arrivals.length - 1 ? "home" : `WP${k + 1}`} · ${(p.dist / 1000).toFixed(2)} km` });
    if (p.dwell && p.t <= T) log.push({ time: clock(p.t), level: "info", message: `Left WP${k + 1} after ${p.dwell} min science stop` });
  });
  if (aheadMax > s.cautionSlopeDeg) log.push({ time: clock(T), level: "warn", message: `Slope ${aheadMax.toFixed(0)}° ahead, caution ${s.cautionSlopeDeg}°, limit ${s.maxSlopeDeg}°` });
  if (st.level !== "nominal") log.push({ time: clock(T), level: st.level === "return" ? "alert" : "warn", message: st.level === "return" ? "Start return now" : "Reserve below plan margin" });
  for (const n of st.notes) log.push({ time: clock(T), level: "info", message: n });
  log.sort((a, b) => (a.time < b.time ? 1 : -1));

  return {
    now,
    st,
    marginL,
    tiles: [
      { label: "Distance", value: (now.dist / 1000).toFixed(2), unit: "km", sub: `of ${(end.dist / 1000).toFixed(2)} · ${Math.round((100 * now.dist) / total)} %` },
      { label: "EVA time", value: fmtHM(T), unit: "h", sub: `cap ${fmtHM(s.evaLimitMin)}` },
      { label: "Oxygen", value: st.o2Pct.toFixed(0), unit: "%", sub: `≥ ${Math.round(s.reserveFrac * 100)} reserve · modelled` },
      { label: "Power", value: "—", unit: "", sub: "not modelled" },
      { label: "Dose rate", value: doseDay.toFixed(2), unit: "mSv/d", sub: "GCR model" },
      { label: "Next stop", value: minToNext.toFixed(0), unit: "min", sub: `${nextLabel} · ${Math.max(0, nextP.dist - now.dist).toFixed(0)} m` },
    ],
    prediction: [
      { label: "O₂ at return", value: ((100 * (s.o2CapacityL - end.o2)) / s.o2CapacityL).toFixed(0), unit: "%" },
      { label: "Return to airlock", value: fmtLmst(lmstEnd), unit: "LMST" },
      { label: "Remaining", value: ((end.dist - now.dist) / 1000).toFixed(2), unit: "km" },
      { label: "Slack to cap", value: `${s.evaLimitMin - end.t >= 0 ? "+" : ""}${Math.round(s.evaLimitMin - end.t)}`, unit: "min" },
      { label: "Walk-back spare", value: `${marginL >= 0 ? "+" : ""}${marginL.toFixed(0)}`, unit: "L" },
    ],
    walked: thin(walkedPts),
    remaining: thin(remainingPts),
    you,
    youTag: `You · ${(now.dist / 1000).toFixed(2)} km · ${now.dwelling ? "science stop" : `${now.slope.toFixed(0)}° slope`}`,
    markers: arrivals.slice(0, -1).map((pi, k) => {
      const [x, y] = proj.px(prof[pi].x, prof[pi].z);
      return { label: `WP${k + 1}`, x, y, next: k === next };
    }),
    ring,
    profile: {
      walked: pWalk,
      ahead: pAhead,
      nowX,
      nowLabel: `Now · ${(now.dist / 1000).toFixed(2)} km`,
      meta: `next: ${rise >= 0 ? "+" : ""}${Math.round(rise)} m over ${Math.max(0, nextP.dist - now.dist).toFixed(0)} m · max ${aheadMax.toFixed(0)}°`,
    },
    telemetry: [
      { label: "O₂ use (modelled)", value: now.rate.toFixed(2), unit: "L/min" },
      { label: "Air temp (MEDA)", value: st.airC == null ? "—" : st.airC.toFixed(0), unit: "°C" },
      { label: "Ground temp (MEDA)", value: st.groundC == null ? "—" : st.groundC.toFixed(0), unit: "°C" },
      { label: "Pressure (MEDA)", value: st.pressurePa.toFixed(0), unit: "Pa" },
      { label: "Dose rate (model)", value: st.doseRateUSvH.toFixed(1), unit: "µSv/h" },
      { label: "LMST", value: fmtLmst(lmstNow), unit: "" },
    ],
    log: log.slice(0, 6),
    proj,
  };
}

/* ---------- Debrief ---------- */

export function debriefLegs(ev: Evaluation, s: MissionResult["s"]) {
  return legBreakdown(ev.plan, ev.prof!, s);
}

/* ---------- Plan · simulated walk (Plan screen "Walk" tab) ---------- */

export type PlanWalkView = {
  walked: Point[];
  remaining: Point[];
  you: Point;
  youTag: string;
  /** x of "now" on the Plan profile chart (box 40..600) */
  nowX: number;
  nowLabel: string;
  tiles: { label: string; value: string; unit: string; sub: string }[];
};

/** Position at EVA minute T on the planned route, in the Plan map's projection, with what the layers read there. */
export function planWalkView(data: LoadedData, result: MissionResult, ev: Evaluation, proj: Projection, orbital: OrbitalLayers | null, T: number): PlanWalkView | null {
  if (!ev.prof || !ev.end) return null;
  const s = result.s, prof = ev.prof, end = ev.end;
  const now = sampleAt(prof, T, s);
  const total = end.dist || 1;
  const { label: nextLabel, point: nextP, minutes } = nextArrival(prof, arrivalIndices(ev), T);
  const read = pointReadout(data, result, orbital, now.x, now.z);
  const pick = (name: string) => read?.rows.find((r) => r.label === name);
  const thermal = pick("Thermal Inertia"), hyd = pick("Hydrated Minerals");
  const doseDay = pick("Dose rate (quiet)");
  return {
    walked: thin([...prof.slice(0, now.k).map((p) => proj.px(p.x, p.z)), proj.px(now.x, now.z)]),
    remaining: thin([proj.px(now.x, now.z), ...prof.slice(now.k).map((p) => proj.px(p.x, p.z))]),
    you: proj.px(now.x, now.z),
    youTag: `You · ${(now.dist / 1000).toFixed(2)} km · ${now.dwelling ? "science stop" : `${now.slope.toFixed(0)}° slope`}`,
    nowX: 40 + (now.dist / total) * 560,
    nowLabel: `Now · ${(now.dist / 1000).toFixed(2)} km`,
    tiles: [
      { label: "Distance", value: (now.dist / 1000).toFixed(2), unit: "km", sub: `of ${(end.dist / 1000).toFixed(2)} · ${Math.round((100 * now.dist) / total)} %` },
      { label: "EVA time", value: fmtHM(T), unit: "h", sub: `ends ${fmtHM(end.t)} · cap ${fmtHM(s.evaLimitMin)}` },
      { label: "Slope here", value: now.slope.toFixed(1), unit: "°", sub: now.slope > s.cautionSlopeDeg ? `over ${s.cautionSlopeDeg}° caution` : `caution ${s.cautionSlopeDeg}° · limit ${s.maxSlopeDeg}°` },
      { label: "Dose here", value: doseDay?.value ?? "—", unit: "mSv/d", sub: "GCR × sky view · model" },
      { label: "Thermal inertia here", value: thermal?.value ?? "…", unit: thermal?.unit ?? "", sub: "THEMIS · 100 m/px" },
      { label: "Hydration here", value: hyd?.value ?? "…", unit: "", sub: `${hyd?.unit ?? "BD1900_2"} band depth · CRISM · 181 m/px` },
      { label: "Next stop", value: minutes.toFixed(0), unit: "min", sub: `${nextLabel} · ${Math.max(0, nextP.dist - now.dist).toFixed(0)} m` },
    ],
  };
}
