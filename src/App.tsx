import { useEffect, useRef, useState, type CSSProperties } from "react";

import { ToastProvider } from "@/components/marswalk/toaster";
import { TopBar } from "@/components/marswalk/top-bar";
import { DEBRIEF, EVA, PLAN } from "@/data/mission";
import { isReducedMotion, motionMs } from "@/lib/motion";
import { useHashRoute, type Route } from "@/lib/router";
import { StoreProvider } from "@/lib/store";
import { CommsLinkScreen } from "@/screens/comms-link";
import { CommsPassesScreen } from "@/screens/comms-passes";
import { DebriefScreen } from "@/screens/debrief";
import { EvaMapScreen } from "@/screens/eva-map";
import { FovScreen } from "@/screens/fov";
import { HubScreen } from "@/screens/hub";
import { PlanScreen } from "@/screens/plan";

/** Each Figma screen is a snapshot at a mission time (LMST). */
const CLOCK: Record<Route, string> = {
  hub: "13:20",
  plan: PLAN.clock,
  eva: EVA.clock,
  fov: EVA.clock,
  comms: EVA.clock,
  "comms/passes": EVA.clock,
  debrief: DEBRIEF.clock,
};

const SCREENS: Record<Route, () => React.JSX.Element> = {
  hub: HubScreen,
  plan: PlanScreen,
  eva: EvaMapScreen,
  fov: FovScreen,
  comms: CommsLinkScreen,
  "comms/passes": CommsPassesScreen,
  debrief: DebriefScreen,
};

type Phase = "idle" | "cover" | "reveal";

/**
 * Screen change (pattern 15): six surface-base columns snap in left to right,
 * the view swaps underneath, then the columns leave left to right. The top bar
 * never moves.
 */
function useScreenChange(route: Route) {
  const [shown, setShown] = useState(route);
  const [phase, setPhase] = useState<Phase>("idle");
  const shownRef = useRef(route);

  useEffect(() => {
    if (route === shownRef.current) return;
    const swap = () => {
      shownRef.current = route;
      setShown(route);
    };
    if (isReducedMotion()) {
      swap();
      setPhase("idle");
      return;
    }
    const each = motionMs("tick") * 6;
    let second = 0;
    setPhase("cover");
    const first = window.setTimeout(() => {
      swap();
      setPhase("reveal");
      second = window.setTimeout(() => setPhase("idle"), each);
    }, each);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [route]);

  return { shown, phase };
}

export default function App() {
  const [route, navigate] = useHashRoute();
  const { shown, phase } = useScreenChange(route);
  const Screen = SCREENS[shown];

  return (
    <StoreProvider>
      <ToastProvider>
        <div className="flex h-full flex-col bg-canvas">
          <TopBar route={route} clock={CLOCK[shown]} onNavigate={navigate} />
          <div className="relative min-h-0 flex-1">
            <main key={shown} className="absolute inset-0 overflow-x-hidden overflow-y-auto">
              <Screen />
            </main>
            {phase === "idle" ? null : (
              <div className="mw-cols" data-phase={phase} aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <i key={i} style={{ "--i": i } as CSSProperties} />
                ))}
              </div>
            )}
          </div>
        </div>
      </ToastProvider>
    </StoreProvider>
  );
}
