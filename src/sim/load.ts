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
