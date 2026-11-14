// A* over the DTM grid. Default cost = oxygen used (telemetry model); pass `edge(i, j, run)` (models/cost.js)
// to search on another cost. Cells steeper than the suit limit are blocked either way.
import { o2ForLeg, minO2PerM, SUIT } from './telemetry.js';

// grid: {rows, cols, cell:[cx,cz], x0, z0, elev:Float32Array, slope:Float32Array}
export const toCell = (g, x, z) => [
  Math.min(g.rows - 1, Math.max(0, Math.round((z - g.z0) / g.cell[1]))),
  Math.min(g.cols - 1, Math.max(0, Math.round((x - g.x0) / g.cell[0]))),
];
export const cellXZ = (g, r, c) => [g.x0 + c * g.cell[0], g.z0 + r * g.cell[1]];

export const NB = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

// Binary min-heap on (priority, node).
export class Heap {
  constructor() { this.p = []; this.n = []; }
  get size() { return this.n.length; }
  push(pr, node) {
    const p = this.p, n = this.n; let i = n.length; p.push(pr); n.push(node);
    while (i > 0) { const j = (i - 1) >> 1; if (p[j] <= p[i]) break; [p[i], p[j]] = [p[j], p[i]]; [n[i], n[j]] = [n[j], n[i]]; i = j; }
  }
  pop() {
    const p = this.p, n = this.n, top = n[0], lp = p.pop(), ln = n.pop();
    if (n.length) {
      p[0] = lp; n[0] = ln; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < n.length && p[l] < p[m]) m = l; if (r < n.length && p[r] < p[m]) m = r;
        if (m === i) break; [p[i], p[m]] = [p[m], p[i]]; [n[i], n[m]] = [n[m], n[i]]; i = m;
      }
    }
    return top;
  }
}

// Returns [{x,z,y,slope}] from a to b (world metres), or null when no safe path exists.
export function findPath(g, a, b, s = SUIT, edge = null) {
  const [ar, ac] = toCell(g, a[0], a[1]), [br, bc] = toCell(g, b[0], b[1]);
  const N = g.rows * g.cols, start = ar * g.cols + ac, goal = br * g.cols + bc;
  const cost = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  // custom costs have no proven lower bound per metre, so they search with h = 0 (Dijkstra)
  const h = edge ? () => 0 : (i) => { const r = (i / g.cols) | 0, c = i % g.cols;
    return Math.hypot((c - bc) * g.cell[0], (r - br) * g.cell[1]) * minO2PerM(s); };
  const heap = new Heap(); cost[start] = 0; heap.push(h(start), start);
  while (heap.size) {
    const i = heap.pop();
    if (i === goal) break;
    if (done[i]) continue; done[i] = 1;
    const r = (i / g.cols) | 0, c = i % g.cols;
    for (const [dr, dc] of NB) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= g.rows || nc >= g.cols) continue;
      const j = nr * g.cols + nc;
      // the start/goal cells are where the rover parked, so they're always allowed
      if (done[j] || (g.slope[j] > s.maxSlopeDeg && j !== goal)) continue;
      const run = Math.hypot(dc * g.cell[0], dr * g.cell[1]);
      const nc2 = cost[i] + (edge ? edge(i, j, run)
        : o2ForLeg(run, (g.elev[j] - g.elev[i]) / run, Math.max(g.slope[i], g.slope[j]), s));
      if (nc2 < cost[j]) { cost[j] = nc2; from[j] = i; heap.push(nc2 + h(j), j); }
    }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const path = [];
  for (let i = goal; i >= 0; i = from[i]) {
    const r = (i / g.cols) | 0, c = i % g.cols, [x, z] = cellXZ(g, r, c);
    path.push({ x, z, y: g.elev[i], slope: g.slope[i], sky: g.sky ? g.sky[i] : 1, cell: i });
    if (i === start) break;
  }
  return path.reverse();
}

// Loop through stops in order and back to the first; returns {path, legs:[{from,to,startIdx}]} or {error}.
export function planLoop(g, stops, s = SUIT, edge = null) {
  const path = [], legs = [];
  for (let k = 0; k < stops.length; k++) {
    const a = stops[k], b = stops[(k + 1) % stops.length];
    const p = findPath(g, a.xz, b.xz, s, edge);
    if (!p) return { error: `No route under ${s.maxSlopeDeg}° from ${a.id} to ${b.id}` };
    if (k > 0) p[0].dwell = s.dwellMin;   // science stop on arrival (stop 0 is the trailhead)
    legs.push({ from: a.id, to: b.id, startIdx: path.length ? path.length - 1 : 0 });
    if (path.length) path[path.length - 1].dwell = p[0].dwell;
    path.push(...(path.length ? p.slice(1) : p));
  }
  return { path, legs };
}
