import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  createLink,
  DEFAULT_DELAY_S,
  planMission,
  validatePlan,
  type Evaluation,
  type Link,
  type LinkMessage,
  type MissionResult,
  type Mode,
  type ModelKey,
  type PolicyId,
  type ScienceId,
} from "@/engine";
import { DUMMY_COMMS_PASSES } from "@/data/comms";
import { buildArPackage } from "./ar-package";
import { loadMissionData, type LoadedData } from "./load";
import { missionControlStatus, type Constellation } from "./suit-feed";
export { COURSE_M, courseText, suitIsLive } from "./suit-feed";

export type Settings = {
  scienceId: ScienceId;
  policyId: PolicyId;
  mode: Mode;
  /** EVA start, LMST hour */
  startLmst: number;
  kSuit: number;
  modelKey: ModelKey;
};

export type LinkLogEntry = { at: number; dir: "out" | "in"; text: string };

/**
 * Latest status from a suit device on the relay (the Marswalk AR phone app), already light-time delayed.
 * x / z: where the suit really is (mission frame); offM: signed distance from the route, + right of travel.
 */
export type SuitStatus = {
  at: number;
  t: number;
  km: number;
  tracking: string;
  counts: boolean;
  x?: number;
  z?: number;
  offM?: number;
};


type MissionState = {
  data: LoadedData | null;
  error: string | null;
  busy: boolean;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  result: MissionResult | null;
  /** evaluation of the selected mode */
  ev: Evaluation | null;
  /** simulated EVA clock, minutes from egress */
  evaT: number;
  setEvaT: (t: number) => void;
  playing: boolean;
  setPlaying: (on: boolean) => void;
  link: { delayS: number; setDelay: (s: number) => void; log: LinkLogEntry[]; sendPlan: () => void; relayOnline: boolean; suit: SuitStatus | null };
};

const Ctx = createContext<MissionState | null>(null);

const DEFAULTS: Settings = {
  scienceId: "app-60kg",
  policyId: "engine",
  mode: "efficient",
  startLmst: 9, // MARSWALK/app default start
  kSuit: 1,
  modelKey: "acsmScaled",
};

/** Simulated minutes per real second while the EVA playback runs. */
const PLAY_RATE = 4;

/** Mission Control tells a live suit its environment and orbit link this often (each send is a relay call). */
const FEED_MS = 5000;
/** A suit is live while its statuses keep arriving (it sends every 2 s). */
const SUIT_LIVE_MS = 30e3;
// ponytail: the Comms screens' relay constellation (dummy until VITE_MARSWALK_API_URL serves /comms/passes);
// read it from the comms backend here too once that is deployed next to the site.
const SKY: Constellation = {
  site: { latDeg: DUMMY_COMMS_PASSES.site.latDeg, lonDeg: DUMMY_COMMS_PASSES.site.lonDeg },
  relays: DUMMY_COMMS_PASSES.relays,
  snapshotLmst: DUMMY_COMMS_PASSES.site.localSolarHour,
};

export function MissionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LoadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [result, setResult] = useState<MissionResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [evaT, setEvaT] = useState(98); // EVA Map opens mid-walk, like the Figma frame (T+01:38)
  const [playing, setPlaying] = useState(false);
  const [log, setLog] = useState<LinkLogEntry[]>([]);
  const [delayS, setDelayS] = useState(DEFAULT_DELAY_S);
  const linkRef = useRef<Link | null>(null);
  const [relayOnline, setRelayOnline] = useState(false);
  const [suit, setSuit] = useState<SuitStatus | null>(null);

  useEffect(() => {
    loadMissionData().then(setData, (e: Error) => setError(`Mission data failed to load: ${e.message}`));
  }, []);

  // Planning (return field + 3 modes) takes about a second; let the busy state paint first.
  const planKey = `${settings.scienceId}|${settings.policyId}|${settings.startLmst}|${settings.kSuit}|${settings.modelKey}`;
  useEffect(() => {
    if (!data) return;
    setBusy(true);
    const id = window.setTimeout(() => {
      try {
        setResult(planMission(data, settings));
        setError(null);
      } catch (e) {
        setError(`Planning failed: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    }, 30);
    return () => window.clearTimeout(id);
    // settings.mode only selects among computed modes, so it is not part of the key
  }, [data, planKey]);

  const ev = result ? result.modes[settings.mode] : null;
  const endT = ev?.end?.t ?? 0;

  useEffect(() => {
    if (!playing || !endT) return;
    const id = window.setInterval(() => {
      setEvaT((t) => {
        const next = t + PLAY_RATE / 4;
        if (next >= endT) setPlaying(false);
        return Math.min(next, endT);
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, endT]);

  // Mission-control side of the light-time link. MARSWALK/app ?role=astronaut in another tab can answer, and so can
  // the Marswalk AR phone app through the /link relay: the dev server hosts one (npm run dev:lan), Vercel another
  // (api/link.js, once Upstash Redis is connected). Hosts without one answer 404 and the link stops polling.
  useEffect(() => {
    const push = (e: LinkLogEntry) => setLog((l) => [e, ...l].slice(0, 8));
    const link = createLink({
      role: "master",
      // this site's own relay, unless VITE_RELAY_URL points elsewhere (npm run dev:cloud: a local site on the
      // deployed relay, so it talks to phones on their default, tapak-two.vercel.app)
      relay: ((import.meta.env.VITE_RELAY_URL as string | undefined)?.trim() || new URL(".", location.href).href).replace(/\/+$/, ""),
      onRelay: setRelayOnline,
      onMessage: (m: LinkMessage) => {
        push({ at: Date.now(), dir: "in", text: `${m.type} received (${Math.round((Date.now() - m.sentAt) / 1000)} s after send)` });
        // a walking suit drives the mission clock: EVA Map, FoV and telemetry follow its planned time at real progress
        const p = m.payload as Partial<SuitStatus> | null;
        if (m.type === "status" && p && Number.isFinite(p.t) && Number.isFinite(p.km)) {
          setPlaying(false);
          setEvaT(Math.max(0, p.t!));
          const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined); // the relay is open
          setSuit({
            at: Date.now(),
            t: p.t!,
            km: p.km!,
            tracking: String(p.tracking ?? "normal"),
            counts: p.counts !== false,
            x: num(p.x),
            z: num(p.z),
            offM: num(p.offM),
          });
        }
      },
    });
    linkRef.current = link;
    return () => link.close();
  }, []);

  const setDelay = useCallback((s: number) => {
    linkRef.current?.setDelay(s);
    setDelayS(linkRef.current?.delayS ?? s);
  }, []);

  // Mission Control -> suit: live environment, consumables and orbit link at the suit's own planned time, so the
  // phone's visor HUD follows Mission Control (MEDA weather, RAD model, relay passes) instead of showing fixed numbers.
  const feed = useRef({ data, result, ev, evaT, suit });
  feed.current = { data, result, ev, evaT, suit };
  useEffect(() => {
    const id = window.setInterval(() => {
      const { data, result, ev, evaT, suit } = feed.current;
      if (!linkRef.current || !result || !ev || !suit || Date.now() - suit.at > SUIT_LIVE_MS) return;
      const payload = missionControlStatus(result, ev, evaT, SKY, data?.grid);
      if (payload) linkRef.current.send("status", payload);
    }, FEED_MS);
    return () => window.clearInterval(id);
  }, []);

  const sendPlan = useCallback(() => {
    const link = linkRef.current;
    if (!link || !ev?.end || !result) return;
    if (!data) return;
    const recipe = validatePlan({
      v: 1,
      mode: settings.mode,
      sliderT: settings.mode === "safest" ? 1 : settings.mode === "balanced" ? 0.5 : 0,
      modelKey: settings.modelKey,
      startLmst: settings.startLmst,
      kSuit: settings.kSuit,
      o2CapacityL: result.s.o2CapacityL,
      summary: { km: ev.end.dist / 1000, o2L: ev.end.o2 },
    });
    // the recipe is for MARSWALK/app (it re-plans); the AR app never re-plans, so it gets the full package too
    link.send("plan", { ...recipe, arPackage: buildArPackage({ data, result, mode: settings.mode, settings }) });
    setLog((l) => [{ at: Date.now(), dir: "out" as const, text: `plan sent · arrives in ${link.delayS} s` }, ...l].slice(0, 8));
  }, [data, ev, result, settings]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const value = useMemo<MissionState>(
    () => ({
      data,
      error,
      busy,
      settings,
      update,
      result,
      ev,
      evaT: Math.min(evaT, endT || evaT),
      setEvaT,
      playing,
      setPlaying,
      link: { delayS, setDelay, log, sendPlan, relayOnline, suit },
    }),
    [data, error, busy, settings, update, result, ev, evaT, endT, playing, delayS, setDelay, log, sendPlan, relayOnline, suit],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMission(): MissionState {
  const m = useContext(Ctx);
  if (!m) throw new Error("useMission must be used inside MissionProvider");
  return m;
}
