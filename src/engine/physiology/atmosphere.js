// Suit atmosphere. No rendering code. No live sensors exist: pressure and O2 fraction are ASSUMED set-points,
// partial pressures are DERIVED from them, CO2 is an EXPERIMENTAL EMU reference regression.
import { value } from './catalog.js';
import { kpaFromPsi, mmhgFromKpa, WATER_VAPOUR_37C_MMHG, btuhFromKjh, kjhFromWatts } from './units.js';

const EMU = value('suit.pressure_emu').value; // 4.3 psia, FIO2 1.0 (NASA-STD-3001 V2 Rev F p.50)
export const SUIT_SETPOINT = { pressureKPa: kpaFromPsi(EMU.psia), fio2: EMU.fio2, source: 'suit.pressure_emu' };

/** ppO2 and PIO2 (mmHg) at a suit pressure and O2 fraction; PIO2 = (PB - 47) x FIO2 (OCHMO-TB-050 p.4). */
export function oxygenPartialPressures(pressureKPa = SUIT_SETPOINT.pressureKPa, fio2 = SUIT_SETPOINT.fio2) {
  if (!(pressureKPa > 0) || !(fio2 > 0 && fio2 <= 1)) throw new Error('bad suit pressure or FIO2');
  const pb = mmhgFromKpa(pressureKPa);
  const pio2 = Math.max(0, (pb - WATER_VAPOUR_37C_MMHG) * fio2);
  const r = value('atm.pio2_ranges').value;
  const band = pio2 < r.mildHypoxiaLowerMmHg ? 'below the mild-hypoxia lower limit'
    : pio2 <= r.normoxiaTargetMmHg[1] && pio2 >= r.normoxiaTargetMmHg[0] ? 'normoxia target range'
      : pio2 <= r.indefiniteHyperoxiaUpperMmHg ? 'within the indefinite-exposure range'
        : 'above the indefinite hyperoxia limit';
  return { ppO2: pb * fio2, pio2, band };
}

/** EMU heritage ppCO2 (mmHg) at a metabolic rate: MR(BTU/h) x 0.0047 + 0.65 (Rev F [V2 11039] rationale, p.234). */
export function ppco2EmuReference(metabolicW) {
  const { coefficientMmHgPerBtuH: k, residualMmHg: r } = value('atm.ppco2_emu_regression').value;
  return btuhFromKjh(kjhFromWatts(metabolicW)) * k + r;
}
