import { useEffect, useRef, useState, type CSSProperties } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

/** iPad Pro 12.9" landscape, the size of the Figma frames. */
const STAGE = { width: 1366, height: 1024 };

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

/** Scales the fixed 1366 x 1024 stage to fit the viewport, centered. */
function useStageFit() {
  const [fit, setFit] = useState({ scale: 1, left: 0, top: 0 });
  useEffect(() => {
    const update = () => {
      const scale = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
      setFit({
        scale,
        left: (window.innerWidth - STAGE.width * scale) / 2,
        top: (window.innerHeight - STAGE.height * scale) / 2,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return fit;
}

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
  const fit = useStageFit();
  const Screen = SCREENS[shown];
  const inComms = shown === "comms" || shown === "comms/passes";

  return (
    <StoreProvider>
      <div
        className="absolute overflow-hidden bg-canvas"
        style={{
          width: STAGE.width,
          height: STAGE.height,
          left: fit.left,
          top: fit.top,
          transform: `scale(${fit.scale})`,
          transformOrigin: "0 0",
        }}
      >
        <ToastProvider>
          <TopBar route={route} clock={CLOCK[shown]} onNavigate={navigate} />
          <main key={shown}>
            <Screen />
            {inComms ? (
              <ToggleGroup
                type="single"
                aria-label="Comms view"
                value={shown}
                onValueChange={(value) => value && navigate(value as Route)}
                className={
                  shown === "comms"
                    ? "absolute top-[96px] right-xl"
                    : "absolute top-[110px] right-[424px]"
                }
              >
                <ToggleGroupItem value="comms">Link budget</ToggleGroupItem>
                <ToggleGroupItem value="comms/passes">Pass prediction</ToggleGroupItem>
              </ToggleGroup>
            ) : null}
          </main>
          {phase === "idle" ? null : (
            <div className="mw-cols" data-phase={phase} aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} style={{ "--i": i } as CSSProperties} />
              ))}
            </div>
          )}
        </ToastProvider>
      </div>
    </StoreProvider>
  );
}
