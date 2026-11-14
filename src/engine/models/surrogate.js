// Optional learned cost grids (from the separate marswalk-model repo; never trained or run here). No rendering code.
// File: data/app/cost_surrogate.json =
//   { "version": 1, "rows": R, "cols": C, "cot": [R*C numbers], "pFall": [R*C numbers], "source": "..." }
// cot   = cost of transport per cell, RELATIVE (simulated energy, any unit; only ratios are used)
// pFall = fall probability per step, 0..1
// Row 0 is north, same 4 m grid as data/app/grid.bin. Cells may be null where the model has no value;
// those take the median (a neutral value) so they neither attract nor repel the route.
// The file is untrusted input: anything malformed is rejected and the app falls back to the analytic model.

export function loadSurrogate(json, grid) {
  if (!json || json.version !== 1) throw new Error('surrogate: unknown version');
  if (json.rows !== grid.rows || json.cols !== grid.cols) throw new Error(`surrogate: grid ${json.rows}x${json.cols}, expected ${grid.rows}x${grid.cols}`);
  const n = grid.rows * grid.cols;
  const arr = (name, lo, hi) => {
    const a = json[name];
    if (!Array.isArray(a) || a.length !== n) throw new Error(`surrogate: ${name} must have ${n} values`);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = a[i];
      if (v === null) { out[i] = NaN; continue; }
      if (typeof v !== 'number' || !(v >= lo && v <= hi)) throw new Error(`surrogate: ${name}[${i}] out of range`);
      out[i] = v;
    }
    return out;
  };
  const cot = arr('cot', 0, 1e6), pFall = arr('pFall', 0, 1);
  const median = (a) => { const v = Array.from(a).filter(Number.isFinite).sort((x, y) => x - y);
    if (!v.length) throw new Error('surrogate: no valid values'); return v[v.length >> 1]; };
  const cMed = median(cot) || 1, pMed = median(pFall);
  // relative energy: scale so the median cell is 1; empty cells take the median
  for (let i = 0; i < n; i++) { cot[i] = Number.isFinite(cot[i]) ? cot[i] / cMed : 1; if (!Number.isFinite(pFall[i])) pFall[i] = pMed; }
  return { cot, pFall, source: String(json.source ?? 'unknown').slice(0, 120) };
}
