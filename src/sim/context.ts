/**
 * The marswalk-dataset map catalog, global MOLA down to the 1 m HiRISE DTM (scripts/import-context.py),
 * read the way the dataset GUI reads it (gui/geo.py): equirectangular rasters with pixel-edge bounds
 * [west, east, south, north] in planetocentric degrees, row 0 on the north edge, nearest-pixel sampling.
 * No React here. Rasters load one at a time, only when a layer or a tool needs them.
 */
import { ORTHO, type LoadedData } from "./load";

const url = (path: string) => `${import.meta.env.BASE_URL}data/context/${path}`;
export const MARS_R = 3396190;
const DEG = 180 / Math.PI;

export type Bounds = [number, number, number, number]; // west, east, south, north

export type RasterMeta = {
  id: string;
  name: string;
  group: string;
  kind: "scalar" | "gray" | "rgb";
  units: string;
  ramp: string | null;
  bounds: Bounds;
  res_m: number;
  hillshade: boolean;
  shape: [number, number];
  file: string;
  offset?: number;
  scale?: number;
  nodata?: number;
  /** min, p2, median, p98, max */
  p?: number[];
  overview?: { file: string; shape: [number, number] };
  credit?: string;
  source?: string;
  note?: string;
};

export type Bookmark = { name: string; lon: number; lat: number; height: number };

export type Rover = {
  id: string;
  name: string;
  source: string;
  credit: string;
  count: number;
  sol: number[];
  lat: number[];
  lon: number[];
  elev: (number | null)[];
  dist_total_m: (number | null)[];
};

export type Vectors = {
  rovers: Rover[];
  sites: { name: string; lat: number; lon: number }[];
  features: { name: string; lat: number; lon: number }[];
  note?: string;
};

export type WeatherDay = { air_temp_k: (number | null)[]; ground_temp_k: (number | null)[]; pressure_pa: (number | null)[] };
export type Weather = {
  source: string;
  credit: string;
  products: string;
  stat: string;
  sols: number[];
  by_sol: Record<string, WeatherDay>;
  typical_day: WeatherDay;
};

export type GlossaryEntry = {
  id: string;
  title: string;
  kind: string;
  summary: string;
  body: string[];
  facts: [string, string][];
  aliases: string[];
  layers: string[];
  see: string[];
  goto: [number, number, number] | null;
};

export type SiteRaster = { file: string; offset: number; scale: number; nodata: number; shape: [number, number]; res_m: number; credit: string };

export type Catalog = {
  rasters: RasterMeta[];
  site: SiteRaster;
  bookmarks: Bookmark[];
  vectors: Vectors;
  weather: Weather;
  glossary: { kinds: string[]; entries: GlossaryEntry[] };
};

/** A decoded raster. Scalars hold values (NaN = no data); images hold grey levels and their RGB pixels. */
export type Raster = {
  meta: RasterMeta;
  rows: number;
  cols: number;
  bounds: Bounds;
  values?: Float32Array;
  grey?: Uint8Array;
  rgba?: Uint8ClampedArray;
  /** metres per pixel (north-south) */
  pxM: number;
};

async function get(path: string): Promise<Response> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r;
}

let catalog: Promise<Catalog> | null = null;

/** context.json, vectors, weather and glossary: small files, loaded once. */
export function loadCatalog(): Promise<Catalog> {
  catalog ??= Promise.all(
    ["context.json", "vectors.json", "weather.json", "glossary.json"].map((f) => get(url(f)).then((r) => r.json())),
  )
    .then(([ctx, vectors, weather, glossary]) => ({ rasters: ctx.rasters, site: ctx.site, bookmarks: ctx.bookmarks, vectors, weather, glossary }))
    .catch((e) => {
      catalog = null;
      throw e;
    });
  return catalog;
}

/* ---------- the planning patch on the planet ---------- */

/** World metres (x east, z south, origin at the terrain centre) to lon/lat, as the planning grid is placed. */
export function siteGeo(data: LoadedData) {
  const { lat: lat0, lon: lon0 } = data.terrain.center;
  const k = MARS_R * Math.cos(lat0 / DEG);
  return {
    toLonLat: (x: number, z: number): [number, number] => [lon0 + (x / k) * DEG, lat0 - (z / MARS_R) * DEG],
    toWorld: (lon: number, lat: number): [number, number] => [((lon - lon0) / DEG) * k, ((lat0 - lat) / DEG) * MARS_R],
  };
}

/** The site rasters as catalog entries: the 1 m HiRISE elevation and the patch orthoimage. */
export function siteMetas(data: LoadedData, s: SiteRaster): RasterMeta[] {
  const g = data.grid;
  const { toLonLat } = siteGeo(data);
  const [w, n] = toLonLat(g.x0, g.z0);
  const [e, so] = toLonLat(g.x0 + g.cols * g.cell[0], g.z0 + g.rows * g.cell[1]);
  const [sx, sz] = data.terrain.size;
  const [ow, on] = toLonLat(-sx / 2, -sz / 2);
  const [oe, os] = toLonLat(sx / 2, sz / 2);
  return [
    {
      id: "site_dtm", name: "HiRISE DTM 1 m", group: "Marswalk patch", kind: "scalar", units: "m", ramp: "terrain",
      bounds: [w, e, so, n], res_m: s.res_m, hillshade: true, shape: s.shape, file: s.file, offset: s.offset, scale: s.scale,
      nodata: s.nodata, credit: s.credit,
    },
    {
      id: "site_ortho", name: "HiRISE image 1 m", group: "Marswalk patch", kind: "gray", units: "", ramp: null,
      bounds: [ow, oe, os, on], res_m: sz / 2048, hillshade: false, shape: [2048, 2048], file: ORTHO,
      credit: "NASA/JPL/UArizona (HiRISE)",
    },
  ];
}

/* ---------- decoding ---------- */

async function pixels(src: string, w: number, h: number): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(await (await get(src)).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  if (bmp.width !== w || bmp.height !== h) throw new Error(`${src}: ${bmp.width} x ${bmp.height}, expected ${w} x ${h}`);
  const ctx = new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, w, h).data;
}

const rasters = new Map<string, Promise<Raster>>();

/** One raster, decoded once. `overview` takes the 4x coarser copy when the catalog has one (MOLA). */
export function loadRaster(meta: RasterMeta, overview = false): Promise<Raster> {
  const ov = overview && meta.overview ? meta.overview : null;
  const key = `${meta.id}${ov ? ":ov" : ""}`;
  let p = rasters.get(key);
  if (!p) {
    const [rows, cols] = ov ? ov.shape : meta.shape;
    const file = ov ? ov.file : meta.file;
    const src = file.includes("/") ? file : url(file);
    p = pixels(src, cols, rows)
      .then((rgba) => {
        const n = rows * cols;
        const [, , s, nn] = meta.bounds;
        const out: Raster = { meta, rows, cols, bounds: meta.bounds, pxM: ((nn - s) / rows / DEG) * MARS_R };
        if (meta.kind === "scalar") {
          const v = new Float32Array(n);
          const nd = meta.nodata ?? 65535, off = meta.offset ?? 0, sc = meta.scale ?? 1;
          for (let i = 0; i < n; i++) {
            const u = (rgba[i * 4] << 8) | rgba[i * 4 + 1];
            v[i] = u === nd ? NaN : u * sc + off;
          }
          out.values = v;
        } else {
          const g = new Uint8Array(n);
          for (let i = 0; i < n; i++) g[i] = meta.kind === "rgb" ? Math.round((rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3) : rgba[i * 4];
          out.grey = g;
          if (meta.kind === "rgb") out.rgba = rgba;
        }
        return out;
      })
      .catch((e) => {
        rasters.delete(key);
        throw e;
      });
    rasters.set(key, p);
  }
  return p;
}

/* ---------- sampling ---------- */

export const covers = (b: Bounds, lon: number, lat: number) => lon >= b[0] && lon < b[1] && lat > b[2] && lat <= b[3];

/** Nearest pixel at lon/lat: [row, col], or null outside the raster. */
export function pixelAt(r: Raster, lon: number, lat: number): [number, number] | null {
  const [w, e, s, n] = r.bounds;
  if (!covers(r.bounds, lon, lat)) return null;
  const row = Math.min(r.rows - 1, Math.floor(((n - lat) / (n - s)) * r.rows));
  const col = Math.min(r.cols - 1, Math.floor(((lon - w) / (e - w)) * r.cols));
  return [row, col];
}

/** The archive value (scalars) or grey level (images) at lon/lat; NaN for no data or outside. */
export function sample(r: Raster, lon: number, lat: number): number {
  const p = pixelAt(r, lon, lat);
  if (!p) return NaN;
  const i = p[0] * r.cols + p[1];
  if (r.values) return r.values[i];
  const g = r.grey![i];
  return g === 0 && r.meta.kind === "gray" ? NaN : g;
}

/** Elevation sources, finest first: 1 m HiRISE, 20 m CTX, 3.7 km MOLA. */
export const ELEVATION_IDS = ["site_dtm", "ctx_dtm", "mola"] as const;
export const ELEVATION_LABEL: Record<string, string> = { site_dtm: "1 m HiRISE DTM", ctx_dtm: "20 m CTX DTM", mola: "3.7 km MOLA" };

/** The finest elevation at a point among the loaded DEMs. */
export function bestElevation(dems: Raster[], lon: number, lat: number): { value: number; source: Raster } | null {
  for (const r of dems) {
    const v = sample(r, lon, lat);
    if (Number.isFinite(v)) return { value: v, source: r };
  }
  return null;
}

/** Great-circle distance in metres. */
export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const p1 = lat1 / DEG, p2 = lat2 / DEG, dp = p2 - p1, dl = (lon2 - lon1) / DEG;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * MARS_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type ProfileBand = "fine" | "ctx" | "mid" | "coarse";
export const BAND_LABEL: Record<ProfileBand, string> = { fine: "≤ 1 m HiRISE", ctx: "20 m CTX", mid: "100–200 m", coarse: "km-scale MOLA" };
const band = (pxM: number): ProfileBand => (pxM <= 2 ? "fine" : pxM <= 50 ? "ctx" : pxM <= 1000 ? "mid" : "coarse");

export type Profile = {
  d: Float64Array;
  z: Float64Array;
  band: ProfileBand[];
  length: number;
  min: number;
  max: number;
  gain: number;
  loss: number;
  /** steepest grade between samples, degrees */
  maxGrade: number;
};

/** Elevation along the line A-B from the finest DEM at each of n points (the GUI's Profile tool). */
export function profile(dems: Raster[], a: [number, number], b: [number, number], n = 600): Profile | null {
  const d = new Float64Array(n), z = new Float64Array(n), bands: ProfileBand[] = [];
  let prev: [number, number] | null = null, dist = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const lon = a[0] + (b[0] - a[0]) * t, lat = a[1] + (b[1] - a[1]) * t;
    if (prev) dist += haversine(prev[0], prev[1], lon, lat);
    prev = [lon, lat];
    d[i] = dist;
    const e = bestElevation(dems, lon, lat);
    z[i] = e ? e.value : NaN;
    bands.push(e ? band(e.source.pxM) : "coarse");
  }
  let min = Infinity, max = -Infinity, gain = 0, loss = 0, grade = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(z[i])) continue;
    min = Math.min(min, z[i]);
    max = Math.max(max, z[i]);
    if (i && Number.isFinite(z[i - 1])) {
      const dz = z[i] - z[i - 1];
      if (dz > 0) gain += dz;
      else loss -= dz;
      const dd = d[i] - d[i - 1];
      if (dd > 0) grade = Math.max(grade, Math.abs(dz / dd));
    }
  }
  if (min > max) return null;
  return { d, z, band: bands, length: dist, min, max, gain, loss, maxGrade: Math.atan(grade) * DEG };
}

/* ---------- region statistics and comparison ---------- */

export type Region = { w: number; e: number; s: number; n: number };

export type Stats = { n: number; min: number; p2: number; median: number; mean: number; p98: number; max: number; std: number };

const quantile = (sorted: Float64Array, q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

export function stats(v: ArrayLike<number>): Stats | null {
  const s = Float64Array.from(v).sort();
  if (!s.length) return null;
  let sum = 0;
  for (const x of s) sum += x;
  const mean = sum / s.length;
  let ss = 0;
  for (const x of s) ss += (x - mean) ** 2;
  return { n: s.length, min: s[0], p2: quantile(s, 0.02), median: quantile(s, 0.5), mean, p98: quantile(s, 0.98), max: s[s.length - 1], std: Math.sqrt(ss / s.length) };
}

const ranks = (v: Float64Array) => {
  const idx = Array.from(v.keys()).sort((i, j) => v[i] - v[j]);
  const r = new Float64Array(v.length);
  for (let k = 0; k < idx.length; ) {
    let m = k;
    while (m + 1 < idx.length && v[idx[m + 1]] === v[idx[k]]) m++;
    for (let t = k; t <= m; t++) r[idx[t]] = (k + m) / 2;
    k = m + 1;
  }
  return r;
};

const pearson = (x: Float64Array, y: Float64Array) => {
  const n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) (mx += x[i]), (my += y[i]);
  mx /= n;
  my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return { r: sxy / Math.sqrt(sxx * syy || 1), slope: sxy / (sxx || 1), intercept: my - (sxy / (sxx || 1)) * mx };
};

export type Comparison = {
  n: number;
  x: Stats;
  y: Stats;
  r: number;
  rho: number;
  fit: { slope: number; intercept: number };
  /** 64 x 64 log-density histogram, row 0 = highest y */
  bins: Float32Array;
  size: number;
  xRange: [number, number];
  yRange: [number, number];
};

/**
 * Two layers on a 256 x 256 lattice over the region and both footprints (the GUI's Compare tab):
 * clipped to their 0.5-99.5 percentiles, then a 64-bin density histogram, Pearson r, Spearman rho and a fit line.
 */
export function compare(a: Raster, b: Raster, region: Region, size = 64): Comparison | null {
  const w = Math.max(region.w, a.bounds[0], b.bounds[0]), e = Math.min(region.e, a.bounds[1], b.bounds[1]);
  const s = Math.max(region.s, a.bounds[2], b.bounds[2]), n = Math.min(region.n, a.bounds[3], b.bounds[3]);
  if (w >= e || s >= n) return null;
  const N = 256;
  const xs: number[] = [], ys: number[] = [];
  for (let r = 0; r < N; r++) {
    const lat = n - ((r + 0.5) / N) * (n - s);
    for (let c = 0; c < N; c++) {
      const lon = w + ((c + 0.5) / N) * (e - w);
      const va = sample(a, lon, lat), vb = sample(b, lon, lat);
      if (Number.isFinite(va) && Number.isFinite(vb)) xs.push(va), ys.push(vb);
    }
  }
  if (xs.length < 10) return null;
  const clip = (v: number[]) => {
    const srt = Float64Array.from(v).sort();
    return [quantile(srt, 0.005), quantile(srt, 0.995)] as [number, number];
  };
  const xr = clip(xs), yr = clip(ys);
  const keep: number[] = [];
  for (let i = 0; i < xs.length; i++) if (xs[i] >= xr[0] && xs[i] <= xr[1] && ys[i] >= yr[0] && ys[i] <= yr[1]) keep.push(i);
  const X = Float64Array.from(keep, (i) => xs[i]), Y = Float64Array.from(keep, (i) => ys[i]);
  const bins = new Float32Array(size * size);
  const sx = (xr[1] - xr[0]) || 1, sy = (yr[1] - yr[0]) || 1;
  for (let i = 0; i < X.length; i++) {
    const c = Math.min(size - 1, Math.floor(((X[i] - xr[0]) / sx) * size));
    const r = size - 1 - Math.min(size - 1, Math.floor(((Y[i] - yr[0]) / sy) * size));
    bins[r * size + c]++;
  }
  for (let i = 0; i < bins.length; i++) bins[i] = Math.log1p(bins[i]);
  const p = pearson(X, Y);
  return {
    n: X.length, x: stats(X)!, y: stats(Y)!, r: p.r, rho: pearson(ranks(X), ranks(Y)).r,
    fit: { slope: p.slope, intercept: p.intercept }, bins, size, xRange: xr, yRange: yr,
  };
}

/** Values of one raster inside a region (for a single-layer region summary). */
export function regionValues(r: Raster, region: Region, N = 256): number[] {
  const w = Math.max(region.w, r.bounds[0]), e = Math.min(region.e, r.bounds[1]);
  const s = Math.max(region.s, r.bounds[2]), n = Math.min(region.n, r.bounds[3]);
  const out: number[] = [];
  if (w >= e || s >= n) return out;
  for (let i = 0; i < N; i++) {
    const lat = n - ((i + 0.5) / N) * (n - s);
    for (let j = 0; j < N; j++) {
      const v = sample(r, w + ((j + 0.5) / N) * (e - w), lat);
      if (Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/* ---------- colouring ---------- */

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
function cssToken(name: string, fallback: string): string {
  const v = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

/** Colour stops per ramp: the app's data tokens where one fits, the GUI's maps otherwise. */
export function rampStops(ramp: string | null): string[] {
  switch (ramp) {
    case "mineral":
      return [cssToken("--data-mineral-low", "#1a0b2e"), cssToken("--data-mineral-high", "#ff00e5")];
    case "thermal":
      return [cssToken("--data-thermal-low", "#00f0f0"), cssToken("--data-thermal-mid", "#ffffff"), cssToken("--data-thermal-high", "#ff2a1f")];
    case "terrain":
      return ["#1b2a6b", "#2f6fb0", "#4fb3a9", "#9bd17a", "#e9d98b", "#c98c4f", "#8a4b2f", "#f2ece4"];
    case "viridis":
      return ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];
    default:
      return ["#000000", "#ffffff"];
  }
}

export const rampGradient = (ramp: string | null) => `linear-gradient(to right, ${rampStops(ramp).join(", ")})`;

function lut(ramp: string | null): Uint8Array {
  const stops = rampStops(ramp).map(hex);
  const out = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t)), f = t - k;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f);
  }
  return out;
}

const shades = new WeakMap<Raster, Uint8Array>();

/** Hillshade, sun at azimuth 315° and 45° up, with the GUI's relief exaggeration for the pixel size. */
export function hillshade(r: Raster): Uint8Array {
  let out = shades.get(r);
  if (out) return out;
  const v = r.values!, { rows, cols } = r;
  const [w, e, s, n] = r.bounds;
  const dlon = (e - w) / cols, dlat = (n - s) / rows;
  const zf = Math.min(30, Math.max(1, Math.sqrt(r.pxM / 20)));
  const az = 315 / DEG, alt = 45 / DEG;
  const lx = Math.cos(alt) * Math.sin(az), ly = Math.cos(alt) * Math.cos(az), lz = Math.sin(alt);
  const dy = (dlat / DEG) * MARS_R;
  out = new Uint8Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    const lat = n - (row + 0.5) * dlat;
    const dx = Math.max(1e-6, Math.cos(lat / DEG)) * (dlon / DEG) * MARS_R;
    const up = Math.max(0, row - 1), dn = Math.min(rows - 1, row + 1);
    for (let c = 0; c < cols; c++) {
      const i = row * cols + c;
      const l = v[row * cols + Math.max(0, c - 1)], rr = v[row * cols + Math.min(cols - 1, c + 1)];
      const u = v[up * cols + c], d = v[dn * cols + c];
      if (!Number.isFinite(l) || !Number.isFinite(rr) || !Number.isFinite(u) || !Number.isFinite(d)) {
        out[i] = 180;
        continue;
      }
      const gx = ((rr - l) / (2 * dx)) * zf;
      const gy = -((d - u) / (2 * dy)) * zf;
      const sh = (lz - gx * lx - gy * ly) / Math.sqrt(1 + gx * gx + gy * gy);
      out[i] = Math.round(Math.max(0, Math.min(1, sh)) * 255);
    }
  }
  shades.set(r, out);
  return out;
}

const painted = new WeakMap<Raster, Map<string, OffscreenCanvas>>();

/** The raster coloured with its ramp over [lo, hi] (and hillshaded when the layer asks for it), cached. */
export function colorize(r: Raster, range: [number, number] | null, shade: boolean): OffscreenCanvas {
  let byKey = painted.get(r);
  if (!byKey) painted.set(r, (byKey = new Map()));
  const key = `${range?.[0]}:${range?.[1]}:${shade}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const { rows, cols } = r;
  const img = new ImageData(cols, rows);
  const px = img.data;
  if (r.rgba) px.set(r.rgba);
  else if (r.grey) {
    for (let i = 0; i < rows * cols; i++) {
      const g = r.grey[i];
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g;
      px[i * 4 + 3] = g === 0 && r.meta.kind === "gray" ? 0 : 255;
    }
  } else {
    const v = r.values!, table = lut(r.meta.ramp);
    const [lo, hi] = range ?? [r.meta.p?.[1] ?? 0, r.meta.p?.[3] ?? 1];
    const span = hi - lo || 1;
    const sh = shade && r.meta.hillshade ? hillshade(r) : null;
    for (let i = 0; i < rows * cols; i++) {
      const x = v[i];
      if (!Number.isFinite(x)) continue;
      const k = Math.round(Math.max(0, Math.min(1, (x - lo) / span)) * 255) * 3;
      const m = sh ? 0.4 + (0.6 * sh[i]) / 255 : 1;
      px[i * 4] = table[k] * m;
      px[i * 4 + 1] = table[k + 1] * m;
      px[i * 4 + 2] = table[k + 2] * m;
      px[i * 4 + 3] = 255;
    }
  }
  const cv = new OffscreenCanvas(cols, rows);
  cv.getContext("2d")!.putImageData(img, 0, 0);
  if (byKey.size > 3) byKey.delete(byKey.keys().next().value!); // a few ranges per layer, the oldest goes
  byKey.set(key, cv);
  return cv;
}

/** 2nd-98th percentile of the values inside a lon/lat window (for "stretch to the view"). */
export function viewRange(r: Raster, region: Region): [number, number] | null {
  const v = regionValues(r, region, 96);
  if (v.length < 4) return null;
  const s = Float64Array.from(v).sort();
  const lo = quantile(s, 0.02), hi = quantile(s, 0.98);
  return hi > lo ? [lo, hi] : null;
}

/* ---------- formatting ---------- */

export const fmtLat = (v: number, d = 4) => `${Math.abs(v).toFixed(d)}° ${v >= 0 ? "N" : "S"}`;
export const fmtLon = (v: number, d = 4) => `${Math.abs(v).toFixed(d)}° ${v >= 0 ? "E" : "W"}`;
export const fmtValue = (v: number) =>
  !Number.isFinite(v) ? "no data" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4);
export const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 100000 ? 0 : 2)} km` : `${m.toFixed(0)} m`);

/** Parse "lat, lon" (degrees, optional N/S/E/W). */
export function parseLatLon(text: string): [number, number] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const read = (s: string, neg: string) => {
    const m = /^(-?\d+(?:\.\d+)?)°?([NSEW])?$/i.exec(s);
    if (!m) return NaN;
    const v = parseFloat(m[1]);
    return m[2] && m[2].toUpperCase() === neg ? -v : v;
  };
  const lat = read(parts[0], "S"), lon = read(parts[1], "W");
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}
