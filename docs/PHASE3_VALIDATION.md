# Phase 3 validation report

Branch `feat/astronaut-physiology`, 14 Nov 2026. `npm test` runs `src/engine/test.mjs` (original engine),
`integration.test.mjs` (Phase 2) and `physiology.test.mjs` (Phase 3). **All pass.** `npm run build` passes.

| # | Check | Result |
| --- | --- | --- |
| 1 | **Units and reference conditions** | Chappell Table 4 kcal/h reconciles only per kg **body** mass (80.7 kg), implying 4.82 kcal/L O₂; body+suit normalisation is rejected. Engine 20 100 J/L is within 0.4 %. Rev F envelope 528-2220 kJ/h = 500-2100 BTU/h. EMU 4.3 psia, 100 % O₂ → ppO₂ **222**, PIO₂ **175** mmHg (Rev F p.50 states 222 / 175) |
| 2 | **Activity catalog** | Exact Table 4 values (3.9 / 15.4 / 13.2 / 17.0 / 18.1 mL/kg/min) with citations; unknown activities throw; every catalog value has a permitted use |
| 3 | **Regression vs Phase 2** | Physiology "engine" mode O₂ = Phase 2 **126.6 L** (to 1e-9 L); the analytic WorkloadSource reproduces it (to 1e-6 L); timeline contiguous and covers the whole EVA; `planMission()` output unchanged |
| 4 | **Activity-specific O₂** | Engine walking + analog light-work stops (13.2 mL/kg/min): **215.9 L (57 % of tank)** vs engine 126.6 L (34 %). Not applied to the plan: needs a team decision |
| 5 | **Plausibility** | Modelled rates 495-1473 kJ/h vs Apollo lunar surface EVA 517-2607 kJ/h (OCHMO-TB-050 p.6). The engine's downhill walking (495 kJ/h) is 4 % **below** the Apollo minimum: the ACSM model gives no downhill cost |
| 6 | **Thermal energy conservation** | Balanced production/removal → 0; 100 W surplus × 1 h at 80 kg → 4.5 kJ/kg; additive over intervals; net cooling negative; missing removal → error (no default) |
| 7 | **Heart-rate limits** | Unavailable without an individual calibration; exact inverse of MR = a + b·HR inside the calibrated range; unavailable outside it or with an invalid/unsourced calibration |
| 8 | **Kinesis compatibility** | Today: not ready, with reasons (40 kg vs 50 kg suit, 5 % roughness coverage, not validated, no absolute calibration). Disabled source throws, so the selector uses the analytic model. With all checks passing, walking comes from Kinesis and stops from the engine: total = walking + stops, one row per segment (no double counting) |
| 9 | **Invalid / missing sensors** | Null frame → nothing accepted; NaN, out-of-range, non-numeric and stale (> 10 s) values rejected with reasons; a bad pressure falls back to the ASSUMED set-point; a valid HR becomes MEASURED; with no sensors, nothing is MEASURED |
| 10 | **Uncertainty / sensitivity** | Table 4 reports no uncertainty, so sourced inputs are varied instead. IST-2 body-mass range 68.2 / 80.7 / 86.4 kg → analog O₂ 188 / 218 / 231 L. Model choice: 127 L (engine) vs 216 L (analog stops) |
| 11 | **Module separation** | No physiology module imports mission policy; biomechanics (`workload.js`) does not import crew status |
| 12 | **React UI integration** | `tsc` strict passes. In a headless browser at 1366×1024 the EVA Map renders the card with a provenance tag on every row and no console errors (screenshots in `docs/screenshots/phase3/`). The repo has no component-test framework; adding one is a follow-up |

## Status readout at T = 60 min (efficient plan, default profiles)

| Reading | Value | Provenance |
| --- | --- | --- |
| Activity | Science stop | SIMULATED (plan playback) |
| Metabolic rate | 675 kJ/h | MODELLED |
| O₂ uptake | 0.56 L/min | MODELLED |
| O₂ remaining (metabolic only) | 90 % | MODELLED |
| O₂ remaining, analog activity rates | 83 % | MODELLED · EXPERIMENTAL |
| Energy used | 783 kJ | MODELLED |
| Workload | 14 % VO₂peak | DERIVED · EXPERIMENTAL (VO₂peak ASSUMED) |
| Heat production | 675 kJ/h | MODELLED |
| Heat storage | — | UNAVAILABLE |
| Heart rate | — | UNAVAILABLE |
| Suit pressure | 29.6 kPa | ASSUMED |
| ppO₂ / PIO₂ | 222 / 175 mmHg | DERIVED |
| ppCO₂ (EMU reference) | 3.7 mmHg | MODELLED · EXPERIMENTAL |

## Known limitations

- All activity rates are **lunar-analog** (0.17 g, MKIII, six male subjects). Mars (0.38 g) is outside the tested range.
- No live suit telemetry exists; the walk itself is a simulated playback of the plan.
- O₂ remaining excludes leakage and purge (no verified Mars-suit value).
- Heat storage requires 41-Node Man/Wissler, which is not implemented.
- The ppCO₂ value is the Rev F EMU verification regression, not a prediction for a Mars suit, and is never compared with
  the PICO₂ table.
- SP-368, TN D-7883, IST-1 (TP-2010-216115) and Carr & Newman 2007 were not read; none of their numbers are used
  directly.
