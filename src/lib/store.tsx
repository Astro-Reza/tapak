import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { POST_EVA_DEBRIEF_DONE, PRE_EVA_DONE } from "@/data/mission";

/**
 * Session state shared across screens so it survives navigation.
 * The Figma screens are snapshots at different mission times (13:20, 15:38,
 * 17:40), so the Hub and Debrief keep separate post-EVA checklist states.
 */
export type ChecklistKey = "pre" | "during" | "post" | "post-debrief";

type Store = {
  done: Record<ChecklistKey, ReadonlySet<string>>;
  toggle: (list: ChecklistKey, id: string) => void;
  routeCommitted: boolean;
  commitRoute: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [done, setDone] = useState<Record<ChecklistKey, ReadonlySet<string>>>({
    pre: new Set(PRE_EVA_DONE),
    during: new Set(),
    post: new Set(),
    "post-debrief": new Set(POST_EVA_DEBRIEF_DONE),
  });
  const [routeCommitted, setRouteCommitted] = useState(false);

  const toggle = useCallback((list: ChecklistKey, id: string) => {
    setDone((state) => {
      const next = new Set(state[list]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...state, [list]: next };
    });
  }, []);

  const commitRoute = useCallback(() => setRouteCommitted(true), []);

  const value = useMemo(
    () => ({ done, toggle, routeCommitted, commitRoute }),
    [done, toggle, routeCommitted, commitRoute],
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
