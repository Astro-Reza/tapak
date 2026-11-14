// Walking energy models behind one contract. No rendering code.
// segment = {dx_m, grade_pct, roughness, eta}; ctx = {bodyKg, loadKg, speedMs, gravityRatio, kSuit}
// energy(segment, ctx, model) -> {powerW, energyJ, timeS, model}
import { wattsFromVo2 } from './oxygen.js';

export const MARS_GRAVITY_RATIO = 3.71 / 9.81;

// Handoff baseline: ACSM walking VO2 with the work terms scaled by gravity x carried mass (assumed scaling).
function acsmScaled(seg, c) {
  const v = c.speedMs * 60, g = seg.grade_pct / 100;
  const mlKgMin = 3.5 + c.gravityRatio * (c.bodyKg + c.loadKg) / c.bodyKg * (0.1 * v + 1.8 * v * Math.max(g, 0));
  return wattsFromVo2(mlKgMin * c.bodyKg / 1000);
}

// Pandolf, Givoni & Goldman 1977 load carriage; gravity scales the grade term on UPHILL only.
// Downhill uses Earth values and subtracts the Santee et al. 2003 correction.
// ponytail: Santee valid grade range not yet checked against the paper; result is clamped to standing cost 1.5 W.
function pandolfSantee(seg, c) {
  const W = c.bodyKg, L = c.loadKg, V = c.speedMs, G = seg.grade_pct, eta = seg.eta ?? 1, WL = W + L;
  const gamma = G > 0 ? c.gravityRatio : 1;
  let M = 1.5 * W + 2.0 * WL * (L / W) ** 2 + eta * WL * (1.5 * V * V + 0.35 * V * G * gamma);
  if (G < 0) M -= eta * (G * WL * V / 3.5 - WL * (G + 6) ** 2 / W + (25 - V * V));
  return Math.max(M, 1.5 * W);
}

// Minetti et al. 2002 cost of walking per kg per metre (Earth); used as a cross-check on total mass.
export const MINETTI_RANGE = [-0.45, 0.45];
export const minettiCw = (i) => 280.5 * i ** 5 - 58.7 * i ** 4 - 76.8 * i ** 3 + 51.9 * i ** 2 + 19.6 * i + 2.5;
function minetti(seg, c) {
  // ponytail: grades outside the fitted range are clamped to its edge, not extrapolated
  const i = Math.min(MINETTI_RANGE[1], Math.max(MINETTI_RANGE[0], seg.grade_pct / 100));
  return minettiCw(i) * (c.bodyKg + c.loadKg) * c.speedMs;
}

export const MODELS = { acsmScaled, pandolfSantee, minetti };
export const MODEL_NAMES = { acsmScaled: 'Scaled ACSM', pandolfSantee: 'Pandolf + Santee', minetti: 'Minetti (cross-check)' };
export const DEFAULT_MODEL = 'acsmScaled'; // do not change without the team's say-so

export function energy(seg, ctx, model = DEFAULT_MODEL) {
  const f = MODELS[model];
  if (!f) throw new Error(`unknown energy model ${model}`);
  const powerW = f(seg, ctx) * (ctx.kSuit ?? 1);
  const timeS = seg.dx_m / ctx.speedMs;
  return { powerW, energyJ: powerW * timeS, timeS, model };
}
