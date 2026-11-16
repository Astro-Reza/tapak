import type { Route } from "@/lib/router";

export interface TourStepConfig {
  id: number;
  screen: Route;
  stepInScreen: number;
  totalInScreen: number;
  feature: string;
  targetSelector: string | null;
  title: string;
  text: string;
  simulated: boolean;
}

export interface TourStoragePayload {
  version: 1;
  seenScreens: string[];
  skipAll: boolean;
}

export interface TourContextValue {
  activeStep: TourStepConfig | null;
  currentScreen: Route;
  stepIndexInScreen: number;
  totalStepsInScreen: number;
  isActive: boolean;
  isInterrupted: boolean;
  skipAll: boolean;
  seenScreens: string[];
  nextStep: () => void;
  prevStep: () => void;
  skipScreenTour: () => void;
  skipAllTours: () => void;
  replayTour: (screen?: Route) => void;
}
