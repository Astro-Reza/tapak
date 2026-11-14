/**
 * Demo mission data for the Marswalk v1 iPad screens.
 *
 * DATA HONESTY: everything in this file is synthetic or modelled. Terrain,
 * slope cells, dose, temperatures, telemetry and relay passes are placeholders
 * from the Figma prototype, not Mars measurements. Screens that show them say
 * so. Replace this module with the real data pipeline and route engine.
 */
import type { Status, LogLevel, TimelineKind } from "@/components/marswalk/primitives";
import type { Point } from "@/components/marswalk/map";

export const MISSION = {
  id: "EVA-07",
  site: "Jezero West",
  sol: 412,
  relay: "MRS-L3",
  crew: ["EVA-1 Reza", "EVA-2 Chanio"],
} as const;

/* ---------- Checklists ---------- */

export type ChecklistEntry = { id: string; text: string; time: string };

export const PRE_EVA: ChecklistEntry[] = [
  { id: "pre-1", text: "Suit leak check", time: "T-02:10" },
  { id: "pre-2", text: "HUD to tablet handshake", time: "T-01:50" },
  { id: "pre-3", text: "Relay passes synced to HUD", time: "T-01:30" },
  { id: "pre-4", text: "Route verdict reviewed · CAUTION", time: "T-01:10" },
  { id: "pre-5", text: "Top up O₂ and power", time: "T-00:40" },
  { id: "pre-6", text: "Airlock depress", time: "T-00:15" },
  { id: "pre-7", text: "Buddy check", time: "T-00:05" },
];
export const PRE_EVA_DONE = ["pre-1", "pre-2", "pre-3", "pre-4"];

export const DURING_EVA: ChecklistEntry[] = [
  { id: "eva-1", text: "Egress + HUD link check", time: "00:05" },
  { id: "eva-2", text: "WP1 · Panorama", time: "00:20" },
  { id: "eva-3", text: "WP3 · Core sample", time: "01:05" },
  { id: "eva-4", text: "Consumables check", time: "01:40" },
  { id: "eva-5", text: "WP5 · Regolith scoop", time: "02:10" },
  { id: "eva-6", text: "Ingress", time: "03:05" },
];

export const POST_EVA: ChecklistEntry[] = [
  { id: "post-1", text: "Dust-off and suit doff", time: "+00:10" },
  { id: "post-2", text: "Sample bagging and log", time: "+00:30" },
  { id: "post-3", text: "Suit recharge", time: "+00:45" },
  { id: "post-4", text: "Dose log upload", time: "+00:50" },
  { id: "post-5", text: "Debrief notes", time: "+01:10" },
];
export const POST_EVA_DEBRIEF_DONE = ["post-1", "post-2"];

/* ---------- During-EVA timeline (minutes after 14:00) ---------- */

export type TimelineEvent = {
  label: string;
  start: number;
  /** minutes; comms passes use a fixed chip width instead */
  duration?: number;
  kind: TimelineKind;
};
export type TimelineTrack = { name: string; events: TimelineEvent[] };

export const TIMELINE = {
  startLabel: "14:00",
  endLabel: "18:00",
  minutes: 240,
  tickEvery: 30,
  tracks: [
    {
      name: "EVA-1 · Reza",
      events: [
        { label: "Egress", start: 0, duration: 15, kind: "task" },
        { label: "WP1 pano", start: 20, duration: 20, kind: "task" },
        { label: "WP3 core sample", start: 65, duration: 40, kind: "task" },
        { label: "WP5 scoop", start: 130, duration: 30, kind: "task" },
        { label: "Ingress", start: 185, duration: 15, kind: "task" },
      ],
    },
    {
      name: "EVA-2 · Chanio",
      events: [
        { label: "Egress", start: 0, duration: 15, kind: "task" },
        { label: "WP2 drill", start: 45, duration: 35, kind: "task" },
        { label: "WP4 seismometer", start: 115, duration: 35, kind: "task" },
        { label: "Ingress", start: 185, duration: 15, kind: "task" },
      ],
    },
    {
      name: "Rover",
      events: [
        { label: "Rover to WP3", start: 30, duration: 25, kind: "rover" },
        { label: "Charge stop", start: 150, duration: 35, kind: "rover" },
      ],
    },
    {
      name: "Relay passes",
      events: [
        { label: "MRS-L3", start: 28, kind: "comms" },
        { label: "MRS-L1", start: 95, kind: "comms" },
        { label: "MRS-L3", start: 162, kind: "comms" },
        { label: "MRS-L2", start: 215, kind: "comms" },
      ],
    },
    {
      name: "Hazards",
      events: [
        { label: "Dust gust risk", start: 120, duration: 50, kind: "hazard" },
        { label: "Low-sun glare", start: 200, duration: 40, kind: "hazard" },
      ],
    },
  ] as TimelineTrack[],
};

/* ---------- Route plan ---------- */

export type Waypoint = {
  id: string;
  name: string;
  detail: string;
  status: Status;
  /** dot center on the planner map (1038 x 938) */
  plan?: Point;
};

export const WAYPOINTS: Waypoint[] = [
  { id: "WP1", name: "Lander", detail: "0.00 km · 18.43° N 77.42° E", status: "safe", plan: [130, 640] },
  { id: "WP2", name: "Delta front", detail: "0.46 km · 18.44° N 77.43° E", status: "safe", plan: [250, 520] },
  { id: "WP3", name: "Hollow rim", detail: "0.82 km · 18.44° N 77.45° E", status: "caution", plan: [390, 420] },
  { id: "WP4", name: "Outcrop", detail: "1.61 km · 18.46° N 77.47° E", status: "safe", plan: [580, 330] },
  { id: "WP5", name: "Regolith", detail: "2.38 km · 18.45° N 77.48° E", status: "safe", plan: [650, 540] },
  { id: "WP6", name: "Return", detail: "3.40 km · 18.43° N 77.42° E", status: "safe" },
];

export const PLAN = {
  subtitle: "EVA-07 · 6 stops · synthetic terrain",
  clock: "13:24",
  summary: [
    { label: "Distance", value: "3.40", unit: "km" },
    { label: "Climb", value: "+86", unit: "m" },
    { label: "Max slope", value: "14", unit: "°" },
    { label: "Duration", value: "3 h 10", unit: "min" },
    { label: "Dose rate (quiet)", value: "0.61", unit: "mSv/day" },
    { label: "Relay coverage", value: "71", unit: "% of EVA" },
  ],
  verdict: "CAUTION" as const,
  reasons: [
    "6/6 stops",
    "3 h 10 m of 4 h cap",
    "max slope 14° after reroute",
    "dust gust risk 16:00–16:50",
    "relay covers 71 %",
  ],
  hazard: {
    title: "Slope 24° for 40 m after WP3",
    body: "Exceeds the 20° suit limit",
    action: "Go around via the east bench, +120 m, max 14°",
  },
  route: [
    [130, 640],
    [250, 520],
    [390, 420],
    [470, 450],
    [540, 410],
    [580, 330],
    [650, 540],
    [470, 640],
    [150, 660],
  ] as Point[],
  blocked: [
    [390, 420],
    [580, 330],
  ] as Point[],
  basemap: { width: 12975, left: -8745.15, top: -2140.88 },
  profile: {
    meta: "3.40 km · +86 m · max 14°",
    note: "Dashed red: blocked 24° climb, rerouted east",
    datum: "−2 410 m",
    line: [
      [40, 140],
      [90, 128],
      [140, 120],
      [190, 96],
      [230, 104],
      [270, 84],
      [330, 70],
      [380, 92],
      [430, 110],
      [480, 104],
      [530, 126],
      [600, 140],
    ] as Point[],
    blocked: [
      [190, 96],
      [240, 62],
      [270, 84],
    ] as Point[],
    stops: [
      { label: "WP1", x: 40, y: 140 },
      { label: "WP2", x: 110, y: 124 },
      { label: "WP3", x: 190, y: 96 },
      { label: "WP4", x: 330, y: 70 },
      { label: "WP5", x: 480, y: 104 },
      { label: "WP6", x: 600, y: 140 },
    ],
    axis: [
      { label: "0", x: 36 },
      { label: "0.8", x: 186 },
      { label: "1.6", x: 326 },
      { label: "2.4", x: 476 },
      { label: "3.4 km", x: 576 },
    ],
  },
};

/* ---------- Data layers: stepped cells on a 24 px grid ---------- */

export type LayerId = "slope" | "minerals" | "thermal" | "dose" | "link";

/** Each row: y, x of the first cell, then one class letter per cell (L, M, H). */
const SLOPE_ROWS: [number, number, string][] = [
  [192, 528, "LL"],
  [216, 528, "LLL"],
  [240, 504, "LMMMLLL"],
  [264, 456, "LLMHHMMMML"],
  [288, 432, "LLMMHHHMMML"],
  [312, 456, "LMMHHHMMML"],
  [336, 432, "LLMHHHHHMML"],
  [360, 408, "LLMMHHHHHMMM"],
  [384, 408, "LMMMMHHMMMML"],
  [408, 408, "LMHHMMMMLLL"],
  [432, 408, "MHHHHMMLLLL"],
  [456, 408, "LMMMMMLL"],
  [480, 432, "LLLL"],
];
const SLOPE_COLOR = {
  L: "var(--data-slope-low)",
  M: "var(--data-slope-mid)",
  H: "var(--data-slope-high)",
} as const;

export const SLOPE_CELLS = SLOPE_ROWS.flatMap(([y, x0, classes]) =>
  [...classes].map((c, i) => ({ x: x0 + i * 24, y, color: SLOPE_COLOR[c as keyof typeof SLOPE_COLOR] })),
);

/**
 * Synthetic patches for the layers the Figma frame does not draw. Deterministic
 * value noise, mixed along each layer's own ramp. Not NASA data.
 */
function patch(
  cx: number,
  cy: number,
  radius: number,
  seed: number,
  low: string,
  high: string,
  mid?: string,
) {
  const cells: { x: number; y: number; color: string }[] = [];
  for (let gy = -radius; gy <= radius; gy++) {
    for (let gx = -radius; gx <= radius; gx++) {
      const dist = Math.hypot(gx, gy) / radius;
      const noise = Math.abs(Math.sin((gx + seed) * 12.9898 + (gy - seed) * 78.233) * 43758.5453) % 1;
      if (dist > 0.75 + noise * 0.3) continue;
      const value = Math.max(0, Math.min(1, 1 - dist + (noise - 0.5) * 0.35));
      const stepped = Math.round(value * 4) / 4; // stepped cells, never soft gradients
      const color = mid
        ? stepped < 0.5
          ? `color-mix(in srgb, ${low}, ${mid} ${stepped * 200}%)`
          : `color-mix(in srgb, ${mid}, ${high} ${(stepped - 0.5) * 200}%)`
        : `color-mix(in srgb, ${low}, ${high} ${stepped * 100}%)`;
      cells.push({ x: cx + gx * 24, y: cy + gy * 24, color });
    }
  }
  return cells;
}

export const LAYER_CELLS: Record<Exclude<LayerId, "link">, { x: number; y: number; color: string }[]> = {
  slope: SLOPE_CELLS,
  minerals: patch(264, 384, 4, 3, "var(--data-mineral-low)", "var(--data-mineral-high)"),
  thermal: patch(600, 576, 4, 11, "var(--data-thermal-low)", "var(--data-thermal-high)", "var(--data-thermal-mid)"),
  dose: patch(216, 600, 3, 7, "var(--data-radiation-low)", "var(--data-radiation-high)"),
};

/* ---------- EVA map ---------- */

export const EVA = {
  clock: "15:38",
  subtitle: "T+01:38 of 04:00 cap · EVA-1 Reza",
  tiles: [
    { label: "Distance", value: "1.43", unit: "km", sub: "of 3.40 · 42 %" },
    { label: "EVA time", value: "1:38", unit: "h", sub: "cap 4:00" },
    { label: "Oxygen", value: "78", unit: "%", sub: "≥ 40 at return" },
    { label: "Power", value: "64", unit: "%", sub: "≥ 30 at return" },
    { label: "Dose rate", value: "0.58", unit: "mSv/d", sub: "quiet" },
    { label: "Next stop", value: "4", unit: "min", sub: "WP4 · 180 m" },
  ],
  prediction: [
    { label: "O₂ at return", value: "46", unit: "%" },
    { label: "Return to airlock", value: "17:05", unit: "LMST" },
    { label: "Remaining", value: "1.97", unit: "km" },
    { label: "Slack to cap", value: "+38", unit: "min" },
    { label: "Comms gap ahead", value: "54", unit: "min" },
  ],
  basemap: { width: 12909.09, left: -8907.27, top: -2226.82 },
  walked: [
    [110, 700],
    [210, 590],
    [320, 500],
    [390, 520],
    [430, 470],
  ] as Point[],
  remaining: [
    [430, 470],
    [470, 380],
    [520, 600],
    [360, 690],
    [130, 720],
  ] as Point[],
  markers: [
    { label: "WP1", x: 110, y: 700 },
    { label: "WP2", x: 210, y: 590 },
    { label: "WP3", x: 320, y: 500 },
    { label: "WP4", x: 470, y: 380, next: true },
    { label: "WP5", x: 520, y: 600 },
  ],
  you: { x: 430, y: 470, tag: "You · 1.43 km · heading 032°" },
  buddyTag: { left: 150, top: 560, label: "EVA-2 · WP2 drill" },
  profile: {
    meta: "next: +22 m over 180 m · max 12°",
    walked: [
      [30, 110],
      [80, 100],
      [130, 92],
      [180, 74],
      [230, 80],
      [270, 64],
    ] as Point[],
    ahead: [
      [270, 64],
      [330, 52],
      [390, 70],
      [440, 86],
      [490, 80],
      [550, 100],
      [630, 112],
    ] as Point[],
    nowX: 270,
    nowLabel: "Now · 1.43 km",
  },
  hops: [
    { name: "Tablet → HUD", detail: "mesh · 42 ms", status: "safe" as Status },
    { name: "HUD → relay MRS-L1", detail: "uplink +0.6 dB", status: "caution" as Status },
    { name: "Relay → habitat", detail: "store and forward", status: "safe" as Status },
  ],
  telemetry: [
    { label: "Heart rate", value: "92", unit: "bpm" },
    { label: "Suit pressure", value: "29.6", unit: "kPa" },
    { label: "CO₂ partial", value: "0.4", unit: "kPa" },
    { label: "Outside temp", value: "−58", unit: "°C" },
  ],
  log: [
    { time: "15:38:02", level: "info" as LogLevel, message: "MRS-L1 AOS · el 12°" },
    { time: "15:36:40", level: "info" as LogLevel, message: "Passed 1.40 km" },
    { time: "15:31:15", level: "warn" as LogLevel, message: "Slope 18° ahead, limit 20°" },
    { time: "15:22:09", level: "info" as LogLevel, message: "WP3 core sample logged" },
    { time: "14:41:30", level: "warn" as LogLevel, message: "LOS MRS-L3 · gap 54 min" },
  ],
};

/* ---------- Relay passes (simulated) ---------- */

export type RelayPass = {
  id: string;
  name: string;
  window: string;
  maxElevation: string;
  margin: string;
  state: "in-view" | "next" | "later";
};

export const PASSES_EVA: RelayPass[] = [
  { id: "p1", name: "MRS-L1 · in view", window: "15:35 → 15:44 · 6 min left", maxElevation: "max 29°", margin: "+0.6 dB", state: "in-view" },
  { id: "p2", name: "MRS-L3 · next", window: "16:42 → 16:55 · in 64 min", maxElevation: "max 62°", margin: "+3.1 dB", state: "next" },
];

export const PASSES: RelayPass[] = [
  { id: "p1", name: "MRS-L1 · in view", window: "15:35 → 15:44 · 6 min left", maxElevation: "max 29°", margin: "+0.6 dB", state: "in-view" },
  { id: "p2", name: "MRS-L3", window: "16:42 → 16:55 · 13 min", maxElevation: "max 62°", margin: "+3.1 dB", state: "next" },
  { id: "p3", name: "MRS-L1", window: "17:20 → 17:27 · below θmin", maxElevation: "max 18°", margin: "−0.4 dB", state: "later" },
  { id: "p4", name: "MRS-L2", window: "17:35 → 17:46 · 11 min", maxElevation: "max 44°", margin: "+2.4 dB", state: "later" },
  { id: "p5", name: "MRS-L3", window: "18:51 → 19:03 · 12 min", maxElevation: "max 51°", margin: "+2.7 dB", state: "later" },
];

export const PASS_SUMMARY = [
  { label: "Passes per sol", value: "11" },
  { label: "Usable passes, max el ≥ θmin", value: "9 of 11" },
  { label: "Mean contact", value: "9.8", unit: "min" },
  { label: "Longest gap", value: "54", unit: "min" },
  { label: "Coverage during EVA", value: "71", unit: "%" },
];

/** Contact windows over the next 6 h, in minutes after 15:30 LMST. */
export const CONTACT_WINDOWS = {
  minutes: 360,
  now: 8,
  evaEnds: 95,
  meta: "15:30 → 21:30 LMST · EVA ends 17:05",
  passes: [
    { label: "L1", start: 5 },
    { label: "L3", start: 72 },
    { label: "L1", start: 110 },
    { label: "L2", start: 125 },
    { label: "L3", start: 201 },
    { label: "L4", start: 262 },
    { label: "L2", start: 318 },
  ],
};

/* ---------- Link budget (modelled: UHF 401.6 MHz, relays at 400 km) ---------- */

export const LINK = {
  k: 2.4,
  lambda: 14.8,
  meanElevation: 33.4,
  uplinkThetaMin: 19.9,
  /** Uplink margin shade per 3° wedge from horizon to zenith. null = outage. */
  wedgeShade: [
    null, null, null, null, null, null, null,
    0.276601, 0.305278, 0.331702, 0.356051, 0.378478, 0.399117, 0.418086, 0.435493,
    0.451432, 0.465989, 0.479238, 0.491246, 0.502072, 0.511767, 0.520376, 0.527938,
    0.534486, 0.540049, 0.54465, 0.548308, 0.551039, 0.552853, 0.553759,
  ] as (number | null)[],
  stats: [
    { label: "Shape k", value: "2.40" },
    { label: "Scale λ", value: "14.8", unit: "°" },
    { label: "Mean elevation E[θ]", value: "33.4", unit: "°" },
    { label: "Downlink θmin", value: "12.9", unit: "°" },
    { label: "Downlink outage P_out", value: "13.7", unit: "%" },
    { label: "Uplink θmin", value: "19.9", unit: "°" },
    { label: "Uplink outage P_out", value: "28.5", unit: "%" },
  ],
};

export type BudgetNode = { x: number; icon: "satellite" | "antenna" | "astronaut"; label: string; labelX: number };
export type BudgetStage = {
  label: string;
  labelX: number;
  kind: "gain" | "loss" | "result";
  x: number;
  top: number;
  height: number;
  value?: { text: string; x: number; y: number };
  wick?: { top: number; height: number };
};
export type Budget = {
  title: string;
  grid: { y: number; label: string; labelX: number }[];
  pth: number;
  nodes: BudgetNode[];
  stages: BudgetStage[];
  margin: string;
  lines: string[];
  status: Status;
};

const GRID_TOP = [
  { y: 84, label: "0", labelX: 25 },
  { y: 64, label: "+5", labelX: 18 },
  { y: 44, label: "+10", labelX: 13 },
  { y: 24, label: "+15", labelX: 14 },
  { y: 132, label: "−125", labelX: 6 },
  { y: 164, label: "−129", labelX: 6 },
];

export const BUDGETS: Budget[] = [
  {
    title: "Receive · relay → suit",
    grid: [...GRID_TOP, { y: 196, label: "−133", labelX: 8 }, { y: 228, label: "−137", labelX: 7 }],
    pth: 180,
    nodes: [
      { x: 56, icon: "satellite", label: "Relay", labelX: 39 },
      { x: 316, icon: "antenna", label: "Ant", labelX: 305 },
      { x: 444, icon: "astronaut", label: "Suit", labelX: 432 },
    ],
    stages: [
      { label: "Pt", labelX: 89.5, kind: "gain", x: 84, top: 44, height: 40, value: { text: "+10.0", x: 80, y: 24 } },
      { label: "Gt", labelX: 132, kind: "gain", x: 128, top: 28, height: 16, value: { text: "+4.0", x: 126.5, y: 8 } },
      { label: "FSPL", labelX: 169, kind: "loss", x: 172, top: 28, height: 118.4, value: { text: "−140.8", x: 202, y: 48 }, wick: { top: 132.8, height: 38.4 } },
      { label: "Dust", labelX: 214, kind: "loss", x: 216, top: 146.4, height: 2.4, value: { text: "−0.3", x: 214.5, y: 152.8 }, wick: { top: 147.92, height: 2.32 } },
      { label: "Point", labelX: 257, kind: "loss", x: 260, top: 148.8, height: 8, value: { text: "−1.0", x: 260, y: 160.8 } },
      { label: "Gr", labelX: 348, kind: "gain", x: 344, top: 140.8, height: 16, value: { text: "+2.0", x: 342.5, y: 120.8 } },
      { label: "E[Pr]", labelX: 386, kind: "result", x: 388, top: 148, height: 32, wick: { top: 126.4, height: 40.8 } },
    ],
    margin: "+4.0",
    lines: ["E[Pr] −127.0 dBW", "spread ± 3.4 dB", "Outage 13.7 %"],
    status: "safe",
  },
  {
    title: "Transmit · suit → relay",
    grid: [...GRID_TOP, { y: 228, label: "−137", labelX: 7 }],
    pth: 196,
    nodes: [
      { x: 56, icon: "astronaut", label: "Suit", labelX: 44 },
      { x: 316, icon: "antenna", label: "Ant", labelX: 305 },
      { x: 444, icon: "satellite", label: "Relay", labelX: 427 },
    ],
    stages: [
      { label: "Pt", labelX: 89.5, kind: "gain", x: 84, top: 60, height: 24, value: { text: "+6.0", x: 82.5, y: 40 } },
      { label: "Gt", labelX: 132, kind: "gain", x: 128, top: 52, height: 8, value: { text: "+2.0", x: 126.5, y: 32 } },
      { label: "FSPL", labelX: 169, kind: "loss", x: 172, top: 52, height: 142.4, value: { text: "−140.8", x: 202, y: 72 }, wick: { top: 180.8, height: 38.4 } },
      { label: "Dust", labelX: 214, kind: "loss", x: 216, top: 194.4, height: 2.4, value: { text: "−0.3", x: 214.5, y: 200.8 }, wick: { top: 195.92, height: 2.32 } },
      { label: "Point", labelX: 257, kind: "loss", x: 260, top: 196.8, height: 8, value: { text: "−1.0", x: 260, y: 208.8 } },
      { label: "Gr", labelX: 348, kind: "gain", x: 344, top: 172.8, height: 32, value: { text: "+4.0", x: 342.5, y: 152.8 } },
      { label: "E[Pr]", labelX: 386, kind: "result", x: 388, top: 180, height: 16, wick: { top: 158.4, height: 40.8 } },
    ],
    margin: "+2.0",
    lines: ["E[Pr] −131.0 dBW", "spread ± 3.4 dB", "Outage 28.5 %"],
    status: "caution",
  },
];

/* ---------- Debrief ---------- */

export const DEBRIEF = {
  clock: "17:40",
  subtitle: "14:00 → 17:12 LMST · EVA-1 Reza, EVA-2 Chanio · terrain and dose are synthetic",
  basemap: { width: 13666.67, left: -9320.67, top: -2323.33 },
  planned: [
    [110, 360],
    [210, 280],
    [320, 210],
    [390, 230],
    [450, 200],
    [480, 130],
    [540, 290],
    [380, 360],
    [130, 380],
  ] as Point[],
  walked: [
    [110, 360],
    [205, 284],
    [318, 214],
    [396, 236],
    [452, 196],
    [486, 128],
    [548, 300],
    [470, 330],
    [372, 366],
    [128, 382],
  ] as Point[],
  markers: [
    { label: "WP1", x: 110, y: 360 },
    { label: "WP2", x: 205, y: 284 },
    { label: "WP3", x: 318, y: 214 },
    { label: "WP4", x: 486, y: 128 },
    { label: "WP5", x: 548, y: 300 },
  ],
  tags: [
    { left: 420, top: 232, label: "Detour +120 m around 24° slope after WP3" },
    { left: 500, top: 330, label: "Extra 0.12 km near WP5, sample relocation" },
  ],
  outcome: [
    { label: "Distance", value: "3.52", unit: "km", sub: "+0.12 km vs plan" },
    { label: "Duration", value: "3:12", unit: "h", sub: "+2 min vs plan · cap 4:00" },
    { label: "Oxygen at return", value: "43", unit: "%", sub: "plan ≥ 40 %" },
  ],
  pair: [
    { label: "EVA dose", value: "0.08", unit: "mSv", sub: "quiet sun · forecast 0.08" },
    { label: "Uplink below threshold", value: "7.9", unit: "min", sub: "predicted 9.1 min" },
  ],
  samples: [
    { id: "S-01", name: "Delta mudstone", detail: "WP2 · core 6 cm · 212 g", status: "safe" as Status },
    { id: "S-02", name: "Rim breccia", detail: "WP3 · grab · 148 g", status: "safe" as Status },
    { id: "S-03", name: "Fan outcrop", detail: "WP4 · core 4 cm · 96 g", status: "caution" as Status },
    { id: "S-04", name: "Regolith", detail: "WP5 · scoop · 310 g", status: "safe" as Status },
  ],
  events: [
    { time: "14:04:12", level: "info" as LogLevel, message: "Egress complete" },
    { time: "14:41:30", level: "warn" as LogLevel, message: "LOS MRS-L3, 54 min gap, store and forward" },
    { time: "15:22:09", level: "info" as LogLevel, message: "WP3 core sample logged" },
    { time: "15:31:15", level: "warn" as LogLevel, message: "Slope 18° ahead, limit 20°" },
    { time: "16:12:40", level: "warn" as LogLevel, message: "Dust gust 11 m/s, held at WP5 for 6 min" },
    { time: "17:12:05", level: "info" as LogLevel, message: "Ingress complete, airlock pressurised" },
  ],
};
