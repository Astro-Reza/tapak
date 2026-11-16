/**
 * Comms payloads and their dummy values. These are the shapes the comms
 * backend is expected to return (see src/lib/comms-api.ts); until it exists,
 * the screens run on the dummy objects below. Nothing here is a measurement.
 */
import type { RelayOrbit } from "../lib/orbit.ts";
import type { HudPassData, HudPassPoint } from "../lib/hud-pass.ts";
import { BUDGETS, CONTACT_WINDOWS, LINK, PASSES, PASS_SUMMARY, type Budget, type RelayPass } from "./mission.ts";

export type Stat = { label: string; value: string; unit?: string };

export type CommsSite = {
  name: string;
  latDeg: number;
  lonDeg: number;
  /** Formatted position line for the site panel. */
  coordinate: string;
  /** Local mean solar time of the snapshot in hours; places the sun on the globe. */
  localSolarHour: number;
  stats: Stat[];
};

/** GET /comms/passes */
export type CommsPassesData = {
  site: CommsSite;
  /** Short description of the constellation for the screen heading. */
  constellation: string;
  /** Relay positions at the snapshot time. */
  relays: RelayOrbit[];
  passes: RelayPass[];
  summary: Stat[];
  contactWindows: {
    minutes: number;
    now: number;
    evaEnds: number;
    meta: string;
    passes: { label: string; start: number }[];
  };
  activePass?: HudPassData | null;
  activePassTrack?: HudPassPoint[];
};

/** GET /comms/link */
export type CommsLinkData = {
  link: {
    k: number;
    lambda: number;
    meanElevation: number;
    uplinkThetaMin: number;
    wedgeShade: (number | null)[];
    stats: Stat[];
  };
  /** Number of simulated passes behind the gamma fit. */
  passCount: number;
  /** Receive first, then transmit. */
  budgets: Budget[];
};

/**
 * Four relays at 400 km in three planes. The elements are made up so that the
 * snapshot agrees with the dummy pass list: MRS-L1 sits about 25° above the
 * site's horizon and the other three are below it.
 */
const DUMMY_RELAYS: RelayOrbit[] = [
  { id: "l1", name: "MRS-L1", altitudeKm: 400, inclinationDeg: 75, raanDeg: 70, argLatDeg: 9 },
  { id: "l2", name: "MRS-L2", altitudeKm: 400, inclinationDeg: 52, raanDeg: 190, argLatDeg: 300 },
  { id: "l3", name: "MRS-L3", altitudeKm: 400, inclinationDeg: 52, raanDeg: 310, argLatDeg: 70 },
  { id: "l4", name: "MRS-L4", altitudeKm: 400, inclinationDeg: 75, raanDeg: 70, argLatDeg: 189 },
];

export const DEFAULT_ACTIVE_PASS: HudPassData = {
  relayId: "l1",
  relayName: "MRS-L1",
  startS: -300,
  endS: 700,
  maxElevationDeg: 63.9,
  aos: "15:35",
  los: "15:44",
  syncedAt: 1731681600000,
  track: [
    { az: 198.2, el: 0.9, marginDb: -23.7, timeS: 0 },
    { az: 198.6, el: 2.2, marginDb: -12.4, timeS: 25 },
    { az: 199.0, el: 3.6, marginDb: -9.1, timeS: 50 },
    { az: 199.4, el: 5.1, marginDb: -7.3, timeS: 75 },
    { az: 199.9, el: 6.6, marginDb: -6.0, timeS: 100 },
    { az: 200.4, el: 8.3, marginDb: -5.0, timeS: 125 },
    { az: 201.0, el: 10.0, marginDb: -4.2, timeS: 150 },
    { az: 201.7, el: 11.9, marginDb: -3.3, timeS: 175 },
    { az: 202.5, el: 14.0, marginDb: -2.6, timeS: 200 },
    { az: 203.5, el: 16.3, marginDb: -1.8, timeS: 225 },
    { az: 204.6, el: 18.8, marginDb: -1.1, timeS: 250 },
    { az: 205.9, el: 21.6, marginDb: -0.3, timeS: 275 },
    { az: 207.5, el: 24.8, marginDb: 0.5, timeS: 300 },
    { az: 209.5, el: 28.4, marginDb: 1.3, timeS: 325 },
    { az: 212.0, el: 32.5, marginDb: 2.1, timeS: 350 },
    { az: 215.3, el: 37.2, marginDb: 3.0, timeS: 375 },
    { az: 219.8, el: 42.5, marginDb: 3.8, timeS: 400 },
    { az: 226.3, el: 48.4, marginDb: 4.6, timeS: 425 },
    { az: 235.8, el: 54.6, marginDb: 5.2, timeS: 450 },
    { az: 250.5, el: 60.3, marginDb: 5.7, timeS: 475 },
    { az: 271.6, el: 63.9, marginDb: 6.0, timeS: 500 },
    { az: 296.1, el: 63.6, marginDb: 6.0, timeS: 525 },
    { az: 316.6, el: 59.7, marginDb: 5.7, timeS: 550 },
    { az: 330.6, el: 53.9, marginDb: 5.2, timeS: 575 },
    { az: 339.7, el: 47.8, marginDb: 4.5, timeS: 600 },
    { az: 345.9, el: 41.9, marginDb: 3.7, timeS: 625 },
    { az: 350.3, el: 36.7, marginDb: 2.9, timeS: 650 },
    { az: 353.5, el: 32.0, marginDb: 2.1, timeS: 675 },
    { az: 356.0, el: 28.0, marginDb: 1.2, timeS: 700 },
    { az: 358.0, el: 24.5, marginDb: 0.4, timeS: 725 },
    { az: 359.6, el: 21.3, marginDb: -0.4, timeS: 750 },
    { az: 0.9, el: 18.6, marginDb: -1.1, timeS: 775 },
    { az: 2.0, el: 16.1, marginDb: -1.9, timeS: 800 },
    { az: 3.0, el: 13.8, marginDb: -2.6, timeS: 825 },
    { az: 3.8, el: 11.8, marginDb: -3.4, timeS: 850 },
    { az: 4.5, el: 9.9, marginDb: -4.2, timeS: 875 },
    { az: 5.2, el: 8.1, marginDb: -5.1, timeS: 900 },
    { az: 5.7, el: 6.5, marginDb: -6.1, timeS: 925 },
    { az: 6.3, el: 5.0, marginDb: -7.4, timeS: 950 },
    { az: 6.7, el: 3.5, marginDb: -9.2, timeS: 975 },
    { az: 7.2, el: 2.1, marginDb: -12.8, timeS: 1000 },
  ],
};

export const DUMMY_COMMS_PASSES: CommsPassesData = {
  site: {
    name: "Jezero West",
    latDeg: 18.43,
    lonDeg: 77.42,
    coordinate: "18.43° N  77.42° E · −2 410 m",
    localSolarHour: 15.63,
    stats: [
      { label: "Next usable pass", value: "16:42", unit: "LMST" },
      { label: "Max elevation", value: "62", unit: "°" },
      { label: "Expected margin", value: "+3.1", unit: "dB" },
    ],
  },
  constellation: "4 relays · 400 km · 3 orbital planes",
  relays: DUMMY_RELAYS,
  passes: PASSES,
  summary: PASS_SUMMARY,
  contactWindows: CONTACT_WINDOWS,
  activePass: DEFAULT_ACTIVE_PASS,
  activePassTrack: DEFAULT_ACTIVE_PASS.track,
};

export const DUMMY_COMMS_LINK: CommsLinkData = {
  link: LINK,
  passCount: 214,
  budgets: BUDGETS,
};
