// After-EVA debrief: predicted vs "measured" per leg, and a k_suit calibration.
// There is no real suit telemetry, so the measured values are a SIMULATED playback and labelled as such.

export const SIM = { seed: 42, trueKSuit: 1.12, walkNoise: 0.05, stopNoise: 0.03, timeNoise: 0.04 };

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Deterministic playback: a suit that works `trueKSuit` times harder than predicted, plus per-leg noise.
export function simulatePlayback(legs, sim = SIM, kSuitNow = 1) {
  const rnd = mulberry32(sim.seed), n = (w) => 1 + w * (2 * rnd() - 1);
  return legs.map((l) => ({ ...l,
    measWalkO2L: l.walkO2L * (sim.trueKSuit / kSuitNow) * n(sim.walkNoise),
    measStopO2L: l.stopO2L * n(sim.stopNoise), measWalkMin: l.walkMin * n(sim.timeNoise) }));
}

// k_suit that makes predicted walking O2 match the measurement.
export const calibrateKSuit = (rows, kSuitNow = 1) =>
  kSuitNow * rows.reduce((t, r) => t + r.measWalkO2L, 0) / rows.reduce((t, r) => t + r.walkO2L, 0);

// Render into `el`; onApply(k) is called when the crew accepts the calibration.
export function renderDebrief(el, rows, kSuitNow, onApply, onClose) {
  const sum = (k) => rows.reduce((t, r) => t + r[k], 0), k = calibrateKSuit(rows, kSuitNow);
  const td = (v, d = 1) => `<td>${v.toFixed(d)}</td>`;
  el.innerHTML = `
    <button class="close" aria-label="Close debrief">×</button>
    <h2>DEBRIEF</h2>
    <p class="sim">SIMULATED playback: no real suit telemetry exists. The "measured" values come from a seeded
      generator with a hidden k_suit of ${SIM.trueKSuit} and ±${SIM.walkNoise * 100}% noise per leg.</p>
    <table><thead><tr><th>Leg</th><th>Walk O₂ pred</th><th>meas*</th><th>Walk min pred</th><th>meas*</th><th>Stop O₂ pred</th><th>meas*</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${r.from}→${r.to}</td>${td(r.walkO2L)}${td(r.measWalkO2L)}${td(r.walkMin)}${td(r.measWalkMin)}${td(r.stopO2L)}${td(r.measStopO2L)}</tr>`).join('')}
    <tr class="tot"><td>Total</td>${td(sum('walkO2L'))}${td(sum('measWalkO2L'))}${td(sum('walkMin'))}${td(sum('measWalkMin'))}${td(sum('stopO2L'))}${td(sum('measStopO2L'))}</tr></tbody></table>
    <p>Walking used ${((sum('measWalkO2L') / sum('walkO2L') - 1) * 100).toFixed(0)}% more oxygen than predicted.
      Calibrated k_suit: <b>${k.toFixed(3)}</b> (now ${kSuitNow.toFixed(3)}).</p>
    <button class="apply">Apply k_suit to the next plan</button>`;
  el.querySelector('.apply').onclick = () => onApply(k);
  el.querySelector('.close').onclick = onClose;
  el.hidden = false;
}
