/**
 * Data layers as rasters over the whole terrain patch, the way the marswalk-dataset GUI draws them:
 * one image pixel per data pixel (1 m slope, 4 m planning grid), coloured with the layer's ramp in
 * 5 stepped levels. No React here; the map draws the RGBA buffers on canvases.
 */
import type { Point } from "@/components/marswalk/map";
import { doseRate, envAt, type MissionResult } from "@/engine";
import type { GridSpec, Hires, LoadedData } from "./load";
import type { Box, Projection } from "./view";

export type Frame = { left: number; top: number; width: number; height: number };
export type Paint = { w: number; h: number; rgba: Uint8ClampedArray };
type RGB = [number, number, number];

/** Colour levels per ramp, as the GUI's "Stepped (5 levels)": 0, 25, 50, 75, 100 % */
const LEVELS = 5;

const TOKEN_FALLBACK: Record<string, string> = {
  "--data-slope-low": "#1fe53a", "--data-slope-mid": "#ffd60a", "--data-slope-high": "#ff2a1f",
  "--data-mineral-low": "#1a0b2e", "--data-mineral-high": "#ff00e5",
  "--data-thermal-low": "#00f0f0", "--data-thermal-mid": "#ffffff", "--data-thermal-high": "#ff2a1f",
  "--data-radiation-low": "#2400ff", "--data-radiation-high": "#ffd60a", "--route-hazard": "#ff2a1f",
};

/** A colour token from index.css as RGB (hex tokens only). */
function token(name: string): RGB {
  const css = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = /^#[0-9a-f]{6}$/i.test(css) ? css : TOKEN_FALLBACK[name];
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}

export const RAMP_TOKENS: Record<string, string[]> = {
  slope: ["--data-slope-low", "--data-slope-mid", "--data-slope-high"],
  dose: ["--data-radiation-low", "--data-radiation-high"],
  minerals: ["--data-mineral-low", "--data-mineral-high"],
  thermal: ["--data-thermal-low", "--data-thermal-mid", "--data-thermal-high"],
};

/** The LEVELS colours of a ramp, low to high (srgb mixing, as the legend's color-mix). */
function levels(ramp: string): RGB[] {
  const stops = (RAMP_TOKENS[ramp] ?? RAMP_TOKENS.minerals).map(token);
  const mix = (a: RGB, b: RGB, t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
  return Array.from({ length: LEVELS }, (_, k) => {
    const t = k / (LEVELS - 1);
    if (stops.length === 2) return mix(stops[0], stops[1], t);
    return t < 0.5 ? mix(stops[0], stops[1], t * 2) : mix(stops[1], stops[2], t * 2 - 1);
  });
}

/** Where a grid sits on the map, in design pixels. */
export function gridFrame(g: GridSpec, proj: Projection): Frame {
  const [l, t] = proj.px(g.x0, g.z0);
  const [r, b] = proj.px(g.x0 + g.cols * g.cell[0], g.z0 + g.rows * g.cell[1]);
  return { left: l, top: t, width: r - l, height: b - t };
}

/** Planning-grid cells within `nearPx` design pixels of the route (1 = keep). */
export function routeMask(g: GridSpec, proj: Projection, route: Point[], nearPx: number): Uint8Array {
  const mask = new Uint8Array(g.rows * g.cols);
  const rM = nearPx / proj.scale;
  const rc = Math.ceil(rM / g.cell[0]), rr = Math.ceil(rM / g.cell[1]);
  let last: [number, number] | null = null;
  for (const p of route) {
    const [x, z] = proj.world(p[0], p[1]);
    if (last && Math.hypot(x - last[0], z - last[1]) < Math.min(...g.cell)) continue; // dense route points stamp the same disc
    last = [x, z];
    const c0 = Math.floor((x - g.x0) / g.cell[0]), r0 = Math.floor((z - g.z0) / g.cell[1]);
    for (let r = Math.max(0, r0 - rr); r <= Math.min(g.rows - 1, r0 + rr); r++) {
      for (let c = Math.max(0, c0 - rc); c <= Math.min(g.cols - 1, c0 + rc); c++) {
        const dx = g.x0 + (c + 0.5) * g.cell[0] - x, dz = g.z0 + (r + 0.5) * g.cell[1] - z;
        if (dx * dx + dz * dz <= rM * rM) mask[r * g.cols + c] = 1;
      }
    }
  }
  return mask;
}

/** Quiet-sun dose rate per planning-grid cell (mSv/day), from elevation (pressure) and sky view. */
export function doseValues(data: LoadedData, result: MissionResult): Float32Array {
  const g = data.grid;
  const out = new Float32Array(g.rows * g.cols);
  for (let i = 0; i < out.length; i++) out[i] = doseRate(envAt(result.env, 0, g.elev[i]).pressurePa, g.sky?.[i] ?? 1);
  return out;
}

/** Min and max of the finite values over the whole grid, or only the cells inside `box` (design px). */
export function valueRange(values: ArrayLike<number>, g: GridSpec, proj: Projection, box?: Box | null): [number, number] | null {
  let c0 = 0, c1 = g.cols - 1, r0 = 0, r1 = g.rows - 1;
  if (box) {
    const [xa, za] = proj.world(box.x0, box.y0), [xb, zb] = proj.world(box.x1, box.y1);
    c0 = Math.max(c0, Math.ceil((xa - g.x0) / g.cell[0] - 0.5)); c1 = Math.min(c1, Math.floor((xb - g.x0) / g.cell[0] - 0.5));
    r0 = Math.max(r0, Math.ceil((za - g.z0) / g.cell[1] - 0.5)); r1 = Math.min(r1, Math.floor((zb - g.z0) / g.cell[1] - 0.5));
  }
  let lo = Infinity, hi = -Infinity;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const v = values[r * g.cols + c];
    if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Colour a planning-grid layer: NaN and masked-out cells stay clear. */
export function paintGrid(values: ArrayLike<number>, g: GridSpec, ramp: string, [lo, hi]: [number, number], mask?: Uint8Array | null): Paint {
  const lv = levels(ramp);
  const rgba = new Uint8ClampedArray(g.rows * g.cols * 4);
  const span = hi - lo || 1;
  for (let i = 0; i < g.rows * g.cols; i++) {
    const v = values[i];
    if (!Number.isFinite(v) || (mask && !mask[i])) continue;
    const k = Math.round(Math.max(0, Math.min(1, (v - lo) / span)) * (LEVELS - 1));
    const [r, gg, b] = lv[k];
    rgba[i * 4] = r; rgba[i * 4 + 1] = gg; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
  }
  return { w: g.cols, h: g.rows, rgba };
}

/** Planning-grid index of every 1 m pixel, so the route mask applies to the slope raster too. */
function coarseIndex(h: Hires, g: GridSpec): Int32Array {
  const col = new Int32Array(h.cols), out = new Int32Array(h.rows * h.cols);
  for (let c = 0; c < h.cols; c++) col[c] = Math.min(g.cols - 1, Math.max(0, Math.floor((h.x0 + (c + 0.5) * h.cell[0] - g.x0) / g.cell[0])));
  for (let r = 0; r < h.rows; r++) {
    const gr = Math.min(g.rows - 1, Math.max(0, Math.floor((h.z0 + (r + 0.5) * h.cell[1] - g.z0) / g.cell[1])));
    for (let c = 0; c < h.cols; c++) out[r * h.cols + c] = gr * g.cols + col[c];
  }
  return out;
}

/**
 * The 1 m slope: the slope ramp over 0-35° (its colours mean the caution and no-go limits, so it never
 * stretches), or with `noGoDeg` only the pixels over that limit, in the hazard colour.
 */
export function paintSlope(h: Hires, opts: { noGoDeg?: number; mask?: Uint8Array | null; grid: GridSpec }): Paint {
  const n = h.rows * h.cols;
  const rgba = new Uint8ClampedArray(n * 4);
  const idx = opts.mask ? coarseIndex(h, opts.grid) : null;
  const lv = levels("slope"), hazard = token("--route-hazard");
  for (let i = 0; i < n; i++) {
    const s = h.slope[i];
    if (s === 255 || (idx && !opts.mask![idx[i]])) continue;
    const deg = s * h.step;
    let col: RGB;
    if (opts.noGoDeg != null) {
      if (deg <= opts.noGoDeg) continue;
      col = hazard;
    } else col = lv[Math.round(Math.min(1, deg / 35) * (LEVELS - 1))];
    rgba[i * 4] = col[0]; rgba[i * 4 + 1] = col[1]; rgba[i * 4 + 2] = col[2]; rgba[i * 4 + 3] = 255;
  }
  return { w: h.cols, h: h.rows, rgba };
}
