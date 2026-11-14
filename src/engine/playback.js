// Position and consumables at EVA minute T along a planned profile. No rendering code.
// Moved from MARSWALK/app main.js sampleAt() (same interpolation), made pure: no module state.
import { stationLpm, SUIT } from './telemetry.js';
import { toCell } from './route.js';
import { reserveL } from './models/returnfield.js';

export function sampleAt(prof, T, s = SUIT) {
  let k = 1;
  while (k < prof.length - 1 && prof[k].t < T) k++;
  const a = prof[k - 1], b = prof[k];
  const dwell = b.dwell || 0, dwellO2 = dwell * stationLpm(s);
  const arrive = b.t - dwell;
  const g = Math.min(1, Math.max(0, (T - a.t) / (b.t - a.t || 1)));
  const dose = a.dose + g * (b.dose - a.dose);
  if (T < arrive || dwell === 0) {
    const f = Math.min(1, Math.max(0, (T - a.t) / (arrive - a.t || 1)));
    return { k, dwelling: false, x: a.x + f * (b.x - a.x), z: a.z + f * (b.z - a.z), t: T, dose,
      y: a.y + f * (b.y - a.y), sky: (a.sky ?? 1) + f * ((b.sky ?? 1) - (a.sky ?? 1)),
      o2: a.o2 + f * (b.o2 - dwellO2 - a.o2), dist: a.dist + f * (b.dist - a.dist),
      slope: Math.max(a.slope, b.slope), rate: (b.o2 - dwellO2 - a.o2) / (arrive - a.t || 1) };
  }
  return { k, dwelling: true, dwellFrac: (T - arrive) / dwell, x: b.x, z: b.z, t: T, dose, y: b.y, sky: b.sky ?? 1,
    o2: b.o2 - dwellO2 + (T - arrive) * stationLpm(s), dist: b.dist, slope: b.slope, rate: stationLpm(s) };
}

// O2 litres spare above the walk-back reserve at position `now` (as the HUD's "walk-back" readout).
export function walkBackMargin(grid, field, now, s = SUIT) {
  const [r, c] = toCell(grid, now.x, now.z);
  return (s.o2CapacityL - now.o2) - field.cost[r * grid.cols + c] - reserveL(s);
}
