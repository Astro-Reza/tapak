/**
 * Types for the Marswalk science engine (src/engine/*.js).
 *
 * UNITS (engine convention, never mixed):
 *   distance and coordinates: metres (x east, z south, y elevation above the Mars datum)
 *   time: minutes from EVA start (Earth minutes); LMST in Mars hours
 *   oxygen: litres at STP; power: W; energy: J
 *   dose: mSv (dose equivalent); slope: degrees; grade: rise / run
 *   pressure: Pa; temperature: K in weather records
 */

export interface Grid {
  rows: number;
  cols: number;
  /** cell size in metres [x, z] */
  cell: [number, number];
  x0: number;
  z0: number;
  elev: Float32Array;
  slope: Float32Array;
  sky?: Float32Array;
  rough?: Float32Array;
  roughM?: Float32Array;
}

export interface Photo { id: string; sol: number; bearing: number; elev: number; url: string; full: string; credit: string }
export interface Stop { id: string; xz: [number, number]; elev: number; lat: number; lon: number; sols: number[]; photos?: Photo[] }

export interface WeatherHour {
  lmst_hour: number;
  air_K?: { median: number };
  ground_K?: { median: number };
  pressure_Pa?: { median: number };
}

export interface Suit {
  bodyKg: number;
  suitKg: number;
  o2CapacityL: number;
  /** m/min on flat ground */
  walkSpeed: number;
  maxSlopeDeg: number;
  cautionSlopeDeg: number;
  reserveFactor: number;
  reserveFrac: number;
  kSuit: number;
  dwellMin: number;
  /** ml/kg/min */
  stationVO2: number;
  evaLimitMin: number;
}

export interface PathPoint { x: number; z: number; y: number; slope: number; sky: number; cell: number; dwell?: number }
export interface ProfileSample extends PathPoint {
  i: number;
  /** minutes */
  t: number;
  /** litres used so far */
  o2: number;
  /** metres walked so far */
  dist: number;
  /** mSv so far */
  dose: number;
}
export interface Leg { from: string; to: string; startIdx: number }
export interface Plan { path: PathPoint[]; legs: Leg[]; error?: string }
export interface WalkBack { ok: boolean; minMarginL: number; worstIdx: number }
export interface PlanRow {
  km: number; walkMin: number; stopMin: number; o2LeftL: number; o2LeftPct: number; doseMSv: number;
  targets: number; targetsOf: number; Q: number; flatPaceMin: number;
}
export type Verdict = "GO" | "CAUTION" | "NO-GO";

export interface Evaluation {
  plan: Plan;
  error?: string;
  prof?: ProfileSample[];
  end?: ProfileSample;
  wb?: WalkBack;
  row?: PlanRow;
  go: boolean;
  reasons: string[];
  cautions: string[];
  verdict: Verdict;
  /** straight-line km, furthest point from the start */
  maxFromStartKm: number;
  maxSlope: number;
}

export interface ReturnField { cost: Float64Array; start: number }

export interface ProfileDef<P> { label: string; params: P; source: Record<keyof P & string, string> }
export type ScienceId = "app-60kg" | "app-50kg" | "model-40kg";
export type PolicyId = "engine" | "hold-sheet";
export interface PolicyParams {
  maxSlopeDeg: number; cautionSlopeDeg: number; reserveFrac: number; reserveFactor: number; evaLimitMin: number;
  walkbackMaxKm: number | null;
}
export const SCIENCE_PROFILES: Record<ScienceId, ProfileDef<{ suitKg: number }>>;
export const POLICY_PROFILES: Record<PolicyId, ProfileDef<PolicyParams>>;
export const DEFAULT_SCIENCE: ScienceId;
export const DEFAULT_POLICY: PolicyId;
export function suitFor(scienceId?: ScienceId, policyId?: PolicyId, extra?: Partial<Suit>): Suit;

export interface MissionData { grid: Grid; stops: Stop[]; hourly: WeatherHour[]; refElev: number }
export interface Env { hourly: WeatherHour[]; startLmst: number; refElev: number }
export type ModelKey = "acsmScaled" | "pandolfSantee" | "minetti";
export type Mode = "efficient" | "balanced" | "safest";
export interface MissionOptions {
  scienceId?: ScienceId; policyId?: PolicyId; startLmst?: number; kSuit?: number; modelKey?: ModelKey; o2CapacityL?: number;
}
export interface MissionResult {
  s: Suit;
  env: Env;
  field: ReturnField;
  modes: Record<Mode, Evaluation>;
  policy: ProfileDef<PolicyParams>;
  planSlider(t: number): Evaluation;
}
export const MODES: Mode[];
export function planMission(data: MissionData, opts?: MissionOptions): MissionResult;
export function verdictOf(reasons: string[], cautions: string[]): Verdict;

export const SUIT: Suit;
export const MARS_G: number;
export const RADIATION: { refUGyDay: number; refPressurePa: number; quality: number; phiMV: number; source: string };
/** mSv/day at surface pressure (Pa) and sky-view fraction */
export function doseRate(pressurePa: number, sky?: number): number;
export function weatherAt(hourly: WeatherHour[], lmst: number): { lmst: number; airK?: number; groundK?: number; pressurePa?: number };
export function envAt(env: Env | null, t: number, y: number): { pressurePa: number; lmst?: number; airK?: number; groundK?: number };
export function speedAt(slopeDeg: number, s?: Suit): number;
export function stationLpm(s?: Suit): number;

export interface Status {
  minutes: number; distM: number; evaLeftMin: number; o2LeftL: number; o2Pct: number; homeO2L: number; homeMin: number;
  reserveRatio: number; level: "nominal" | "caution" | "return"; doseMSv: number; slope: number;
  lmst?: number; airC: number | null; groundC: number | null; pressurePa: number; sky: number; doseRateUSvH: number;
  notes: string[]; slopeLevel: "ok" | "caution" | "no-go";
}
export function status(now: ProfileSample, end: ProfileSample, s?: Suit, env?: Env | null): Status;
export const MESSAGES: Record<Status["level"], string>;

export function returnField(g: Grid, startXZ: [number, number], s?: Suit, model?: string | null): ReturnField;
export function ringCells(g: Grid, field: ReturnField, o2LeftL: number, s?: Suit): number[];
export function reserveL(s?: Suit): number;
export function toCell(g: Grid, x: number, z: number): [number, number];
export function cellXZ(g: Grid, r: number, c: number): [number, number];

export const MODEL_NAMES: Record<ModelKey, string>;
export const DEFAULT_MODEL: ModelKey;
export const DAYLIGHT: [number, number];
export const COLD_GROUND_K: number;
export function windowOptions(hourly: WeatherHour[], durationMin: number, from?: number, to?: number): {
  opts: { hour: number; groundMinC: number; groundMaxC: number }[];
  best: number | null;
};
export interface LegO2 { from: string; to: string; walkO2L: number; walkMin: number; stopO2L: number; stopMin: number }
export function legBreakdown(plan: Plan, prof: ProfileSample[], s?: Suit): LegO2[];

export const SIM: { seed: number; trueKSuit: number; walkNoise: number; stopNoise: number; timeNoise: number };
export interface PlaybackRow extends LegO2 { measWalkO2L: number; measStopO2L: number; measWalkMin: number }
export function simulatePlayback(legs: LegO2[], sim?: typeof SIM, kSuitNow?: number): PlaybackRow[];
export function calibrateKSuit(rows: PlaybackRow[], kSuitNow?: number): number;

export type LinkType = "plan" | "status" | "alert" | "ack";
export interface LinkMessage { type: LinkType; payload: unknown; from: string; sentAt: number; deliverAt: number }
export interface Link { readonly delayS: number; setDelay(s: number): void; send(type: LinkType, payload: unknown): void; close(): void }
export const DEFAULT_DELAY_S: number;
export function createLink(opts: {
  role: string; onMessage: (m: LinkMessage) => void; name?: string; now?: () => number;
  /** base URL of a sync/relay.js mailbox, to reach other devices (the Marswalk AR phone app) */
  relay?: string | null; fetchFn?: typeof fetch; onRelay?: (online: boolean) => void;
}): Link;
export function createRelay(opts?: { now?: () => number }): (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => boolean;

export interface Recipe {
  v: 1; mode: Mode | "slider"; sliderT: number; modelKey: ModelKey; startLmst: number; kSuit: number; o2CapacityL: number;
  summary: { km: number; o2L: number } | null;
}
export function validatePlan(p: unknown): Recipe;
export function encodePlan(p: Recipe): string;
export function decodePlan(s: string): Recipe;
export function summaryMatches(a: Recipe["summary"], b: Recipe["summary"]): boolean;

export interface Sample {
  k: number; dwelling: boolean; dwellFrac?: number; x: number; z: number; y: number; t: number; dose: number; sky: number;
  /** litres used so far */
  o2: number; dist: number; slope: number;
  /** L/min at this moment */
  rate: number;
}
/** Position and consumables at EVA minute T (interpolated along the profile). */
export function sampleAt(prof: ProfileSample[], T: number, s?: Suit): Sample;
/** O2 litres spare above the walk-back reserve at `now` */
export function walkBackMargin(grid: Grid, field: ReturnField, now: { x: number; z: number; o2: number }, s?: Suit): number;
