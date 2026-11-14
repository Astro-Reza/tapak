// Unit conversions used by the physiology modules. No rendering code.
import { J_PER_L_O2 } from '../models/oxygen.js';

export const KJ_PER_BTU = 1.05506;             // International Table BTU
export const KPA_PER_PSI = 6.894757;
export const MMHG_PER_KPA = 7.500617;
export const WATER_VAPOUR_37C_MMHG = 47;       // PIO2 = (PB - 47) x FIO2 (OCHMO-TB-050 p.4)

/** mL O2 per kg body mass per min -> L/min for a body mass (Norcross 2010 p.10 normalisation) */
export const lpmFromMlKgMin = (mlKgMin, bodyKg) => (mlKgMin * bodyKg) / 1000;
export const mlKgMinFromLpm = (lpm, bodyKg) => (lpm * 1000) / bodyKg;
/** O2 L/min <-> metabolic W, with the engine's energy equivalent (20 100 J/L, oxygen.js) */
export const wattsFromLpm = (lpm) => (lpm * J_PER_L_O2) / 60;
export const lpmFromWatts = (w) => (w * 60) / J_PER_L_O2;
export const kjhFromWatts = (w) => w * 3.6;
export const btuhFromKjh = (kjh) => kjh / KJ_PER_BTU;
export const kpaFromPsi = (psi) => psi * KPA_PER_PSI;
export const mmhgFromKpa = (kpa) => kpa * MMHG_PER_KPA;
