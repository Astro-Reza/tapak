/**
 * EVA checklists, transcribed from the "EVA checklist" Google Sheet
 * (tabs: Pre-EVA, Post-EVA, Hold criteria), snapshot of 14 Nov 2026.
 * Source: Marswalk, Mars EVA Variable Taxonomy and From Data to Decision.
 *
 * The sheet is the source of truth. Item ids are positional
 * (`<list>-<block>.<row>`), so re-export the whole tab when rows move.
 */

/** Who closes the item. See OWNER_KEY. */
export type ChecklistOwner = "Auto" | "Auto+" | "Crew" | "IV" | "Med" | "Suit";

export const OWNER_KEY: Record<ChecklistOwner, string> = {
  Auto: "Marswalk computes from map layers",
  "Auto+": "Marswalk with added public data or a mission rule",
  Crew: "EV crew",
  IV: "Habitat crew",
  Med: "Crew medical officer",
  Suit: "Suit telemetry or hands-on check",
};

export type ChecklistItem = {
  id: string;
  /** Short name of the step (sheet column "Item") */
  title: string;
  /** Pass condition (sheet column "Check / threshold") */
  detail?: string;
  /** Taxonomy variable codes, e.g. EB12; empty when the sheet shows a dash */
  codes: string[];
  owner?: ChecklistOwner;
  /** Free right-hand label for lists without owner, e.g. a clock time */
  tag?: string;
};

export type ChecklistBlock = {
  id: string;
  title: string;
  /** Time window (sheet column "When") */
  when?: string;
  items: ChecklistItem[];
};

export type ChecklistId = "pre" | "post";

type Row = [codes: string, title: string, detail: string, owner: ChecklistOwner];

function build(list: ChecklistId, blocks: [title: string, when: string, rows: Row[]][]): ChecklistBlock[] {
  return blocks.map(([title, when, rows], b) => ({
    id: `${list}-${b + 1}`,
    title,
    when,
    items: rows.map(([codes, itemTitle, detail, owner], r) => ({
      id: `${list}-${b + 1}.${r + 1}`,
      title: itemTitle,
      detail,
      codes: codes ? codes.split(", ") : [],
      owner,
    })),
  }));
}

/** Pre-EVA checklist (T−24 h to hatch open): 41 items in 7 blocks. */
export const PRE_EVA_BLOCKS: ChecklistBlock[] = build("pre", [
  [
    "Plan and route",
    "T−24 h",
    [
      ["EB1", "Objectives and timeline", "Tasks, stops and durations set; timeline padded (Apollo 15/16 tasks ran ~70% longer than in training)", "Auto+"],
      ["EB2", "Route geometry", "Distance, elevation gain/loss and max slope inside the suit slope limit; uphill and downhill costed separately", "Auto"],
      ["EB12", "Walkback limit", "Every point on the route within walkback distance of the habitat (10 km, Apollo-derived) if the rover fails", "Auto"],
      ["ED28, EB14", "Terrain hazards and map quality", "Crater rims, scarps, sand traps flagged; segments below HiRISE resolution (~25–30 cm/px) marked low-confidence", "Auto"],
      ["ED4, ED5", "Rocks and footing", "Rock abundance and thermal-inertia soft-ground proxy reviewed along the route", "Auto"],
      ["ED29", "No-go zones", "Route clear of planetary-protection special regions", "Auto+"],
      ["EB15", "Lighting plan", "Sun elevation, sunset and shadow maps for the EVA window; no stop in deep shadow", "Auto+"],
      ["EB11", "Planned load", "Tool and sample mass entered so the load term is in the energy budget", "Crew"],
    ],
  ],
  [
    "Environment go/no-go",
    "T−12 h, refresh T−1 h",
    [
      ["EB3", "Dust opacity forecast", "Optical depth below the mission limit; watch Ls ~140–180° storm season", "Auto+"],
      ["EB4", "Thermal window", "Start time placed against the diurnal cycle (ground 150–300 K); no cold-soak at the far stop", "Auto+"],
      ["EB5", "Space weather", "No SPE warning; shelter reachable from every stop within the mission rule", "IV"],
      ["ED13", "Planned dose", "GCR 0.56–0.65 mSv/day × hours outside fits the crew member's remaining dose budget (IB14)", "Auto"],
    ],
  ],
  [
    "Crew readiness",
    "T−12 h to T−2 h",
    [
      ["IB1", "Aerobic capacity", "Latest VO2peak at or above the NASA partial-g EVA standard of 36.5 mL/kg/min", "Med"],
      ["IB5", "Sensorimotor state", "Days since landing logged; balance and gait test passed (deficit largest in first hours, marked gains within 24 h)", "Med"],
      ["IB3, IB4", "Muscle and bone", "Post-transit strength and bone density on file; load and slope limits lowered if needed", "Med"],
      ["IB6", "Orthostatic tolerance", "Stand test without dizziness", "Med"],
      ["IB9", "Sleep and circadian phase", "No sleep debt; schedule aligned to the 24.65 h sol", "Crew"],
      ["IB7, IB8", "Hydration and nutrition", "Urine specific gravity and body mass normal; pre-EVA meal taken", "Crew"],
      ["IB11, IB16", "Injury and acute health", "No new pain (shoulder, hand, back), illness or sedating medication", "Med"],
      ["IB17", "Hypoxia check", "SpO2 normal in the 8.2 psia / 34% O2 cabin", "Med"],
      ["IB13", "Psychological state", "Crew member and buddy report ready; no unresolved crew conflict", "Crew"],
      ["IB12", "Familiarity", "Route and tasks rehearsed; first EVA on this terrain flagged for slower pacing", "Crew"],
    ],
  ],
  [
    "Suit and consumables",
    "T−4 h",
    [
      ["EA10", "Carry-over from last EVA", "Last post-EVA suit inspection closed out; no open seal or glove defects", "Suit"],
      ["EB8", "Fit", "Suit sized for this crew member; pressure points and glove fit checked", "Suit"],
      ["EB9", "Suit + PLSS mass and CG", "Actual mass entered (Mars weight = 0.38 × mass; inertia stays full)", "Auto+"],
      ["EB10", "Consumables loadout", "O2, CO2 removal, water and battery full; planned EVA plus walkback fits the design limit (up to 8 h)", "Suit"],
      ["ED22", "CO2 sensor", "Reading live and below the 3.8 mmHg design average", "Suit"],
      ["ED23", "Cooling garment", "Loop flowing; heat-storage limit 1.9–3.0 kJ/kg set in the alert model", "Suit"],
      ["ED24, ED25", "Displays", "HUD or tablet readable with pressurised gloves", "Crew"],
      ["", "Leak check", "Suit holds operating pressure before depress", "Suit"],
    ],
  ],
  [
    "Prebreathe and DCS",
    "T−1 h",
    [
      ["EB6", "Cabin atmosphere", "Habitat at 8.2 psia / 34% O2 (prebreathe ~0–30 min, vs 6.5–7 h from 14.7 psia)", "IV"],
      ["EB7", "Suit pressure and O2", "~4.3 psi, 85–100% O2", "Suit"],
      ["IB10", "DCS risk", "Model risk accepted (8.4% for 15-min prebreathe + 6 h at 4.3 psi; up to 10.9% for 8 h); prebreathe timer complete", "Auto+"],
    ],
  ],
  [
    "Communications and support",
    "T−1 h",
    [
      ["ED16", "Line of sight", "Viewshed shows where voice/data to the habitat drops; relay placed or blind segments accepted", "Auto"],
      ["EB13, ED17", "Earth link", "One-way delay (~3–22 min) noted; habitat crew holds real-time support; no solar conjunction blackout", "Auto+"],
      ["EB16", "Buddy and IV staffing", "Buddy assigned with a maximum separation; IV crew on console for the full EVA", "IV"],
      ["ED26", "Rover", "Rover position and status known if used to shorten return time", "IV"],
    ],
  ],
  [
    "GO/NO-GO",
    "Hatch open",
    [
      ["", "Marswalk verdict", "Verdict shows GO, or CAUTION accepted by EV crew and IV lead", "Auto"],
      ["ED18, ED27", "Turn-back time", "Clock time set at which return starts, whatever the task state", "Auto"],
      ["", "Abort triggers", "Abort triggers briefed (see Hold criteria)", "IV"],
      ["", "Pre-EVA baselines", "Heart rate, PVT reaction time, body mass, fatigue and soreness scores recorded", "Med"],
    ],
  ],
]);

/** Post-EVA checklist (hatch close to T+48 h): 26 items in 6 blocks. */
export const POST_EVA_BLOCKS: ChecklistBlock[] = build("post", [
  [
    "Ingress and dust control",
    "T+0 to T+1 h",
    [
      ["ED12, EA1", "Dust off before doffing", "Suit brushed or vacuumed in the airlock; particle counter running (peaks come at suit ingress)", "Crew"],
      ["EA1", "Habitat dust level", "Respirable dust (<10 µm) on track for the 24 h average limit of 0.1 mg/m³", "IV"],
      ["EA4", "Samples bagged", "Sealed and labelled for perchlorate and toxic-element handling (Cr, Co, Ni) before entering the cabin", "Crew"],
      ["IA5", "Exposure check", "No eye, skin or airway irritation after doffing", "Med"],
    ],
  ],
  [
    "Immediate medical",
    "T+0 to T+2 h",
    [
      ["EA5, IA4", "Repress and DCS watch", "Repress from ~4.3 psi to 8.2 psia logged; DCS symptom check at repress and at end of watch window (mission rule)", "Med"],
      ["IA2", "Injury report", "Falls, abrasions, hand and shoulder pain logged with severity: first aid, medical attention, lost duty time", "Med"],
      ["", "Hydration", "Post-EVA body mass and urine output vs pre-EVA baseline; rehydrate against the 240 mL/h EVA fluid need", "Med"],
      ["", "Heat strain", "Core temperature and heart rate returning to baseline; peak heat storage reviewed against 3.0 kJ/kg", "Auto+"],
    ],
  ],
  [
    "Suit and consumables",
    "T+1 to T+6 h",
    [
      ["EA10", "Suit and glove damage", "Visual inspection of seals, bearings, visor and gloves; leak check", "Suit"],
      ["EA2", "Cleaning and maintenance", "Turnaround task list opened; estimated time to suit-ready logged", "Suit"],
      ["EA3", "Consumables recharge", "O2, water, battery and CO2 sorbent recharged; actual use per hour recorded to calibrate the metabolic model", "Suit"],
    ],
  ],
  [
    "Data, map and dose",
    "T+1 to T+12 h",
    [
      ["EA7", "Dose ledger", "EVA dose added to each crew member's mission total (surface ~0.6 mSv/day vs cruise ~1.8 mSv/day)", "Auto"],
      ["EA8", "As-walked map", "Actual track, new hazards and footing notes uploaded; DTM blind spots corrected for the next route", "Crew"],
      ["", "Planned vs actual", "Time, distance, metabolic rate and consumables compared with the plan; variance fed back to the planner", "Auto"],
      ["EA6", "Earth package", "Telemetry and notes sent; review expected after 2 × one-way delay plus analysis time", "IV"],
    ],
  ],
  [
    "Crew recovery and cognition",
    "T+2 h to T+48 h",
    [
      ["", "Physical and mental fatigue", "0–10 scores vs pre-EVA", "Crew"],
      ["", "PVT and working memory", "Short battery vs pre-EVA baseline", "Crew"],
      ["", "Recovery time to baseline", "Hours until resting heart rate, respiration and temperature return to pre-EVA levels (wearable)", "Med"],
      ["IA3", "DOMS", "Soreness score at 24 h and 48 h, especially after long downhill segments", "Crew"],
      ["", "Sleep", "Duration and efficiency on the night after the EVA (actigraphy)", "Crew"],
      ["", "Debrief", "Stress, perceived success, what slowed the crew; route or HUD changes captured", "Crew"],
    ],
  ],
  [
    "Readiness for next EVA",
    "T+24 h to T+48 h",
    [
      ["IA1", "Cumulative fatigue", "Fatigue, soreness and sleep back near baseline", "Med"],
      ["EA9", "Cadence", "Time to next EVA fits recovery and the crew-week budget (NASA plans up to 24 h EVA per crew-week)", "Auto+"],
      ["", "Suit ready", "EA2, EA3 and EA10 closed", "Suit"],
      ["", "Dose budget", "Remaining budget covers the next planned EVA", "Auto"],
      ["", "Next Pre-EVA baselines", "Injuries, fatigue and dose carried into the next crew-readiness block", "Med"],
    ],
  ],
]);

/* ---------- Hold and abort criteria ---------- */

/** How firm the limit is: sourced from a standard, needs a margin, or needs a mission rule. */
export type HoldStatus = "sourced" | "margin" | "rule";

export type HoldCriterion = {
  id: string;
  title: string;
  codes: string[];
  limit: string;
  status: HoldStatus;
  /** Sheet column "Source status", verbatim */
  source: string;
};

/** Four limits are sourced, two need a margin, six need a mission rule. */
export const HOLD_CRITERIA: HoldCriterion[] = [
  { id: "hold-aerobic", title: "Aerobic capacity", codes: ["IB1"], limit: "VO2peak ≥ 36.5 mL/kg/min", status: "sourced", source: "Sourced (NASA partial-g EVA standard)" },
  { id: "hold-heat", title: "Body heat storage", codes: ["ED23"], limit: "Alert at 1.9 kJ/kg, abort at 3.0 kJ/kg", status: "sourced", source: "Sourced (NASA-STD-3001)" },
  { id: "hold-co2", title: "Suit CO2", codes: ["ED22"], limit: "3.8 mmHg design average; headaches reported at 2.8–4.5 mmHg", status: "margin", source: "Sourced; abort level is a mission rule" },
  { id: "hold-dust", title: "Habitat dust", codes: ["EA1"], limit: "0.1 mg/m³, 24 h average, <10 µm", status: "sourced", source: "Sourced (NASA, July 2026)" },
  { id: "hold-walkback", title: "Walkback distance", codes: ["EB12", "ED18"], limit: "10 km from habitat without rover", status: "sourced", source: "Sourced (Apollo-derived assumption)" },
  { id: "hold-consumables", title: "Consumables", codes: ["EB10", "ED20"], limit: "Remaining time = min(O2, water, power ÷ use rate) must exceed return time", status: "margin", source: "Formula sourced; margin is a mission rule" },
  { id: "hold-slope", title: "Suit slope limit", codes: ["EB2", "ED2"], limit: "Prototype default 16°", status: "rule", source: "Mission rule (planning choice)" },
  { id: "hold-opacity", title: "Dust opacity", codes: ["EB3", "ED11"], limit: "Prototype default tau 0.8", status: "rule", source: "Mission rule" },
  { id: "hold-spe", title: "SPE shelter reach", codes: ["EB5", "ED14"], limit: "Time from any stop to shelter", status: "rule", source: "Mission rule" },
  { id: "hold-dose", title: "Per-EVA dose", codes: ["ED13", "EA7"], limit: "Share of crew dose budget", status: "rule", source: "Mission rule" },
  { id: "hold-buddy", title: "Buddy separation", codes: ["EB16"], limit: "Maximum distance between EV crew", status: "rule", source: "Mission rule" },
  { id: "hold-dcs", title: "DCS watch window", codes: ["EA5"], limit: "Hours of symptom watch after repress", status: "rule", source: "Mission rule" },
];

/* ---------- Selectors ---------- */

export const CHECKLISTS: Record<ChecklistId, ChecklistBlock[]> = {
  pre: PRE_EVA_BLOCKS,
  post: POST_EVA_BLOCKS,
};

export function flattenBlocks(blocks: ChecklistBlock[]): ChecklistItem[] {
  return blocks.flatMap((block) => block.items);
}

export type Progress = { done: number; total: number };

export function progressOf(items: ChecklistItem[], done: ReadonlySet<string>): Progress {
  return { done: items.filter((item) => done.has(item.id)).length, total: items.length };
}

/** First open item in reading order: the step the crew is on. */
export function nextOpenItem(blocks: ChecklistBlock[], done: ReadonlySet<string>): ChecklistItem | undefined {
  return flattenBlocks(blocks).find((item) => !done.has(item.id));
}

/** Open items grouped by who has to close them. */
export function openByOwner(
  blocks: ChecklistBlock[],
  done: ReadonlySet<string>,
): Partial<Record<ChecklistOwner, ChecklistItem[]>> {
  const out: Partial<Record<ChecklistOwner, ChecklistItem[]>> = {};
  for (const item of flattenBlocks(blocks)) {
    if (!item.owner || done.has(item.id)) continue;
    (out[item.owner] ??= []).push(item);
  }
  return out;
}

/** Hold criteria that share a variable code with the item, e.g. EB12 -> walkback distance. */
export function holdCriteriaFor(item: ChecklistItem): HoldCriterion[] {
  return HOLD_CRITERIA.filter((criterion) => criterion.codes.some((code) => item.codes.includes(code)));
}
