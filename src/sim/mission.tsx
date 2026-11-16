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
  type Stop,
} from "@/engine";
import { buildArPackage } from "./ar-package";
import { loadMissionData, type LoadedData } from "./load";

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

/** Latest status from a suit device on the relay (the Marswalk AR phone app), already light-time delayed. */
export type SuitStatus = { at: number; t: number; km: number; tracking: string; counts: boolean };

type MissionState = {
  data: LoadedData | null;
  error: string | null;
  busy: boolean;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** add a stop at world metres before the return home; returns an error message or null */
  addStop: (x: number, z: number, lat: number, lon: number) => string | null;
  /** remove stop `index` (not the start); returns an error message or null */
  removeStop: (index: number) => string | null;
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

export function MissionProvider({ children }: { children: ReactNode }) {
  const [baseData, setData] = useState<LoadedData | null>(null);
  /** The user's edited stop list (null = the dataset's own stops). Stop 0 is the start and the return home. */
  const [stops, setStops] = useState<Stop[] | null>(null);
  const data = useMemo(() => (baseData && stops ? { ...baseData, stops } : baseData), [baseData, stops]);
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
  const planKey = `${settings.scienceId}|${settings.policyId}|${settings.startLmst}|${settings.kSuit}|${settings.modelKey}|${stops?.map((s) => s.id).join(",") ?? ""}`;
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
      relay: new URL(".", location.href).href.replace(/\/$/, ""),
      onRelay: setRelayOnline,
      onMessage: (m: LinkMessage) => {
        push({ at: Date.now(), dir: "in", text: `${m.type} received (${Math.round((Date.now() - m.sentAt) / 1000)} s after send)` });
        // a walking suit drives the mission clock: EVA Map, FoV and telemetry follow its planned time at real progress
        const p = m.payload as Partial<SuitStatus> | null;
        if (m.type === "status" && p && Number.isFinite(p.t) && Number.isFinite(p.km)) {
          setPlaying(false);
          setEvaT(Math.max(0, p.t!));
          setSuit({ at: Date.now(), t: p.t!, km: p.km!, tracking: String(p.tracking ?? "normal"), counts: p.counts !== false });
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

  /** Add a stop at world metres (x, z) before the return home. Returns an error message, or null when added. */
  const addStop = useCallback(
    (x: number, z: number, lat: number, lon: number): string | null => {
      if (!baseData) return "Mission data is not loaded";
      const g = baseData.grid;
      const r = Math.floor((z - g.z0) / g.cell[1]), c = Math.floor((x - g.x0) / g.cell[0]);
      if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return "That point is outside the planning terrain";
      const elev = g.elev[r * g.cols + c];
      if (!Number.isFinite(elev)) return "No terrain data at that point";
      setStops((cur) => {
        const list = cur ?? baseData.stops;
        const n = list.filter((s) => s.id.startsWith("NEW")).length + 1;
        return [...list, { id: `NEW${n}`, xz: [x, z], elev, lat, lon, sols: [] }];
      });
      return null;
    },
    [baseData],
  );
  /** Remove the stop at index (the start, index 0, stays; the route needs at least two stops). */
  const removeStop = useCallback(
    (index: number): string | null => {
      const list = stops ?? baseData?.stops;
      if (!list) return "Mission data is not loaded";
      if (index <= 0) return "The start cannot be removed";
      if (list.length <= 2) return "A route needs at least one stop besides the start";
      if (index >= list.length) return "No such stop";
      setStops(list.filter((_, i) => i !== index));
      return null;
    },
    [stops, baseData],
  );

  const value = useMemo<MissionState>(
    () => ({
      data,
      error,
      busy,
      settings,
      update,
      addStop,
      removeStop,
      result,
      ev,
      evaT: Math.min(evaT, endT || evaT),
      setEvaT,
      playing,
      setPlaying,
      link: { delayS, setDelay, log, sendPlan, relayOnline, suit },
    }),
    [data, error, busy, settings, update, addStop, removeStop, result, ev, evaT, endT, playing, delayS, setDelay, log, sendPlan, relayOnline, suit],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMission(): MissionState {
  const m = useContext(Ctx);
  if (!m) throw new Error("useMission must be used inside MissionProvider");
  return m;
}
