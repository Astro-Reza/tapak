#!/usr/bin/env node
/**
 * Copies the orbital map layers from a marswalk-dataset checkout into public/data/layers.
 *
 *   node scripts/import-dataset.mjs <path to marswalk-dataset>
 *
 * Reads data/processed/layers.json + layers.bin (float32 LE, [layers, rows, cols], NaN = no data)
 * and keeps only the layers the app does not compute itself: the CRISM band depths and THEMIS
 * thermal inertia. Slope, sky view and dose come from the app's own grid.bin and engine.
 * Source: https://github.com/Astro-Reza/marswalk-dataset
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KEEP = ["minerals", "thermal", "phyllosilicate", "carbonate", "olivine"];

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/import-dataset.mjs <path to marswalk-dataset>");
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const meta = JSON.parse(readFileSync(join(src, "data/processed/layers.json"), "utf8"));
const app = JSON.parse(readFileSync(join(root, "public/data/app/app.json"), "utf8"));
const bin = readFileSync(join(src, "data/processed", meta.file));
const raw = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);

const g = meta.grid;
for (const k of ["rows", "cols", "x0", "z0"]) {
  if (Math.abs(g[k] - app.grid[k]) > 1e-6) throw new Error(`grid ${k}: dataset ${g[k]} != app ${app.grid[k]}`);
}
const n = g.rows * g.cols;
if (raw.length !== meta.shape[0] * n) throw new Error(`layers.bin has ${raw.length} values, expected ${meta.shape[0] * n}`);

const out = new Float32Array(KEEP.length * n);
const layers = KEEP.map((id, k) => {
  const i = meta.layers.findIndex((l) => l.id === id);
  if (i < 0) throw new Error(`layer ${id} not in layers.json`);
  out.set(raw.subarray(i * n, (i + 1) * n), k * n);
  const l = meta.layers[i];
  return {
    id,
    name: l.name,
    unit: l.unit,
    ramp: l.ramp_id,
    range: l.display_range,
    min: l.min,
    max: l.max,
    coverage: l.coverage,
    nativeM: l.native_resolution_m,
    source: l.source,
  };
});

const dest = join(root, "public/data/layers");
mkdirSync(dest, { recursive: true });
writeFileSync(join(dest, "layers.bin"), Buffer.from(out.buffer));
writeFileSync(
  join(dest, "layers.json"),
  JSON.stringify(
    {
      source: "https://github.com/Astro-Reza/marswalk-dataset (data/processed)",
      format: "float32 little-endian, [layers, rows, cols], row 0 = north; NaN = no data",
      grid: { rows: g.rows, cols: g.cols, cell: g.cell_m, x0: g.x0, z0: g.z0 },
      layers,
      credits: meta.credits ?? [],
    },
    null,
    1,
  ) + "\n",
);
console.log(`wrote ${layers.length} layers (${(out.byteLength / 1e6).toFixed(1)} MB) to public/data/layers`);
