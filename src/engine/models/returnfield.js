// Walk-back (point of no return). No rendering code.
// returnField: cheapest oxygen (L) to walk from every grid cell back to the start, by Dijkstra from the start
// over reversed moves, with the same O2 model and slope limit as the route.
import { legO2, SUIT } from '../telemetry.js';
import { toCell, Heap, NB } from '../route.js';

export function returnField(g, startXZ, s = SUIT, model = null) {
  const [sr, sc] = toCell(g, startXZ[0], startXZ[1]), start = sr * g.cols + sc;
  const cost = new Float64Array(g.rows * g.cols).fill(Infinity), heap = new Heap();
  cost[start] = 0; heap.push(0, start);
  while (heap.size) {
    const i = heap.pop(), r = (i / g.cols) | 0, c = i % g.cols;
    for (const [dr, dc] of NB) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= g.rows || nc >= g.cols) continue;
      const j = nr * g.cols + nc;
      if (g.slope[j] > s.maxSlopeDeg) continue;
      const run = Math.hypot(dc * g.cell[0], dr * g.cell[1]);
      // the walker moves j -> i on the way home, so the grade is taken in that direction
      const v = cost[i] + legO2(run, (g.elev[i] - g.elev[j]) / run, Math.max(g.slope[i], g.slope[j]), s, model);
      if (v < cost[j]) { cost[j] = v; heap.push(v, j); }
    }
  }
  return { cost, start };
}

export const reserveL = (s = SUIT) => s.reserveFrac * s.o2CapacityL;

// A route is feasible only if at every profile sample: O2 left - return cost >= reserve.
export function walkBackCheck(prof, field, s = SUIT) {
  let minMargin = Infinity, worst = -1;
  for (let k = 0; k < prof.length; k++) {
    const m = (s.o2CapacityL - prof[k].o2) - field.cost[prof[k].cell] - reserveL(s);
    if (m < minMargin) { minMargin = m; worst = k; }
  }
  return { ok: minMargin >= 0, minMarginL: minMargin, worstIdx: worst };
}

// Point-of-no-return ring for `o2LeftL` in hand: cells you can still walk home from with the reserve intact,
// that border cells you can't. Empty when the ring lies beyond the map.
export function ringCells(g, field, o2LeftL, s = SUIT) {
  const budget = o2LeftL - reserveL(s), out = [];
  for (let r = 1; r < g.rows - 1; r++) for (let c = 1; c < g.cols - 1; c++) {
    const i = r * g.cols + c;
    if (!(field.cost[i] <= budget)) continue;
    // a neighbour that is reachable but too far; blocked (steep) neighbours are slope walls, not the O2 limit
    const far = (j) => field.cost[j] > budget && Number.isFinite(field.cost[j]);
    if (far(i - 1) || far(i + 1) || far(i - g.cols) || far(i + g.cols)) out.push(i);
  }
  return out;
}
