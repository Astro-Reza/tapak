import type { Grid, MissionData, Stop, WeatherHour } from "@/engine";

/** Data files served from public/data (copied from MARSWALK/data, see docs/SCIENCE_PROVENANCE.md). */
const url = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;
export const TERRAIN_GLB = url("terrain/terrain_draco.glb");
export const ORTHO = url("terrain/ortho.jpg");

export type TerrainMeta = {
  /** patch size in metres [x, z]; the ortho and the mesh cover it edge to edge, centred on 0 */
  size: [number, number];
  elevMin: number;
  elevMax: number;
  center: { lat: number; lon: number };
};

export type LoadedData = MissionData & {
  terrain: TerrainMeta;
  credits: string[];
  weather: { credit: string; sols: number[] };
};

async function get(path: string): Promise<Response> {
  const r = await fetch(url(path));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r;
}

/** Loads and checks the planning data. Throws with a readable reason; the UI shows it. */
export async function loadMissionData(): Promise<LoadedData> {
  const [app, wx, bin] = await Promise.all([
    get("app/app.json").then((r) => r.json()),
    get("meda_weather.json").then((r) => r.json()),
    get("app/grid.bin").then((r) => r.arrayBuffer()),
  ]);
  const g = app.grid;
  const n = g.rows * g.cols;
  const raw = new Float32Array(bin);
  if (raw.length !== 4 * n) throw new Error(`grid.bin has ${raw.length} values, expected ${4 * n}`);
  const grid: Grid = {
    rows: g.rows,
    cols: g.cols,
    cell: g.cell,
    x0: g.x0,
    z0: g.z0,
    elev: raw.subarray(0, n),
    slope: raw.subarray(n, 2 * n),
    sky: raw.subarray(2 * n, 3 * n),
    rough: raw.subarray(3 * n),
  };
  const stops: Stop[] = app.stops;
  if (!Array.isArray(stops) || stops.length < 2) throw new Error("app.json: need at least 2 stops");
  // MEDA was measured at the stops, so pressure is referenced to their median elevation (as in MARSWALK/app)
  const elevs = stops.map((s) => s.elev).sort((a, b) => a - b);
  return {
    grid,
    stops,
    hourly: wx.hourly as WeatherHour[],
    refElev: elevs[elevs.length >> 1],
    terrain: { size: app.terrain.size, elevMin: app.terrain.elev_min, elevMax: app.terrain.elev_max, center: app.terrain.center },
    credits: app.credits ?? [],
    weather: { credit: wx.credit, sols: wx.sols },
  };
}

/* ---------- orbital layers (marswalk-dataset, imported by scripts/import-dataset.mjs) ---------- */

export type OrbitalLayerMeta = {
  id: string;
  name: string;
  unit: string;
  /** colour ramp id: "minerals" or "thermal" */
  ramp: string;
  /** display range (2nd–98th percentile) */
  range: [number, number];
  min: number;
  max: number;
  /** share of grid cells with data */
  coverage: number;
  /** native resolution of the source product, metres per pixel */
  nativeM: number;
  source: string;
};

export type OrbitalLayers = {
  layers: (OrbitalLayerMeta & { values: Float32Array })[];
  credits: string[];
};

/* ---------- 1 m HiRISE slope and hillshade (scripts/import-hires.py) ---------- */

export type GridSpec = { rows: number; cols: number; cell: [number, number]; x0: number; z0: number };
export type Hires = GridSpec & {
  /** slope in `step` degrees per count, row 0 = north; 255 = no data */
  slope: Uint8Array;
  step: number;
  /** hillshade image (grey, sun from the north-west), same footprint */
  shadeUrl: string;
};

/** The grey channel of an 8-bit image, exactly as stored (no colour management). */
async function greyPixels(path: string, w: number, h: number): Promise<Uint8Array> {
  const bmp = await createImageBitmap(await (await get(path)).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  if (bmp.width !== w || bmp.height !== h) throw new Error(`${path}: ${bmp.width} x ${bmp.height}, expected ${w} x ${h}`);
  const ctx = new OffscreenCanvas(w, h).getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
  return out;
}

let hires: Promise<Hires> | null = null;

/** 1 m slope + hillshade of the planning patch. Loaded once, on first use; never blocks the mission gate. */
export function loadHires(): Promise<Hires> {
  hires ??= get("layers/hires.json")
    .then((r) => r.json())
    .then(async (m) => {
      const g = m.grid;
      return { ...g, slope: await greyPixels(`layers/${m.slope.file}`, g.cols, g.rows), step: m.slope.step, shadeUrl: url(`layers/${m.shade.file}`) };
    })
    .catch((e) => {
      hires = null;
      throw e;
    });
  return hires;
}

let orbital: Promise<OrbitalLayers> | null = null;

/** Orbital layers on the app's planning grid (NaN = no data). Loaded once, on first use; never blocks the mission gate. */
export function loadOrbitalLayers(): Promise<OrbitalLayers> {
  orbital ??= Promise.all([
    get("layers/layers.json").then((r) => r.json()),
    get("layers/layers.bin").then((r) => r.arrayBuffer()),
  ]).then(([meta, bin]) => {
    const n = meta.grid.rows * meta.grid.cols;
    const raw = new Float32Array(bin);
    if (raw.length !== meta.layers.length * n) throw new Error(`layers.bin has ${raw.length} values, expected ${meta.layers.length * n}`);
    return {
      layers: meta.layers.map((l: OrbitalLayerMeta, k: number) => ({ ...l, values: raw.subarray(k * n, (k + 1) * n) })),
      credits: Array.isArray(meta.credits) ? meta.credits : [String(meta.credits)],
    };
  }).catch((e) => {
    orbital = null; // allow a retry
    throw e;
  });
  return orbital;
}
