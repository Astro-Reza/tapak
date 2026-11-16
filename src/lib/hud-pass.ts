/**
 * HUD Pass Synchronization and Active Trajectory Store.
 *
 * Provides shared state and persistence (localStorage + CustomEvent)
 * between Comms Passes screen ("Sync passes to HUD") and the FOV HUD screen,
 * ensuring seamless offline and online synchronization of Mars Relay Satellite (MRS)
 * orbital passes and sky trajectories.
 */

import { useEffect, useState } from "react";

export const HUD_PASS_STORAGE_KEY = "marswalk:hud:pass";
export const HUD_PASS_EVENT = "marswalk:hud:pass:sync";

export type HudPassPoint = {
  az: number;
  el: number;
  marginDb: number;
  timeS: number;
  atmosLossDb?: number;
  slantRangeKm?: number;
};

export type HudPassData = {
  relayId: string;
  relayName: string;
  startS: number;
  endS: number;
  maxElevationDeg: number;
  aos?: string;
  los?: string;
  track: HudPassPoint[];
  syncedAt: number;
};

/**
 * Saves active pass trajectory to localStorage and dispatches a CustomEvent
 * for real-time reactive update across active screens.
 */
export function saveHudPass(pass: HudPassData): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(HUD_PASS_STORAGE_KEY, JSON.stringify(pass));
      window.dispatchEvent(new CustomEvent(HUD_PASS_EVENT, { detail: pass }));
    }
  } catch (err) {
    console.warn("Failed to persist HUD pass:", err);
  }
}

/**
 * Loads persisted HUD pass trajectory from localStorage.
 */
export function loadHudPass(): HudPassData | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(HUD_PASS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.track) && parsed.track.length > 0) {
          return parsed as HudPassData;
        }
      }
    }
  } catch (err) {
    console.warn("Failed to read HUD pass:", err);
  }
  return null;
}

/**
 * Derives satellite position, flown/predicted trajectory, and labels from a pass track.
 */
export function getSatelliteTrackState(pass: HudPassData, simElapsedS = 0) {
  const track = pass.track;
  if (!track || track.length === 0) {
    return {
      currentIdx: 0,
      currentPt: { az: 207.5, el: 24.8, marginDb: 0.5, timeS: 0 },
      flown: [] as HudPassPoint[],
      predicted: [] as HudPassPoint[],
      aosPt: { az: 198.2, el: 0.9, marginDb: -23.7, timeS: 0 },
      losPt: { az: 7.2, el: 2.1, marginDb: -12.8, timeS: 1000 },
      satLabel: `${pass.relayName || "MRS-L1"} · el 25° · az 208° · uplink +0.5 dB`,
      satPinLabel: `${pass.relayName || "MRS-L1"} · out of view`,
      aosLabel: pass.aos ? `AOS ${pass.aos}` : "AOS 15:35",
      losLabel: pass.los ? `LOS ${pass.los}` : "LOS 15:44",
    };
  }

  // Determine target time
  const hasNegative = track.some((p) => p.timeS < 0);
  let targetT = simElapsedS;
  if (!hasNegative && pass.startS !== undefined) {
    targetT = simElapsedS - pass.startS;
  }

  // Find closest point to targetT
  let bestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < track.length; i++) {
    const diff = Math.abs(track[i].timeS - targetT);
    if (diff < minDiff) {
      minDiff = diff;
      bestIdx = i;
    }
  }

  const currentPt = track[bestIdx];
  const flown = track.slice(0, bestIdx + 1);
  const predicted = track;
  const aosPt = track[0];
  const losPt = track[track.length - 1];

  const relayName = pass.relayName || "MRS-L1";
  const azStr = String(((Math.round(currentPt.az) % 360) + 360) % 360).padStart(3, "0");
  const marginStr = `${currentPt.marginDb >= 0 ? "+" : ""}${currentPt.marginDb.toFixed(1)}`;
  const satLabel = `${relayName} · el ${Math.round(currentPt.el)}° · az ${azStr}° · uplink ${marginStr} dB`;
  const satPinLabel = `${relayName} · out of view`;
  const aosLabel = pass.aos ? `AOS ${pass.aos}` : "AOS 15:35";
  const losLabel = pass.los ? `LOS ${pass.los}` : "LOS 15:44";

  return {
    currentIdx: bestIdx,
    currentPt,
    flown,
    predicted,
    aosPt,
    losPt,
    satLabel,
    satPinLabel,
    aosLabel,
    losLabel,
  };
}

/**
 * React hook that returns the active HUD pass, listening to sync events.
 */
export function useHudPass(fallbackPass: HudPassData): {
  pass: HudPassData;
  isSynced: boolean;
} {
  const [hudPass, setHudPass] = useState<HudPassData>(() => {
    return loadHudPass() ?? fallbackPass;
  });
  const [isSynced, setIsSynced] = useState<boolean>(() => {
    return loadHudPass() !== null;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = loadHudPass();
    if (stored) {
      setHudPass(stored);
      setIsSynced(true);
    }

    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<HudPassData>;
      if (customEvent.detail) {
        setHudPass(customEvent.detail);
        setIsSynced(true);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === HUD_PASS_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && Array.isArray(parsed.track)) {
            setHudPass(parsed);
            setIsSynced(true);
          }
        } catch {
          // ignore malformed storage data
        }
      }
    };

    window.addEventListener(HUD_PASS_EVENT, handleSync);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(HUD_PASS_EVENT, handleSync);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return { pass: hudPass, isSynced };
}
