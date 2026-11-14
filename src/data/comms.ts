/**
 * Comms payloads and their dummy values. These are the shapes the comms
 * backend is expected to return (see src/lib/comms-api.ts); until it exists,
 * the screens run on the dummy objects below. Nothing here is a measurement.
 */
import type { RelayOrbit } from "@/lib/orbit";
import { BUDGETS, CONTACT_WINDOWS, LINK, PASSES, PASS_SUMMARY, type Budget, type RelayPass } from "./mission";

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
};

export const DUMMY_COMMS_LINK: CommsLinkData = {
  link: LINK,
  passCount: 214,
  budgets: BUDGETS,
};
