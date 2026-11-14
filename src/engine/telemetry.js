// Crew-safety telemetry. Pure functions, no rendering: used by the HUD, the router and the tests.
import { energy, MARS_GRAVITY_RATIO } from './models/energy.js';
import { oxygen } from './models/oxygen.js';

export const SUIT = {
  bodyKg: 80,            // astronaut
  suitKg: 50,            // suit + PLSS; carried weight scales the work term
  o2CapacityL: 378,      // primary O2 at STP (~0.54 kg), EMU-class PLSS
  walkSpeed: 50,         // m/min on flat ground, Mars suited walking
  maxSlopeDeg: 20,       // no-go above this
  cautionSlopeDeg: 15,   // slow down and warn above this
  reserveFactor: 1.5,    // keep 50% more O2 than the trip home needs
  reserveFrac: 0.15,     // walk-back rule: arrive home with at least 15% of the tank
  kSuit: 1,              // suit work multiplier; calibrated after an EVA in the debrief
  dwellMin: 45,          // science time at each stop
  stationVO2: 7,         // ml/kg/min, light suited work at a stop (2 METs)
  evaLimitMin: 360,      // planned EVA length
};

export const MARS_G = 3.71, EARTH_G = 9.81;

// Radiation: Perseverance has no dosimeter, so GCR dose is modelled from Curiosity/RAD at Gale.
// Guo et al. 2017 (JGR Planets 122, 329): average ~220 uGy/day at Gale; dose falls with surface pressure
// by -kappa = 0.28 - 2.9e-4 * Phi  [uGy/day/Pa] (Phi = solar modulation potential, MV).
// Quality factor <Q> = 3.05 (Hassler et al. 2014, Science 343) turns absorbed dose into dose equivalent.
export const RADIATION = {
  refUGyDay: 220, refPressurePa: 840, quality: 3.05, phiMV: 600,
  source: 'Model: MSL/RAD Gale average scaled to MEDA pressure (Guo+2017) × terrain sky view',
};
export const kappa = (phi) => Math.max(0, 0.28 - 2.9e-4 * phi);
// Dose-equivalent rate in mSv/day at surface pressure P (Pa) and sky-view fraction `sky` (1 = open ground).
export function doseRate(pressurePa, sky = 1, r = RADIATION) {
  return (r.refUGyDay + kappa(r.phiMV) * (r.refPressurePa - pressurePa)) * r.quality / 1000 * sky;
}

// Weather: hourly MEDA medians [{lmst_hour, air_K, ground_K, pressure_Pa: {median}}], interpolated in LMST.
export const MARS_HOUR_MIN = 61.65;          // 1 Mars hour in Earth minutes (sol = 24h 39m 35s)
export const SCALE_HEIGHT_M = 11100;
export function weatherAt(hourly, lmst) {
  const h = ((lmst % 24) + 24) % 24, i = Math.floor(h), f = h - i;
  const pick = (k) => {
    const a = hourly[i]?.[k]?.median, b = hourly[(i + 1) % 24]?.[k]?.median;
    return a == null ? b : b == null ? a : a + f * (b - a);
  };
  return { lmst: h, airK: pick('air_K'), groundK: pick('ground_K'), pressurePa: pick('pressure_Pa') };
}
// Environment at EVA minute t and elevation y. env = {hourly, startLmst, refElev} or null (Gale reference).
export function envAt(env, t, y) {
  if (!env) return { pressurePa: RADIATION.refPressurePa };
  const w = weatherAt(env.hourly, env.startLmst + t / MARS_HOUR_MIN);
  return { ...w, pressurePa: w.pressurePa * Math.exp(-(y - env.refElev) / SCALE_HEIGHT_M) };
}

// Work multiplier vs. an unsuited walker on Earth: lower gravity, extra carried mass.
export const loadFactor = (s = SUIT) => (MARS_G / EARTH_G) * (s.bodyKg + s.suitKg) / s.bodyKg;

// Speed slows on steep ground (simple linear taper to 50% at the slope limit).
export function speedAt(slopeDeg, s = SUIT) {
  const t = Math.min(Math.max(slopeDeg, 0) / s.maxSlopeDeg, 1);
  return s.walkSpeed * (1 - 0.5 * t);
}

// ACSM walking equation, VO2 in ml/kg/min, v in m/min, grade = rise/run (downhill gets no grade credit).
export function vo2(v, grade, s = SUIT) {
  return 3.5 + loadFactor(s) * (0.1 * v + 1.8 * v * Math.max(grade, 0));
}

// O2 litres per minute for the astronaut's body mass.
export const o2LPerMin = (v, grade, s = SUIT) => vo2(v, grade, s) * s.bodyKg / 1000;

// O2 litres to cover `dist` metres at `grade` on ground of `slopeDeg`.
export function o2ForLeg(dist, grade, slopeDeg, s = SUIT) {
  const v = speedAt(slopeDeg, s);
  return o2LPerMin(v, grade, s) * (dist / v);
}

// Cheapest possible O2 per metre (flat, full speed): admissible A* heuristic.
export const minO2PerM = (s = SUIT) => o2LPerMin(s.walkSpeed, 0, s) / s.walkSpeed;

// Walk a polyline of {x,z,y,slope,sky} points; returns cumulative samples for the HUD and the plan summary.
// O2 litres for one leg with the selected energy model (null = the handoff's scaled ACSM), times k_suit.
export function legO2(dist, grade, slopeDeg, s = SUIT, model = null) {
  if (!model) return o2ForLeg(dist, grade, slopeDeg, s) * (s.kSuit ?? 1);
  const e = energy({ dx_m: dist, grade_pct: 100 * grade, eta: 1 }, { bodyKg: s.bodyKg, loadKg: s.suitKg,
    speedMs: speedAt(slopeDeg, s) / 60, gravityRatio: MARS_GRAVITY_RATIO, kSuit: s.kSuit ?? 1 }, model);
  return oxygen(e.powerW, e.timeS).o2L;
}

export function profile(path, s = SUIT, env = null, model = null) {
  let t = 0, o2 = 0, dist = 0, dose = 0;
  const addDose = (dt, y, sky) => { dose += doseRate(envAt(env, t + dt / 2, y).pressurePa, sky ?? 1) * dt / 1440; };
  const dwell = (p) => { const m = p.dwell || 0; addDose(m, p.y, p.sky); t += m; o2 += m * stationLpm(s); };
  dwell(path[0]);
  const out = [{ i: 0, t, o2, dist, dose, ...path[0] }];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    if (run === 0) continue;
    const slope = Math.max(a.slope, b.slope);
    const v = speedAt(slope, s);
    addDose(run / v, (a.y + b.y) / 2, ((a.sky ?? 1) + (b.sky ?? 1)) / 2);
    t += run / v;
    o2 += legO2(run, (b.y - a.y) / run, slope, s, model);
    dist += run;
    dwell(b);
    out.push({ i, t, o2, dist, dose, ...b });
  }
  return out;
}

// Live status at `now` (a profile sample, or one interpolated between samples) of a looped EVA ending at `end`:
// what's left, what the trip home costs, how calm to be.
export function status(now, end, s = SUIT, env = null) {
  const left = s.o2CapacityL - now.o2;
  const homeO2 = end.o2 - now.o2;           // remaining route ends back at the start
  const need = homeO2 * s.reserveFactor;
  const homeMin = end.t - now.t;
  const level = left < homeO2 || s.evaLimitMin - now.t < homeMin ? 'return'
    : left < need || s.evaLimitMin - now.t < homeMin * s.reserveFactor ? 'caution' : 'nominal';
  return {
    minutes: now.t, distM: now.dist, evaLeftMin: s.evaLimitMin - now.t,
    o2LeftL: left, o2Pct: 100 * left / s.o2CapacityL,
    homeO2L: homeO2, homeMin, reserveRatio: homeO2 > 0 ? left / homeO2 : Infinity, level,
    doseMSv: now.dose,
    slope: now.slope,
    ...environment(now, env),
    slopeLevel: now.slope > s.maxSlopeDeg ? 'no-go' : now.slope > s.cautionSlopeDeg ? 'caution' : 'ok',
  };
}

// Weather + radiation readout at `now`, with calm advisories.
function environment(now, env) {
  const e = envAt(env, now.t, now.y ?? 0);
  const notes = [];
  if (e.groundK != null && e.groundK < 200) notes.push(`Ground ${Math.round(e.groundK - 273.15)} °C: limit glove contact with rock.`);
  if (e.lmst != null && (e.lmst < 7 || e.lmst > 17)) notes.push('Low sun: expect long shadows and falling temperatures.');
  return {
    lmst: e.lmst, airC: e.airK != null ? e.airK - 273.15 : null, groundC: e.groundK != null ? e.groundK - 273.15 : null,
    pressurePa: e.pressurePa, sky: now.sky ?? 1,
    doseRateUSvH: doseRate(e.pressurePa, now.sky ?? 1) * 1000 / 24, notes,
  };
}

// O2 rate while standing at a stop doing light work.
export const stationLpm = (s = SUIT) => s.stationVO2 * s.bodyKg / 1000;

export const MESSAGES = {
  nominal: 'Oxygen reserve nominal.',
  caution: 'Reserve below plan margin. Consider shortening the next stop.',
  return: 'Start your return now. Remaining oxygen or EVA time covers the walk home only.',
};
