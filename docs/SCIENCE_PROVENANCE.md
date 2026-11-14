# Science assumptions and provenance

Every number the integrated app computes comes from the science engine in `src/engine/`, ported **unchanged** from the
`MARSWALK/app` research prototype (regression-tested: `npm test`). This page says where each number comes from and which
assumptions are not yet agreed by the team.

## Units (engine convention)

| Quantity | Unit | Notes |
| --- | --- | --- |
| Position | metres; x east, z south, y elevation (Mars datum) | grid row 0 = north; `src/engine/index.d.ts` |
| Time | Earth minutes from egress | LMST in Mars hours; 1 Mars hour = 61.65 min |
| Oxygen | litres at STP | 1.43 g/L |
| Power / energy | W / J | 20 100 J per litre O₂ |
| Dose | mSv (dose equivalent) | dose rate shown as mSv/day or µSv/h |
| Slope / grade | degrees / rise÷run | |
| Pressure, temperature | Pa, K (UI shows °C) | |

The UI converts only for display (`src/sim/view.ts`). The engine never mixes units; the integration tests check the
O₂ budget closes and that a single EVA dose is in mSv.

## Configuration profiles: model parameters vs mission rules

Conflicting values are **not** silently resolved. They live in `src/engine/profiles.js` as two independent profile sets,
both shown and switchable on the Plan screen ("not yet agreed"):

**Science profiles** (what the suit and body do):

| Profile | Suit mass | Source |
| --- | --- | --- |
| `app-50kg` (default) | 50 kg | engine `SUIT.suitKg`, assumed EMU-class |
| `model-40kg` | 40 kg | `marswalk-model` default `suit_mass` (train.py), assumed |

**Policy profiles** (what the crew is allowed to do):

| Rule | `engine` (default) | `hold-sheet` | Source of the hold-sheet value |
| --- | --- | --- | --- |
| Slope limit | 20° | 16° | `eva-checklist.ts` hold-slope "Prototype default 16°" |
| Slope caution | 15° | 15° | not in the sheet; engine value kept (assumed) |
| O₂ reserve (walk-back) | 15 % of tank | 40 % of tank | `mission.ts` EVA tile "≥ 40 at return" (prototype value) |
| Reserve factor (status) | 1.5 × walk home | 1.5 × | not in the sheet; engine value kept |
| EVA length cap | 360 min | 240 min | `mission.ts` "4 h cap" |
| Distance walk-back | not applied | 10 km from start | `eva-checklist.ts` hold-walkback (Apollo-derived) |

The defaults reproduce the original app exactly. Switching a profile recomputes the return field and every route.

**Verdict classification** (`src/engine/mission.js`): any hard reason (walk-back fails, over the EVA cap, outside the
daylight window, beyond the distance cap) → **NO-GO**; otherwise any caution (cold ground, route slope above the caution
level) → **CAUTION**; otherwise **GO**. The engine's original `goNoGo()` is unchanged; the three-state mapping and the
distance and slope-caution checks are added on top.

## Kinds of data shown in the UI

- **Real / measured**: HiRISE DTM and orthoimage, MEDA temperatures and pressure, Perseverance stop positions.
- **Calculated**: slope, sky view, routes, return field, EVA window.
- **Modelled**: oxygen, metabolic power, dose rate, pressure at elevation.
- **Assumed**: suit and policy values above, walking speed, stop time.
- **Simulated** (labelled on screen): the EVA walk playback, debrief "measured" values, heart rate, relay passes,
  link budget inputs, connectivity hops, samples list, crew timeline.
- **Synthetic placeholder** (labelled): hydrated-minerals and thermal-inertia layers (no CRISM/THEMIS data yet).
- **Not modelled** (labelled): suit power, relay link margin layer.

## Every number: where it comes from

Kinds: **Real** = measured by NASA/USGS instruments. **Calculated** = computed by this code from real data.
**Modelled** = a published model applied here. **Assumed** = a design choice or estimate with no cited source;
change these first when better data exists. **Simulated** = generated, and labelled as such in the UI.

| Number | Value | Kind | Basis | Where |
| --- | --- | --- | --- | --- |
| Terrain height | 1 m DTM, -2079 to -1758 m | Real | USGS Mars 2020 TRN HiRISE DTM | `MARSWALK/data/terrain/dtm.tif` → `public/data/app/grid.bin` (4 m) + `terrain_draco.glb` |
| Orbital image | 25 cm ortho, shown at 1 m/px, tinted orange | Real (tint is display only) | USGS HiRISE ortho mosaic | `public/data/terrain/ortho.jpg` |
| Rover photos | 18 Mastcam-Z frames, Sols 1349-1368 | Real | mars.nasa.gov raw-image feed | `MARSWALK/data/pov_images.json` (not used in this app yet) |
| Stop positions and rover attitude | 5 stops; roll, pitch, yaw | Real | Perseverance traverse waypoints (MMGIS) | `MARSWALK/data/raw/M20_waypoints.json` |
| Air and ground temperature, pressure | hourly medians; air -75 to -37 °C, ground -82 to -4 °C, 683-704 Pa | Real | MEDA, 8 sols at the stops | `public/data/meda_weather.json` |
| Slope | median 13°, 19% of patch > 20° | Calculated | DTM gradient, E-W scale corrected (0.949 m/px) | `MARSWALK/scripts/build_terrain.py` |
| Roughness | 0-1 (1 = 3.1° slope spread) | Calculated | spread of 1 m slope in each 4 m cell; rocks not resolved | `MARSWALK/scripts/export_app_data.py` |
| Sky view | 87-100% open | Calculated | DTM horizon in 16 directions; terrain beyond the patch ignored | `MARSWALK/scripts/export_app_data.py` |
| Photo compass bearings | e.g. rover az 24° to compass 280°, +9° | Calculated | rover-frame angle rotated by roll, pitch and yaw | `MARSWALK/scripts/export_app_data.py` |
| Route | 1.33-1.43 km by mode | Calculated | A* / Dijkstra on 4 m grid with the cost below | `src/engine/route.js` |
| Walk home from any cell | up to 51 L | Calculated | Dijkstra from the start with the O2 model | `src/engine/models/returnfield.js` |
| Warmest EVA window | 11:00 LMST | Calculated | MEDA ground temperature over the EVA length | `src/engine/models/evaluate.js` |
| Pressure at elevation | MEDA × exp(-Δh / 11.1 km) | Modelled | Mars scale height ~11.1 km | `src/engine/telemetry.js` |
| O2 walking (default) | 0.53 L/min flat; 127 L per EVA | Modelled + Assumed | ACSM walking equation; Mars gravity × carried-mass scaling is assumed | `src/engine/telemetry.js` |
| O2 walking (Pandolf + Santee) | 357 W / 1.07 L/min flat; 150 L per EVA | Modelled | Pandolf 1977, Santee 2003 (valid grade range not checked); gravity on uphill only | `src/engine/models/energy.js` |
| O2 walking (Minetti) | 271 W / 0.81 L/min flat; 135 L per EVA | Modelled | Minetti 2002 (Earth, ±0.45 grade); minimum at -0.153 | `src/engine/models/energy.js` |
| Watts to O2 | 20,100 J/L; 1.43 g/L; RQ 0.85 | Modelled | standard physiology constants | `src/engine/models/oxygen.js` |
| Dose rate | ~0.70 mSv/day at Jezero; 0.106 mSv per EVA | Modelled | Curiosity RAD at Gale: 220 µGy/day, κ = 0.28 - 2.9e-4 Φ µGy/day/Pa (Guo 2017), Q = 3.05 (Hassler 2014), × sky view | `src/engine/telemetry.js` |
| Gale reference pressure | 840 Pa | Assumed | example value in Guo 2017, not a long-term mean | `src/engine/telemetry.js` |
| Solar modulation Φ | 600 MV | Assumed | late 2024 was near solar max, so dose may be lower | `src/engine/telemetry.js` |
| Body and suit mass | 80 kg, 50 kg | Assumed | EMU-class estimate | `SUIT` (`src/engine/telemetry.js`), `src/engine/telemetry.js` |
| O2 tank | 378 L (~0.54 kg) | Assumed | EMU-class primary O2 | `SUIT` (`src/engine/telemetry.js`) |
| Walking speed | 50 m/min, down to 50% at the slope limit | Assumed | — | `SUIT` (`src/engine/telemetry.js`), `speedAt` |
| Stop time and work rate | 45 min per stop at 7 ml/kg/min | Assumed | light suited work, about 2 METs | `SUIT` (`src/engine/telemetry.js`) |
| EVA length limit | 360 min | Assumed | — | `SUIT` (`src/engine/telemetry.js`) |
| Slope limits | 20° no-go, 15° caution | Assumed | brief: 15-20°; a 15° limit still finds a 1.37 km route | `SUIT` (`src/engine/telemetry.js`) |
| Reserves | arrive home with 15% of tank; reserve status needs 1.5 × the walk home | Assumed | — | `SUIT` (`src/engine/telemetry.js`) |
| k_suit | 1.000 (set from the debrief) | Assumed, then Simulated-calibrated | suit work multiplier | `SUIT` (`src/engine/telemetry.js`) |
| Daylight window | 07:00-17:00 LMST | Assumed | — | `src/engine/models/evaluate.js` |
| Cold-ground caution | below 200 K (-73 °C) | Assumed | glove contact | `src/engine/models/evaluate.js` |
| Risk weights | slope 0.6, roughness 0.2, steep descent 0.1, fatigue 0.1 | Assumed | tuned on this patch to avoid 15-20° ground | `src/engine/models/risk.js` |
| Mode presets α/β/δ | efficient 0.70/0.10/0.20; balanced 0.40/0.40/0.20; safest 0.15/0.75/0.10 | Assumed | FigJam design choices | `src/engine/models/cost.js` |
| Q score | 0-100; c_worst = 95th-percentile move over the straight-line trip | Assumed | design choice | `src/engine/models/cost.js` |
| Light-time delay | 5 s default (real 3-22 min) | Assumed for demo | — | `src/engine/sync/channel.js` |
| Debrief "measured" values | hidden k_suit 1.12, ±5% walk, ±3% stop, ±4% time noise | **Simulated** | seeded generator; no real suit telemetry exists | `src/engine/debrief.js` |
| Eye height | 1.7 m | Assumed (display) | — | `src/sim/terrain-view.tsx` |

Not available: wind (no MEDA data for these sols), measured radiation at Jezero (Perseverance has no dosimeter),
individual rocks (below DTM resolution).


## Not active

The `marswalk-model` planner lookup (`src/engine/models/lookup.js`) and the per-cell surrogate are included but **off**.
The lookup stays off until (1) the walker passes its own validation, (2) a table exists for the agreed suit mass, and
(3) its roughness range covers Jezero (median DTM roughness 0.115 m vs a 0–0.06 m training range; see
`MARSWALK/docs/PHASE1_ALIGNMENT.md`).

## Data sources and credits
- Weather: Perseverance MEDA, PDS Atmospheres node, mars2020_meda bundle (CAL_TIRS, DER_PS),
  https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/ . Credit: NASA/JPL-Caltech/CAB(CSIC-INTA).
- Radiation model: Guo et al. 2017, JGR Planets 122, 329, doi:10.1002/2016JE005206 (arXiv:1712.06987);
  Hassler et al. 2014, Science 343, doi:10.1126/science.1244797 (quality factor).
- Perseverance raw images (Mastcam-Z, Navcam): mars.nasa.gov raw-images feed. Credit: NASA/JPL-Caltech (Mastcam-Z: NASA/JPL-Caltech/ASU).
- Perseverance traverse waypoints (`data/raw/M20_waypoints.json`, through sol 2022): NASA/JPL-Caltech MMGIS,
  https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json
- Terrain: USGS Mars 2020 Terrain Relative Navigation HiRISE DTM mosaic (1 m, doi:10.5066/P9REJ9JN) and
  orthoimage mosaic (25 cm, doi:10.5066/P9QJDP48), read from
  https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/ .
  Credit: NASA/JPL/University of Arizona, USGS.

No NASA logo is used. This is not an official NASA product.
