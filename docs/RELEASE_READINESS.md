# Release readiness: PR #2 (science engine integration)

Reviewed 14 Nov 2026 on `feat/science-engine-integration`. **Not merged.** UI design and engine calculations are
unchanged by this review. The only code changes were the top-bar clock, lazy-loading FoV, a "(model)" label, and
removing two unused textures.

## Verdict

**Ready to merge after the two team decisions below (B1, B2).** Everything else either passes or can wait for a later phase.

| # | Must resolve before merge | Owner | Why it blocks |
| --- | --- | --- | --- |
| B1 | **Pick the default mission-rule and suit profiles** (table below), or explicitly accept "engine rules + 50 kg" as the labelled interim default | Team leader | The first verdict anyone sees depends on it. Today the default reproduces the research engine, not the team hold sheet |
| B2 | **Accept 7.9 MB of terrain data in Git** (or choose LFS / a release asset) | Repo owner | It is permanent in history once merged |

## 1. CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`: `npm ci` → `npm run typecheck` (tsc strict) →
`npm test` (engine + integration tests) → `npm run build`. Node 22, read-only token.
First run on this PR: **success** (run 43596062027).

## 2. Scientific provenance review

Every on-screen value was checked against [`SCIENCE_PROVENANCE.md`](SCIENCE_PROVENANCE.md). Classes used:

| Class | What | Labelled where |
| --- | --- | --- |
| **Measured** | HiRISE DTM + orthoimage (USGS), MEDA air/ground temperature and pressure, Perseverance stop positions | EVA telemetry "(MEDA)", layer notes "HiRISE DTM", FoV credit |
| **Calculated** | Slope, sky view, routes, return field, EVA window | layer notes "calculated", Plan summary |
| **Modelled** | O₂, metabolic power, dose rate, pressure at elevation | "(modelled)", "GCR model", "modelled · GCR × sky view" |
| **Assumed** | Suit and policy values, walking speed, stop time, Φ = 600 MV | Plan controls "not yet agreed"; provenance table |
| **Simulated** | EVA walk playback, Debrief "measured" values, heart rate, relay passes, link budget inputs, connectivity hops | "simulated walk on the plan", "*Simulated playback", "(simulated)", "· simulated" |
| **Synthetic placeholder** | Minerals and thermal-inertia layers, samples list, crew timeline | "synthetic placeholder · no dataset yet", "synthetic", "Synthetic schedule" |
| **Not modelled** | Suit power, relay-link layer | "not modelled", "not modelled yet" |

Findings and fixes in this review:

- **Fixed:** the top-bar LMST clock was a fixed value per screen from the Figma frames (e.g. 15:38 on EVA Map while the
  EVA telemetry said 10:35). It now follows the plan: EVA start on Hub/Plan, the EVA clock on EVA Map/FoV/Comms, ingress
  on Debrief.
- **Fixed:** Hub "O₂ at return" now says "(model)".
- **Open, later phase:** the top-bar `SOL 412`, `EVA-07 · Jezero West`, `MRS-L3` and the green "Safe" link chip are
  scenario labels from the design. The chip is the relay-link status, not the EVA verdict, and it is not computed.
- **Open, later phase:** `public/data/app/app.json` still lists `slope.png` / `shielding.png` paths from the research app;
  the loader ignores them (the files were removed as unused).

## 3. Mission policy conflicts: values that need a team decision

None of these is chosen silently: both values ship as profiles (`src/engine/profiles.js`), switchable on Plan and
marked "not yet agreed".

| Value | Engine (default today) | Team / leader source | Effect on today's plan (efficient) | Decision |
| --- | --- | --- | --- | --- |
| Slope no-go limit | 20° | 16° (hold sheet `hold-slope`, "prototype default"); 20° also appears in `mission.ts` | Route max 18.8° → 15.9°; O₂ 126.6 → 128.3 L | **Team** |
| Slope caution | 15° | none in the sheet | CAUTION on all three modes either way | **Team** (needs a source) |
| O₂ reserve | 15 % of tank at every point (walk-back) | "≥ 40 % at return" (EVA tile in `mission.ts`) | Passes either way (66 % left) | **Team**: confirm the 40 % tile is meant as a rule |
| Reserve factor for "caution" status | 1.5 × walk home | none | EVA Map shows "Reserve below plan margin" at T+1:38 under the 4 h cap | **Team** |
| EVA length cap | 360 min | 240 min (`mission.ts` "4 h cap") | 217 min (engine) / 222 min (sheet) fits both | **Team** |
| Walk-back type | O₂ return field | 10 km distance (hold sheet, Apollo-derived) | Both pass (max 0.57 km from start) | **Team**: keep both (recommended) or one |
| Verdict states | GO/NO-GO + cautions | GO / CAUTION / NO-GO (design) | Mapping: hard reason → NO-GO, caution → CAUTION | **Team**: confirm mapping |
| Suit mass | 50 kg | 40 kg (`marswalk-model` default) | O₂ 126.6 L → 125.5 L (stops dominate: 100.8 L) | **Team** (also gates the lookup) |
| Daylight window | 07:00-17:00 LMST (assumed) | none | hard NO-GO reason outside it | Later: needs a source |
| Cold-ground caution | 200 K (assumed) | none | caution only | Later: needs a source |

Profile outcomes (all three modes are CAUTION in every combination):

| Profiles | Efficient | Balanced | Safest |
| --- | --- | --- | --- |
| engine + 50 kg | 126.6 L · 217 min · 18.8° | 127.1 L · 217 min · 17.6° | 127.7 L · 219 min · 17.1° |
| engine + 40 kg | 125.5 L · 217 min · 18.8° | 125.8 L · 217 min · 17.6° | 126.5 L · 219 min · 17.1° |
| hold sheet + 50 kg | 128.3 L · 222 min · 15.9° | 128.4 L · 222 min · 15.8° | 129.0 L · 223 min · 15.4° |

## 4. Workflow check: Plan → EVA Map → FoV → Debrief → Replan

Fresh browser state, 1366 × 1024, no console errors at any step.

| Step | Result |
| --- | --- |
| Plan (efficient) | CAUTION · 1.33 km · 126.6 L · clock 09:00 LMST |
| Plan → Safest | 1.43 km · 127.7 L · max 17.1° (same as the research engine's table) |
| EVA Map | Follows the Safest route: 0.42 km, O₂ 84 %, 1.01 km remaining, clock 10:35 LMST; +10 min → 0.68 km, 10:45 |
| FoV | 3D canvas renders at the same position: "T+1:48 · 0.68 km", heading 334°, clock 10:45 |
| Debrief | Calibrated k_suit 1.134 for this route; clock 12:32 (ingress) |
| Apply k_suit → Plan | Safest route recomputed: 131.3 L, still CAUTION; mode and profiles kept |

## 5. Missing `mars-globe.png` and the three.js bundle

**Globe.** `public/images/` has only a README, ever (first and only commit `1fa8ddd`). `mars-globe.png` is used on
Comms → Pass prediction (`src/screens/comms-passes.tsx:64`). It was missing on `main` before this PR, and the slot
degrades to a neutral circle plus a one-time toast. The Figma layer is called "Mars globe (placeholder image)" and the
repo README asks to check its licence. **Not a blocker.** Later phase: use a NASA global mosaic with a credit line (for
example a Viking MDIM or MOLA-shaded view), exported at 640 px, and add the credit beside the image.
`mars-basemap.jpg` and `fov-camera.jpg` are no longer needed (real HiRISE data replaced them).

**Bundle.** Before: one 1,069 kB chunk (306 kB gzip). FoV and three.js now load on demand: main chunk **502 kB
(161 kB gzip)**, FoV chunk 569 kB (146 kB gzip), loaded only when FoV opens. Vite still warns because the three.js chunk is
over 500 kB. **Not a blocker.** Later: import only the three.js modules used, or raise `chunkSizeWarningLimit` for that chunk.

## 6. Terrain data in Git

| File | Size | Used by |
| --- | --- | --- |
| `public/data/app/grid.bin` | 4.2 MB | routing grid: elevation, slope, sky view, roughness (Float32, 500 × 527 × 4) |
| `public/data/terrain/terrain_draco.glb` | 3.3 MB | FoV 3D mesh |
| `public/data/terrain/ortho.jpg` | 0.8 MB | map basemap |
| `public/data/app/app.json`, `meda_weather.json` | 0.04 MB | stops, weather |
| `public/draco/` | 0.75 MB | Draco decoder (offline) |
| ~~`slope.png`, `shielding.png`~~ | ~~2.0 MB~~ | **removed in this review: unused** |

Assessment: **appropriate to track for now.** About 8.6 MB in total. Every file is far below GitHub's 50 MB warning and
100 MB limit, and the repo stays well under 1 GB. The app needs the files at runtime with no build step (and offline,
and on GitHub Pages). Git LFS is not installed here, and LFS files are not served by GitHub Pages. The files are
generated by the scripts in the research repo (`MARSWALK/scripts/build_terrain.py`, `export_app_data.py`).

Risk: each regeneration adds roughly 4-8 MB to history forever. Recommendation: commit them once now. If they will be
regenerated often, move them to a GitHub Release asset fetched at build time. Either way the owner decides (B2).

## 7. Later phases (not blocking)

Simulated EVA telemetry (no suit data); synthetic Comms model, pass list and timeline; no astronaut-side device in
this app (BroadcastChannel is same-origin); single walker vs the two-person design; CRISM/THEMIS layers; `marswalk-model`
lookup (off); globe image; three.js chunk warning; planning on the main thread (~1 s per profile change, Web Worker
later); remaining sub-56 px controls in existing components (Comms sub-view toggle, search inputs); static top-bar
scenario labels.
