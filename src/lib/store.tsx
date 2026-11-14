import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { POST_EVA_DEBRIEF_DONE } from "@/data/mission";

/**
 * Session state shared across screens so it survives navigation.
 * The Figma screens are snapshots at different mission times (13:20, 15:38,
 * 17:40), so the Hub and Debrief keep separate post-EVA checklist states.
 */
export type ChecklistKey = "pre" | "during" | "post" | "post-debrief";

type DoneState = Record<ChecklistKey, ReadonlySet<string>>;

type Store = {
  done: DoneState;
  toggle: (list: ChecklistKey, id: string) => void;
  /** Clears every tick of one list (new EVA, new sheet). */
  resetList: (list: ChecklistKey) => void;
  routeCommitted: boolean;
  commitRoute: () => void;
};

const StoreContext = createContext<Store | null>(null);

/**
 * Checklist ticks persist on the device so a reload or a dropped tab does
 * not lose them. Bump the version when item ids change meaning.
 */
const STORAGE_KEY = "marswalk.checklists.v1";
const KEYS: ChecklistKey[] = ["pre", "during", "post", "post-debrief"];

function initialDone(): DoneState {
  const state: DoneState = {
    pre: new Set(),
    during: new Set(),
    post: new Set(),
    "post-debrief": new Set(POST_EVA_DEBRIEF_DONE),
  };
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && typeof saved === "object") {
      for (const key of KEYS) {
        const ids = (saved as Record<string, unknown>)[key];
        if (Array.isArray(ids)) state[key] = new Set(ids.filter((id) => typeof id === "string"));
      }
    }
  } catch {
    // Storage blocked or corrupt: start from the defaults.
  }
  return state;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [done, setDone] = useState<DoneState>(initialDone);
  const [routeCommitted, setRouteCommitted] = useState(false);

  const toggle = useCallback((list: ChecklistKey, id: string) => {
    setDone((state) => {
      const next = new Set(state[list]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...state, [list]: next };
    });
  }, []);

  const resetList = useCallback((list: ChecklistKey) => {
    setDone((state) => ({ ...state, [list]: new Set<string>() }));
  }, []);

  useEffect(() => {
    try {
      const plain = Object.fromEntries(KEYS.map((key) => [key, [...done[key]]]));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plain));
    } catch {
      // Storage full or blocked: ticks stay in memory for this session.
    }
  }, [done]);

  const commitRoute = useCallback(() => setRouteCommitted(true), []);

  const value = useMemo(
    () => ({ done, toggle, resetList, routeCommitted, commitRoute }),
    [done, toggle, resetList, routeCommitted, commitRoute],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}

/** "14:00" + 95 min -> "15:35" */
export function clockAfter(start: string, minutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
