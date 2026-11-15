import type { Mode, PolicyId, ScienceId } from "@/engine";

export type MissionPreset = {
  id: string;
  name: string;
  site: string;
  sol: number;
  coordinates: string;
  mode: Mode;
  policyId: PolicyId;
  scienceId: ScienceId;
  startLmst: number;
  distanceKm: number;
  durationLabel: string;
  stopsCount: number;
  summary: string;
  status: "Active" | "Ready" | "Planned";
  tags: string[];
};

export const MARS_MISSION_PRESETS: MissionPreset[] = [
  {
    id: "EVA-07",
    name: "Jezero West Delta",
    site: "Jezero Crater West",
    sol: 412,
    coordinates: "18.44° N, 77.43° E",
    mode: "efficient",
    policyId: "engine",
    scienceId: "app-60kg",
    startLmst: 9,
    distanceKm: 3.4,
    durationLabel: "3 h 10 min",
    stopsCount: 6,
    summary: "Primary geological traverse from lander egress to delta front. Outcrop cores and regolith collection.",
    status: "Active",
    tags: ["Delta", "Sampling", "Primary"],
  },
  {
    id: "EVA-08",
    name: "Belva Impact Rim",
    site: "Belva Crater",
    sol: 415,
    coordinates: "18.51° N, 77.38° E",
    mode: "safest",
    policyId: "hold-sheet",
    scienceId: "app-50kg",
    startLmst: 10,
    distanceKm: 2.85,
    durationLabel: "3 h 45 min",
    stopsCount: 5,
    summary: "High-elevation impact rim survey with strict 16° slope hold margins and boulder avoidance.",
    status: "Ready",
    tags: ["Impact", "Rim", "High-Slope"],
  },
  {
    id: "EVA-09",
    name: "Neretva Vallis Channel",
    site: "Neretva Riverbed",
    sol: 421,
    coordinates: "18.48° N, 77.49° E",
    mode: "balanced",
    policyId: "engine",
    scienceId: "model-40kg",
    startLmst: 9,
    distanceKm: 3.1,
    durationLabel: "2 h 50 min",
    stopsCount: 5,
    summary: "Fluvial inlet channel transect to map ancient braided river gravels and fine mudstone deposits.",
    status: "Planned",
    tags: ["Fluvial", "Mudstone", "Biosignature"],
  },
  {
    id: "EVA-10",
    name: "Séítah Dune Crossing",
    site: "South Séítah",
    sol: 428,
    coordinates: "18.42° N, 77.45° E",
    mode: "safest",
    policyId: "hold-sheet",
    scienceId: "model-40kg",
    startLmst: 11,
    distanceKm: 1.95,
    durationLabel: "2 h 30 min",
    stopsCount: 4,
    summary: "Navigating layered olivine-rich cumulate rocks across active ripple and sand dune corridors.",
    status: "Planned",
    tags: ["Dunes", "Olivine", "Caution"],
  },
  {
    id: "EVA-11",
    name: "Three Forks Cache",
    site: "Three Forks Delta",
    sol: 434,
    coordinates: "18.46° N, 77.41° E",
    mode: "efficient",
    policyId: "engine",
    scienceId: "app-50kg",
    startLmst: 8,
    distanceKm: 1.6,
    durationLabel: "1 h 45 min",
    stopsCount: 3,
    summary: "Sample return depot route. Inspect tube drop orientation and verify witness cylinder seal integrity.",
    status: "Ready",
    tags: ["Depot", "Cache", "Recovery"],
  },
  {
    id: "EVA-12",
    name: "Margin Carbonates",
    site: "Inner Crater Wall",
    sol: 440,
    coordinates: "18.55° N, 77.34° E",
    mode: "balanced",
    policyId: "hold-sheet",
    scienceId: "model-40kg",
    startLmst: 10,
    distanceKm: 4.2,
    durationLabel: "3 h 55 min",
    stopsCount: 7,
    summary: "Paleolake shoreline carbonate bench analysis to detect potential micro-fossil stromatolite structures.",
    status: "Planned",
    tags: ["Carbonate", "Stromatolite", "Extended"],
  },
];

