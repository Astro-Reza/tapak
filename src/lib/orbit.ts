/**
 * Small orbit geometry for the Comms globe. Mars-fixed frame, +Y through the
 * north pole, one unit = one Mars radius. Circular orbits only: enough to draw
 * the relay planes and read an elevation, not a propagator.
 */

export const MARS_RADIUS_KM = 3389.5;

export type Vec3 = readonly [number, number, number];

export type RelayOrbit = {
  id: string;
  name: string;
  altitudeKm: number;
  inclinationDeg: number;
  /** Longitude of the ascending node in the Mars-fixed frame at the snapshot time. */
  raanDeg: number;
  /** Argument of latitude: angle along the orbit from the ascending node. */
  argLatDeg: number;
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Point at a latitude and east longitude. Matches the UV layout of a three.js
 * sphere carrying an equirectangular texture centered on longitude 0.
 */
export function latLonToVec(latDeg: number, lonDeg: number, radius = 1): Vec3 {
  const phi = rad(90 - latDeg);
  const theta = rad(lonDeg + 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

export const orbitRadius = (altitudeKm: number) => (MARS_RADIUS_KM + altitudeKm) / MARS_RADIUS_KM;

/** Position on a circular orbit at `argLatDeg` (defaults to the relay's own). */
export function orbitPoint(
  orbit: Pick<RelayOrbit, "altitudeKm" | "inclinationDeg" | "raanDeg" | "argLatDeg">,
  argLatDeg = orbit.argLatDeg,
): Vec3 {
  const node = latLonToVec(0, orbit.raanDeg);
  const east = latLonToVec(0, orbit.raanDeg + 90);
  const ci = Math.cos(rad(orbit.inclinationDeg));
  const si = Math.sin(rad(orbit.inclinationDeg));
  const a = orbitRadius(orbit.altitudeKm);
  const cu = a * Math.cos(rad(argLatDeg));
  const su = a * Math.sin(rad(argLatDeg));
  return [node[0] * cu + east[0] * ci * su, node[1] * cu + si * su, node[2] * cu + east[2] * ci * su];
}

/** Elevation of a point above the local horizon of a surface site, in degrees. */
export function elevationDeg(site: { latDeg: number; lonDeg: number }, point: Vec3): number {
  const up = latLonToVec(site.latDeg, site.lonDeg);
  const v = [point[0] - up[0], point[1] - up[1], point[2] - up[2]];
  const length = Math.hypot(v[0], v[1], v[2]);
  return (Math.asin((v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / length) * 180) / Math.PI;
}

/* =========================================================================
   Authoritative Physical Constants & Reference Configurations
   ========================================================================= */

export const MARS_MU_KM3_S2 = 42828.37;
export const SOL_S = 88775.244;
export const SIDEREAL_DAY_S = 88642.663;

export type CommsSite = {
  name: string;
  latDeg: number;
  lonDeg: number;
  elevationM: number;
};

export const DEFAULT_SITE: CommsSite = {
  name: "Jezero West",
  latDeg: 18.43,
  lonDeg: 77.42,
  elevationM: -2410.0,
};

export const DEFAULT_RELAYS: RelayOrbit[] = [
  { id: "l1", name: "MRS-L1", altitudeKm: 400, inclinationDeg: 75, raanDeg: 70, argLatDeg: 9 },
  { id: "l2", name: "MRS-L2", altitudeKm: 400, inclinationDeg: 52, raanDeg: 190, argLatDeg: 300 },
  { id: "l3", name: "MRS-L3", altitudeKm: 400, inclinationDeg: 52, raanDeg: 310, argLatDeg: 70 },
  { id: "l4", name: "MRS-L4", altitudeKm: 400, inclinationDeg: 75, raanDeg: 70, argLatDeg: 189 },
];

export type LinkConfig = {
  title: string;
  tx: "relay" | "suit";
  ptDbw: number;
  gtDbi: number;
  grDbi: number;
  dustDb: number;
  pointingDb: number;
  thresholdDbw: number;
};

export const DOWNLINK_CONFIG: LinkConfig = {
  title: "Receive · relay → suit",
  tx: "relay",
  ptDbw: 10.0,
  gtDbi: 4.0,
  grDbi: 2.0,
  dustDb: 0.3,
  pointingDb: 1.0,
  thresholdDbw: -131.0,
};

export const UPLINK_CONFIG: LinkConfig = {
  title: "Transmit · suit → relay",
  tx: "suit",
  ptDbw: 6.0,
  gtDbi: 2.0,
  grDbi: 4.0,
  dustDb: 0.3,
  pointingDb: 1.0,
  thresholdDbw: -133.0,
};

/* =========================================================================
   Orbital Propagation & Geometric Functions
   ========================================================================= */

/** Orbital period around Mars for a circular orbit at altitude h (Kepler's 3rd Law). */
export function orbitalPeriodS(altitudeKm: number): number {
  const a = MARS_RADIUS_KM + altitudeKm;
  return 2.0 * Math.PI * Math.sqrt(Math.pow(a, 3) / MARS_MU_KM3_S2);
}

/** Propagates circular orbit in Mars-fixed frame advancing argument of latitude and regressing node. */
export function propagateRelayPosition(relay: RelayOrbit, timeS: number): Vec3 {
  const raan = relay.raanDeg - (360.0 * timeS) / SIDEREAL_DAY_S;
  const T = orbitalPeriodS(relay.altitudeKm);
  const u = relay.argLatDeg + (360.0 * timeS) / T;
  return orbitPoint({
    altitudeKm: relay.altitudeKm,
    inclinationDeg: relay.inclinationDeg,
    raanDeg: raan,
    argLatDeg: u,
  });
}

/** Calculates spherical slant range in kilometers from topocentric elevation and orbital altitude. */
export function slantRangeKm(elevationDegVal: number, altitudeKm: number): number {
  const eRad = (elevationDegVal * Math.PI) / 180.0;
  const R = MARS_RADIUS_KM;
  const a = R + altitudeKm;
  return Math.sqrt(a * a - Math.pow(R * Math.cos(eRad), 2)) - R * Math.sin(eRad);
}

/** Topocentric azimuth in degrees [0, 360) from site to 3D position vector in Mars-fixed frame. */
export function azimuthDeg(site: { latDeg: number; lonDeg: number }, point: Vec3): number {
  const up = latLonToVec(site.latDeg, site.lonDeg);
  const phi = rad(90.0 - site.latDeg);
  const theta = rad(site.lonDeg + 180.0);
  const north: Vec3 = [Math.cos(phi) * Math.cos(theta), Math.sin(phi), -Math.cos(phi) * Math.sin(theta)];
  const east: Vec3 = [
    north[1] * up[2] - north[2] * up[1],
    north[2] * up[0] - north[0] * up[2],
    north[0] * up[1] - north[1] * up[0],
  ];
  const v = [point[0] - up[0], point[1] - up[1], point[2] - up[2]];
  const vN = v[0] * north[0] + v[1] * north[1] + v[2] * north[2];
  const vE = v[0] * east[0] + v[1] * east[1] + v[2] * east[2];
  let az = (Math.atan2(vE, vN) * 180.0) / Math.PI;
  if (az < 0) az += 360.0;
  return az;
}

/* =========================================================================
   Link Budget Calculation & Atmospheric Attenuation Functions
   ========================================================================= */

/** Free Space Path Loss (ITU-R P.525). */
export function fsplDb(distanceKm: number, frequencyMhz: number): number {
  if (distanceKm <= 0 || frequencyMhz <= 0) return 0.0;
  return 20.0 * Math.log10(distanceKm) + 20.0 * Math.log10(frequencyMhz) + 32.44;
}

/**
 * Elevation-dependent atmospheric attenuation (ITU-R P.676 cosecant model).
 * Enforces minimum elevation floor of 0.5 degrees to prevent division by zero at horizon.
 */
export function atmosphericLossDb(elevationDegVal: number, zenithLossDb = 0.3, floorDeg = 0.5): number {
  const effectiveEl = Math.max(elevationDegVal, floorDeg);
  const elRad = (effectiveEl * Math.PI) / 180.0;
  return zenithLossDb / Math.sin(elRad);
}

/** Computes received power incorporating subtractive atmospheric attenuation. */
export function receivedPowerDbw(side: LinkConfig, fsplVal: number, atmosLossVal: number): number {
  return (
    side.ptDbw +
    side.gtDbi -
    fsplVal -
    atmosLossVal -
    side.dustDb -
    side.pointingDb +
    side.grDbi
  );
}

/** Full link margin calculation at a given elevation and altitude. */
export function calculateLinkMarginDb(
  side: LinkConfig,
  elevationDegVal: number,
  altitudeKm = 400.0,
  frequencyMhz = 401.6,
  zenithLossDb = 0.3,
): number {
  const d = slantRangeKm(elevationDegVal, altitudeKm);
  const fspl = fsplDb(d, frequencyMhz);
  const atmos = atmosphericLossDb(elevationDegVal, zenithLossDb);
  const pr = receivedPowerDbw(side, fspl, atmos);
  return pr - side.thresholdDbw;
}

/**
 * Delta in link margin produced by atmospheric loss.
 * Delta = Margin(with atmos) - Margin(without atmos) = -A_atm < 0.
 */
export function deltaAtmosphericMarginDb(elevationDegVal: number, zenithLossDb = 0.3): number {
  return -atmosphericLossDb(elevationDegVal, zenithLossDb);
}

/** Bisection solver finding the minimum usable elevation theta_min where Margin == 0 dB. */
export function solveThetaMinDeg(
  side: LinkConfig,
  altitudeKm = 400.0,
  frequencyMhz = 401.6,
  zenithLossDb = 0.3,
): number {
  if (calculateLinkMarginDb(side, 0.0, altitudeKm, frequencyMhz, zenithLossDb) >= 0) {
    return 0.0;
  }
  if (calculateLinkMarginDb(side, 90.0, altitudeKm, frequencyMhz, zenithLossDb) < 0) {
    return 90.0;
  }
  let lo = 0.0;
  let hi = 90.0;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (calculateLinkMarginDb(side, mid, altitudeKm, frequencyMhz, zenithLossDb) >= 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

/** Lanczos log-gamma approximation for regularized incomplete gamma evaluation. */
function logGamma(z: number): number {
  const c = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.001208650973866179,
    -0.000005395239384953,
  ];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Lower regularized incomplete gamma P(a, x) per Numerical Recipes 6.2. */
export function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0.0;
  const logPre = -x + a * Math.log(x) - logGamma(a);
  if (x < a + 1.0) {
    let term = 1.0 / a;
    let total = term;
    let ap = a;
    for (let i = 0; i < 500; i++) {
      ap += 1.0;
      term *= x / ap;
      total += term;
      if (Math.abs(term) < Math.abs(total) * 1e-14) break;
    }
    return total * Math.exp(logPre);
  }
  const tiny = 1e-300;
  let b = x + 1.0 - a;
  let c = 1.0 / tiny;
  let d = 1.0 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2.0;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1.0 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1.0) < 1e-14) break;
  }
  return 1.0 - Math.exp(logPre) * h;
}

export type GammaFitResult = {
  k: number;
  scale: number;
  mean: number;
  cdf: (x: number) => number;
};

/** Method of moments Gamma distribution fit for contact peak elevations. */
export function fitGammaDistribution(samples: number[]): GammaFitResult {
  if (!samples || samples.length === 0) {
    return { k: 2.4, scale: 14.8, mean: 33.4, cdf: (x: number) => regularizedGammaP(2.4, x / 14.8) };
  }
  const n = samples.length;
  const mean = samples.reduce((acc, v) => acc + v, 0) / n;
  const variance = samples.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
  if (variance <= 1e-6) {
    return { k: 2.4, scale: 14.8, mean, cdf: (x: number) => regularizedGammaP(2.4, x / 14.8) };
  }
  const k = (mean * mean) / variance;
  const scale = variance / mean;
  return {
    k,
    scale,
    mean,
    cdf: (x: number) => regularizedGammaP(k, x / scale),
  };
}

/* =========================================================================
   Pass Simulation & Constellation Propagation
   ========================================================================= */

export type PassTrackPoint = {
  timeS: number;
  az: number;
  el: number;
  uplinkMarginDb: number;
  atmosLossDb: number;
};

export type SimulatedPass = {
  relay: RelayOrbit;
  startS: number;
  endS: number;
  durationMin: number;
  maxElDeg: number;
  track: PassTrackPoint[];
};

/** Simulates orbital passes for a constellation over a time interval [t0, t1]. */
export function simulateConstellationPasses(
  site: { latDeg: number; lonDeg: number } = DEFAULT_SITE,
  relays: RelayOrbit[] = DEFAULT_RELAYS,
  t0 = 0.0,
  t1 = SOL_S,
  stepS = 20.0,
  maskDeg = 0.0,
): SimulatedPass[] {
  const passes: SimulatedPass[] = [];
  for (const relay of relays) {
    let inPass = false;
    let passStart = 0;
    let peakEl = -90.0;
    const track: PassTrackPoint[] = [];

    for (let t = t0; t <= t1; t += stepS) {
      const pos = propagateRelayPosition(relay, t);
      const el = elevationDeg(site, pos);
      if (el > maskDeg) {
        if (!inPass) {
          inPass = true;
          passStart = t;
          peakEl = el;
          track.length = 0;
        }
        if (el > peakEl) peakEl = el;
        const az = azimuthDeg(site, pos);
        const margin = calculateLinkMarginDb(UPLINK_CONFIG, el, relay.altitudeKm);
        const atmos = atmosphericLossDb(el);
        track.push({ timeS: t - passStart, az, el, uplinkMarginDb: margin, atmosLossDb: atmos });
      } else if (inPass) {
        inPass = false;
        passes.push({
          relay,
          startS: passStart,
          endS: t - stepS,
          durationMin: (t - stepS - passStart) / 60.0,
          maxElDeg: peakEl,
          track: [...track],
        });
      }
    }
    if (inPass) {
      passes.push({
        relay,
        startS: passStart,
        endS: t1,
        durationMin: (t1 - passStart) / 60.0,
        maxElDeg: peakEl,
        track: [...track],
      });
    }
  }
  return passes.sort((a, b) => a.startS - b.startS);
}

/* =========================================================================
   AR Telemetry Serializer & Candlestick Waterfall Stage Builder
   ========================================================================= */

export type McStatusOrbit = {
  t: number;
  lmst: string;
  orbit: {
    current: {
      relay: string;
      elevationDeg: number;
      azimuthDeg: number;
      uplinkMarginDb: number;
    };
    aosLmst: string;
    losLmst: string;
    maxElDeg: number;
    track: PassTrackPoint[];
  };
};

export function buildMcStatusOrbit(
  tEvaMin: number,
  lmstClock: string,
  pass: SimulatedPass,
): McStatusOrbit {
  const currentPt = pass.track[0] ?? { az: 0, el: 0, uplinkMarginDb: 0, atmosLossDb: 0, timeS: 0 };
  return {
    t: tEvaMin,
    lmst: lmstClock,
    orbit: {
      current: {
        relay: pass.relay.name,
        elevationDeg: currentPt.el,
        azimuthDeg: currentPt.az,
        uplinkMarginDb: currentPt.uplinkMarginDb,
      },
      aosLmst: lmstClock,
      losLmst: lmstClock,
      maxElDeg: pass.maxElDeg,
      track: pass.track,
    },
  };
}

export type WaterfallStage = {
  label: "Pt" | "Gt" | "FSPL" | "Atmos" | "Dust" | "Point" | "Gr";
  kind: "gain" | "loss";
  value: number;
};

export function buildWaterfallStages(
  side: LinkConfig,
  elevationDegVal: number,
  altitudeKm = 400.0,
  freqMhz = 401.6,
  zenithLossDb = 0.3,
): WaterfallStage[] {
  const d = slantRangeKm(elevationDegVal, altitudeKm);
  const fspl = fsplDb(d, freqMhz);
  const atmosLoss = atmosphericLossDb(elevationDegVal, zenithLossDb);
  return [
    { label: "Pt", kind: "gain", value: side.ptDbw },
    { label: "Gt", kind: "gain", value: side.gtDbi },
    { label: "FSPL", kind: "loss", value: -fspl },
    { label: "Atmos", kind: "loss", value: -atmosLoss },
    { label: "Dust", kind: "loss", value: -side.dustDb },
    { label: "Point", kind: "loss", value: -side.pointingDb },
    { label: "Gr", kind: "gain", value: side.grDbi },
  ];
}
