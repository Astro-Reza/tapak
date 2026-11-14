import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  createLink,
  DEFAULT_DELAY_S,
  DEFAULT_POLICY,
  DEFAULT_SCIENCE,
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
  link: { delayS: number; setDelay: (s: number) => void; log: LinkLogEntry[]; sendPlan: () => void };
};

const Ctx = createContext<MissionState | null>(null);

const DEFAULTS: Settings = {
  scienceId: DEFAULT_SCIENCE,
  policyId: DEFAULT_POLICY,
  mode: "efficient",
  startLmst: 9, // MARSWALK/app default start
  kSuit: 1,
  modelKey: "acsmScaled",
};

/** Simulated minutes per real second while the EVA playback runs. */
const PLAY_RATE = 4;

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

  // Mission-control side of the light-time link; MARSWALK/app ?role=astronaut in another tab can answer.
  useEffect(() => {
    const push = (e: LinkLogEntry) => setLog((l) => [e, ...l].slice(0, 8));
    const link = createLink({
      role: "master",
      onMessage: (m: LinkMessage) => push({ at: Date.now(), dir: "in", text: `${m.type} received (${Math.round((Date.now() - m.sentAt) / 1000)} s after send)` }),
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
    link.send("plan", recipe);
    setLog((l) => [{ at: Date.now(), dir: "out" as const, text: `plan sent · arrives in ${link.delayS} s` }, ...l].slice(0, 8));
  }, [ev, result, settings]);

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
      link: { delayS, setDelay, log, sendPlan },
    }),
    [data, error, busy, settings, update, result, ev, evaT, endT, playing, delayS, setDelay, log, sendPlan],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMission(): MissionState {
  const m = useContext(Ctx);
  if (!m) throw new Error("useMission must be used inside MissionProvider");
  return m;
}
