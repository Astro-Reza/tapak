import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Route } from "@/lib/router";
import { useMission } from "@/sim/mission";
import { getStepById, SCREEN_STEPS, STEP_FINAL_ID } from "./tour-data";
import type { TourContextValue, TourStepConfig, TourStoragePayload } from "./types";

const STORAGE_KEY = "marswalk.tour.v1";

const TourContext = createContext<TourContextValue | null>(null);

function loadStorage(): { seenScreens: string[]; skipAll: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { seenScreens: [], skipAll: false };
    const parsed = JSON.parse(raw) as Partial<TourStoragePayload>;
    return {
      seenScreens: Array.isArray(parsed.seenScreens) ? parsed.seenScreens : [],
      skipAll: Boolean(parsed.skipAll),
    };
  } catch {
    return { seenScreens: [], skipAll: false };
  }
}

function saveStorage(seenScreens: string[], skipAll: boolean): void {
  try {
    const payload: TourStoragePayload = {
      version: 1,
      seenScreens,
      skipAll,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage quota or private browsing mode
  }
}

export function TourProvider({
  route,
  onNavigate,
  children,
  demoHazard = false,
}: {
  route: Route;
  onNavigate?: (route: Route) => void;
  children: ReactNode;
  /** Force hazard interruption for testing/demo */
  demoHazard?: boolean;
}) {
  const initial = useMemo(loadStorage, []);
  const [seenScreens, setSeenScreens] = useState<string[]>(initial.seenScreens);
  const [skipAll, setSkipAll] = useState<boolean>(initial.skipAll);
  const [activeStepId, setActiveStepId] = useState<number | null>(null);

  // Sync to localStorage whenever seenScreens or skipAll change
  useEffect(() => {
    saveStorage(seenScreens, skipAll);
  }, [seenScreens, skipAll]);

  // Listen to mission safety state for R4 Safety & Hazard Interrupts
  let missionEv: { verdict?: string; go?: boolean } | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const mission = useMission();
    missionEv = mission.ev;
  } catch {
    // Context may not be mounted in pure tests
  }

  const isSafetyInterrupted = Boolean(
    demoHazard ||
      (missionEv && (missionEv.verdict === "NO-GO" || missionEv.go === false))
  );

  // Screen-specific mini-tour auto-trigger on first visit
  useEffect(() => {
    if (skipAll || isSafetyInterrupted) {
      return;
    }

    // Only auto-start when no step is active; otherwise this effect would
    // re-fire on every Next click and reset the tour to the first step.
    if (activeStepId !== null) {
      return;
    }

    // Check if this screen was already seen
    if (!seenScreens.includes(route)) {
      const stepIds = SCREEN_STEPS[route];
      if (stepIds && stepIds.length > 0) {
        // Small delay to allow route transition to settle
        const timer = window.setTimeout(() => {
          setActiveStepId(stepIds[0]);
        }, 120);
        return () => window.clearTimeout(timer);
      }
    }
  }, [route, seenScreens, skipAll, isSafetyInterrupted, activeStepId]);

  const activeStep: TourStepConfig | null = useMemo(() => {
    if (activeStepId === null || isSafetyInterrupted) return null;
    return getStepById(activeStepId) ?? null;
  }, [activeStepId, isSafetyInterrupted]);

  const stepIndexInScreen = activeStep?.stepInScreen ?? 1;
  const totalStepsInScreen = activeStep?.totalInScreen ?? 1;

  const nextStep = useCallback(() => {
    if (activeStepId === null) return;

    if (activeStepId === STEP_FINAL_ID) {
      // Completed final step (final replayable step)
      setSeenScreens((prev) => (prev.includes("hub-end") ? prev : [...prev, "hub-end"]));
      setActiveStepId(null);
      return;
    }

    if (activeStepId === STEP_FINAL_ID - 1) {
      // Completed Debrief step -> Mark debrief seen, navigate to Hub, and show the final step
      setSeenScreens((prev) => (prev.includes("debrief") ? prev : [...prev, "debrief"]));
      if (onNavigate) {
        onNavigate("hub");
      }
      setActiveStepId(STEP_FINAL_ID);
      return;
    }

    const currentScreenSteps = SCREEN_STEPS[route] ?? [];
    const currentIndex = currentScreenSteps.indexOf(activeStepId);

    if (currentIndex >= 0 && currentIndex < currentScreenSteps.length - 1) {
      // Next step within the current screen's mini-tour
      setActiveStepId(currentScreenSteps[currentIndex + 1]);
    } else {
      // Completed the screen's mini-tour
      setSeenScreens((prev) => (prev.includes(route) ? prev : [...prev, route]));
      setActiveStepId(null);
    }
  }, [activeStepId, route, onNavigate]);

  const prevStep = useCallback(() => {
    if (activeStepId === null) return;
    if (activeStepId === STEP_FINAL_ID) return;

    const currentScreenSteps = SCREEN_STEPS[route] ?? [];
    const currentIndex = currentScreenSteps.indexOf(activeStepId);

    if (currentIndex > 0) {
      setActiveStepId(currentScreenSteps[currentIndex - 1]);
    }
  }, [activeStepId, route]);

  const skipScreenTour = useCallback(() => {
    if (activeStepId === STEP_FINAL_ID) {
      setSeenScreens((prev) => (prev.includes("hub-end") ? prev : [...prev, "hub-end"]));
    } else {
      setSeenScreens((prev) => (prev.includes(route) ? prev : [...prev, route]));
    }
    setActiveStepId(null);
  }, [activeStepId, route]);

  const skipAllTours = useCallback(() => {
    setSkipAll(true);
    setSeenScreens(["hub", "plan", "eva", "fov", "comms", "debrief", "hub-end"]);
    setActiveStepId(null);
  }, []);

  const replayTour = useCallback(
    (screenToReplay?: Route) => {
      const targetScreen = screenToReplay ?? route;
      // Replaying explicitly un-mutes skipAll
      setSkipAll(false);

      if (targetScreen === "hub") {
        if (onNavigate && route !== "hub") {
          onNavigate("hub");
        }
        // Restart from Step 1 on Hub
        setSeenScreens((prev) => prev.filter((s) => s !== "hub" && s !== "hub-end"));
        setActiveStepId(1);
      } else {
        if (onNavigate && route !== targetScreen) {
          onNavigate(targetScreen);
        }
        setSeenScreens((prev) => prev.filter((s) => s !== targetScreen));
        const stepIds = SCREEN_STEPS[targetScreen];
        if (stepIds && stepIds.length > 0) {
          setActiveStepId(stepIds[0]);
        }
      }
    },
    [route, onNavigate]
  );

  const value: TourContextValue = useMemo(
    () => ({
      activeStep,
      currentScreen: route,
      stepIndexInScreen,
      totalStepsInScreen,
      isActive: activeStep !== null && !isSafetyInterrupted,
      isInterrupted: isSafetyInterrupted,
      skipAll,
      seenScreens,
      nextStep,
      prevStep,
      skipScreenTour,
      skipAllTours,
      replayTour,
    }),
    [
      activeStep,
      route,
      stepIndexInScreen,
      totalStepsInScreen,
      isSafetyInterrupted,
      skipAll,
      seenScreens,
      nextStep,
      prevStep,
      skipScreenTour,
      skipAllTours,
      replayTour,
    ]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error("useTour must be used within a <TourProvider>");
  }
  return ctx;
}
