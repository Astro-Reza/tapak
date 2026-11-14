# Phase 3: NASA research inventory and physiology model

Reviewed 14 Nov 2026. Machine-readable catalog: [`src/engine/data/physiology/catalog.json`](../src/engine/data/physiology/catalog.json).
Every number below was read in the original document at the page given (printed page; PDF page in brackets when it differs).

## 1. Source inventory

| Source | Read? | What we use | Where |
| --- | --- | --- | --- |
| NASA-STD-3001 Vol. 2 **Rev. F** (approved 2026-07-14) | Yes, full PDF | EMU 4.3 psia, 100 % O₂ → ppO₂ 222 mmHg, PIO₂ 175 mmHg; PIO₂ ranges; heat-storage range; CO₂ table and EMU regression; nominal MR envelope | p.50, Table 6.2-1 p.51, [V2 11011] p.226, [V2 11039] p.234, Table 11.3-1 p.235 |
| OCHMO-TB-050 Spacesuits (2025-09-08) | Yes | PIO₂ = (PB − 47) × FIO₂; suited metabolic-rate table (µg EVA, Apollo, walkback test) | p.4, p.6 |
| Chappell et al. 2010, NASA/TM-2010-216138 | Yes | Table 4 activity VO₂ (lunar analog); energy equivalent cross-check | Table 4 p.13 [21]; method p.17 [25] |
| Norcross et al. 2010, NASA/TP-2010-216125 (IST-2) | Yes | Subjects (n = 6), suited VO₂ method, limitations, gravity range | Table 1 p.3 [18]; §2.6 p.10 [25]; §3.6 p.77-78 [92-93] |
| Hoffmann 2021, NTRS 20210024317 | Yes | HR-MR relation statistics: group R² 0.402, individual R² > 0.82, 132 EVAs | §5.1 p.1; §5.3 p.4-6 |
| Kuznetz 1977, NASA TM-58205 | Yes (summary) | LCG heat removal is controlled, not equal to production: architecture rationale only | p.1-3 |
| Norcross et al. 2010, NASA/TP-2010-216115 (IST-1) | **No** | Walking 15.4 mL/kg/min only as quoted by Chappell | — |
| NASA SP-368, Biomedical Results of Apollo | **No** (scan only; TN D-7883 link 404) | Apollo rates only as summarised in OCHMO-TB-050 | — |
| Carr & Newman 2007 (doi:10.3357/asem.1952.2007, asem.1953.2007) | **No** (publisher HTTP 403) | Nothing | — |
| NASA OSDR | **Not queried** | Nothing | — |

## 2. Key findings

1. **Chappell Table 4 values are per kg of body mass, not body + suit.** Norcross p.10 defines metabolic rate as
   "milliliters of O₂ consumed per kilogram of the subject's body mass, per minute". Chappell's kcal/h column only
   reconciles at the 80.7 kg subject mass (implied 4.82 kcal/L O₂; the engine uses 20 100 J/L = 4.80 kcal/L).
2. **They are lunar-analog values.** Measured on JSC's POGO partial-gravity simulator at 0.17 g in the MKIII suit (121 kg,
   29.6 kPa) with six male astronauts. The IST series covered 0.12-0.32 g. **Mars (0.38 g) lies outside the tested range**, so
   any use on Mars is an extrapolation. Suited VO₂ was inferred from exhaust CO₂ via each subject's VCO₂-VO₂ regression, not
   measured directly (Norcross p.10, p.78). Table 4 gives **no uncertainty**.
3. **The rover-rest value (3.9) is not an IST measurement.** Chappell took it from a published Earth, unsuited resting study.
4. **Material gap in the Phase 2 engine.** Science stops are modelled at 7 mL/kg/min (assumed "2 METs"). The closest
   analog, light stationary work, is 13.2 mL/kg/min, almost 2×. For the default plan (4 × 45 min stops, 80 kg):
   stop O₂ 100.8 L (engine) vs 190.1 L (analog). Stops dominate the EVA O₂ budget, so this matters more than
   any walking-model choice. **Phase 2 outputs are not changed**; the analog runs in parallel and is shown as
   EXPERIMENTAL until the team decides (see §5).
5. **Heart rate cannot be estimated from a group model.** A group regression explains 40 % of variance (Hoffmann R² 0.402).
   Individual calibrations reach R² > 0.82, but they came from microgravity EVAs where MR was taken from tank pressure
   decay (which includes leakage). HR is therefore **UNAVAILABLE** unless a crew member has a personal calibration.
6. **Heat storage needs a validated thermal model.** [V2 11011] limits are 3.0 kJ/kg > ΔQ > −1.9 kJ/kg, computed with
   41-Node Man or Wissler. The leader's hold sheet reads this as "alert 1.9, abort 3.0", but **−1.9 is the cold-side lower
   bound, not an alert level**. We report metabolic heat production (MODELLED) against the Rev F nominal design envelope
   (528-2220 kJ/h), and heat storage as UNAVAILABLE.
7. **CO₂.** Rev F gives PICO₂ duration limits (Table 11.3-1) and an EMU **verification** regression
   ppCO₂ = MR(BTU/h) × 0.0047 + 0.65 mmHg. We show that regression as an EXPERIMENTAL EMU-reference estimate and never compare
   it with the PICO₂ table (different quantity; the conversion isn't specified there).
8. **O₂ uptake ≠ suit O₂ depletion.** Suit inventory loss = metabolic uptake + leakage + purge. No verified Mars-suit leakage
   value exists, so the "O₂ remaining" shown is a **metabolic-only upper bound** on what is left, labelled as such.
9. **Suit pressure.** The EMU heritage value 4.3 psia (29.6 kPa), 100 % O₂ (Rev F p.50) is used as an ASSUMED set-point.
   Chappell's consumables estimate assumed 80 % O₂ instead; the two are recorded, not merged.

## 3. Architecture

Biomechanics, physiology and mission policy are separate modules. Phase 2's route and O₂ engine is untouched.

```
                       ┌────────────────────────── src/engine/workload.js ──────────────────────────┐
 route / terrain  ──►  │ WorkloadSource (typed):                                                     │
 (Phase 2)             │  analytic  → absolute metabolic W from energy.js (ACSM / Pandolf / Minetti) │
                       │  kinesis   → relative COT only (J/kg/m, net muscle-work proxy):             │
                       │              DISABLED until gravity, suit mass, roughness domain and        │
                       │              validation pass AND an absolute calibration exists             │
                       └───────────────┬─────────────────────────────────────────────────────────────┘
                                       │ walking segments (one source only: no double counting)
 activity timeline ◄───────────────────┘
 (walk / stop → catalog activity class)                                   src/engine/physiology/*
        │
        ├── metabolic.js     VO₂ by activity (catalog), unit conversions, accumulated energy, %VO₂peak
        ├── oxygen budget    metabolic uptake vs suit inventory (leakage = explicit input, default unknown)
        ├── thermal.js       heat production; energy balance with explicit heat removal (EXPERIMENTAL)
        ├── atmosphere.js    suit pressure set-point (ASSUMED), ppO₂/PIO₂ (DERIVED), ppCO₂ EMU reference (EXPERIMENTAL)
        ├── heartrate.js     only from a per-crew calibration; otherwise UNAVAILABLE
        ├── crew.js          crew profiles, sensor-frame validation (invalid/missing → UNAVAILABLE)
        └── status.js        crewStatus(): readings {value, unit, provenance, confidence, source}
                                       │
 mission policy (profiles.js) ─────────┤  limits stay in policy, never inside physiology
                                       ▼
                    src/sim → EVA Map "Crew physiology" card (provenance tag on every row)
```

Provenance classes used in the UI: **MEASURED** (none: no live suit sensors), **DERIVED** (computed from assumed or
modelled inputs by a closed formula), **MODELLED**, **ASSUMED**, **SIMULATED**, **UNAVAILABLE**. A reading can also carry
**EXPERIMENTAL** confidence.

## 4. What is implemented and what is not

| Quantity | Status | Basis |
| --- | --- | --- |
| Activity workload / class | Implemented | Timeline from the plan; stops = light stationary work (assumption, switchable) |
| Metabolic rate | Implemented (MODELLED) | Engine walking model + catalog activity VO₂ |
| O₂ uptake | Implemented (MODELLED) | Same, L/min |
| O₂ remaining | Implemented (MODELLED, metabolic-only) | Tank 378 L (engine assumption) minus uptake; leakage unknown |
| Thermal load | Heat production MODELLED; heat storage UNAVAILABLE | Rev F [V2 11011] needs 41-Node Man/Wissler |
| Heart rate | UNAVAILABLE by default | Needs per-crew calibration (Hoffmann 2021) |
| Workload accumulation | Implemented (MODELLED): accumulated kJ, %VO₂peak if VO₂peak known | No fatigue threshold: none is sourced |
| Suit pressure | ASSUMED 29.6 kPa set-point | Rev F p.50 (EMU) |
| ppO₂ / PIO₂ | DERIVED | Rev F p.50, TB-050 p.4 |
| ppCO₂ | MODELLED, EXPERIMENTAL | Rev F p.234 EMU regression |
| Crew profiles | Implemented | Body mass from engine; VO₂peak demo value = IST-2 cohort mean (ASSUMED) |

## 5. Decisions for the team

1. Should science stops use the analog light-work rate (13.2 mL/kg/min) instead of 7 in the route O₂ budget? This would
   change Phase 2 results (default plan 34 % → about 57 % of tank: 25.8 L walking + 190.1 L stops) and so needs explicit approval and a Mars-gravity rationale.
2. Which Mars suit set-point (pressure, O₂ fraction) is the reference?
3. Leakage allowance for the O₂ inventory (needs a suit source).
4. Correct the hold sheet's heat-storage line (−1.9 kJ/kg is the cold bound).
