import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";

import { ToastProvider } from "@/components/marswalk/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEBRIEF, EVA, PLAN } from "@/data/mission";
import { isReducedMotion, motionMs } from "@/lib/motion";
import { useHashRoute, type Route } from "@/lib/router";
import { cn } from "@/lib/utils";
import { StoreProvider } from "@/lib/store";
import { TourOverlay, TourProvider } from "@/tour";
import { MissionProvider } from "@/sim/mission";
import { MissionTopBar } from "@/sim/top-bar";
import { CommsLinkScreen } from "@/screens/comms-link";
import { DebriefScreen } from "@/screens/debrief";
import { EvaMapScreen } from "@/screens/eva-map";
import { HubScreen } from "@/screens/hub";
import { LandingScreen } from "@/screens/landing";
import { PlanScreen } from "@/screens/plan";

/** FoV pulls in three.js (~600 kB); load it only when the screen opens. */
const FovLazy = lazy(() => import("@/screens/fov").then((m) => ({ default: m.FovScreen })));
function FovScreen() {
  return (
    <Suspense fallback={<p role="status" className="p-xl t-body-m text-fg-secondary">Loading 3D view…</p>}>
      <FovLazy />
    </Suspense>
  );
}

/** Each Figma screen is a snapshot at a mission time (LMST). */
const CLOCK: Record<Route, string> = {
  landing: "13:20",
  hub: "13:20",
  plan: PLAN.clock,
  eva: EVA.clock,
  fov: EVA.clock,
  comms: EVA.clock,
  debrief: DEBRIEF.clock,
};

const SCREENS: Record<Route, () => React.JSX.Element> = {
  landing: LandingScreen,
  hub: HubScreen,
  plan: PlanScreen,
  eva: EvaMapScreen,
  fov: FovScreen,
  comms: CommsLinkScreen,
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
    if (route === "landing" || shownRef.current === "landing") {
      shownRef.current = route;
      setShown(route);
      return;
    }
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

  // The landing page is a document of its own: no mission top bar, no providers.
  if (route === "landing") return <LandingScreen />;

  return (
    <StoreProvider>
      <MissionProvider>
        <TourProvider route={route} onNavigate={navigate}>
          <ToastProvider>
            <TooltipProvider delayDuration={200}>
              <div className="flex h-full flex-col bg-canvas">
                <MissionTopBar route={route} fallback={CLOCK[shown]} onNavigate={navigate} />
                <div className="relative min-h-0 flex-1">
                  <main key={shown} className={cn("absolute inset-0 overflow-x-hidden", shown === "hub" || shown === "debrief" ? "overflow-y-hidden" : "overflow-y-auto")}>
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
                <TourOverlay />
              </div>
            </TooltipProvider>
          </ToastProvider>
        </TourProvider>
      </MissionProvider>
    </StoreProvider>
  );
}
