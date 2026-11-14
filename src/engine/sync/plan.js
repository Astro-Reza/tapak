// Plan hand-off between mission control (master) and the astronaut device.
// A plan travels as a small recipe; the astronaut rebuilds the route from the same terrain data and checks
// the result against the summary. Recipes from a URL or another tab are untrusted: every field is validated.
import { MODEL_NAMES } from '../models/energy.js';

export const PLAN_VERSION = 1;
const MODES = ['efficient', 'balanced', 'safest', 'slider'];

export function validatePlan(p) {
  const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (!p || typeof p !== 'object' || p.v !== PLAN_VERSION) throw new Error('unknown plan version');
  if (!MODES.includes(p.mode)) throw new Error('bad mode');
  if (!num(p.sliderT, 0, 1) || !Object.hasOwn(MODEL_NAMES, p.modelKey) || !Number.isInteger(p.startLmst)
    || !num(p.startLmst, 0, 23) || !num(p.kSuit, 0.5, 2) || !num(p.o2CapacityL, 50, 2000)) throw new Error('bad plan field');
  if (p.summary && !(num(p.summary.km, 0, 100) && num(p.summary.o2L, 0, 5000))) throw new Error('bad summary');
  return { v: p.v, mode: p.mode, sliderT: p.sliderT, modelKey: p.modelKey, startLmst: p.startLmst, kSuit: p.kSuit,
    o2CapacityL: p.o2CapacityL, summary: p.summary ? { km: p.summary.km, o2L: p.summary.o2L } : null };
}

// URL-safe base64 of the JSON recipe, for ?plan=... on a real second device.
export function encodePlan(p) {
  const bytes = new TextEncoder().encode(JSON.stringify(validatePlan(p)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodePlan(s) {
  if (typeof s !== 'string' || s.length > 2000) throw new Error('plan text too long');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return validatePlan(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))));
}

// Same route on both devices? Allow rounding in the summary.
export const summaryMatches = (a, b) => !!a && !!b && Math.abs(a.km - b.km) < 0.01 && Math.abs(a.o2L - b.o2L) < 0.5;
