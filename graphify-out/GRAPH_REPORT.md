# Graph Report - marswalk  (2026-11-14)

## Corpus Check
- Corpus is ~17,949 words - fits in a single context window. You may not need a graph.

## Summary
- 426 nodes · 1096 edges · 19 communities (18 shown, 1 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Map & Route Screens
- Package & Build Config
- App Shell, Motion & Controls
- Fit Layout & Comms/FoV Screens
- Shared Primitives & Hub
- Mission Data & Store
- README & Screen Catalog
- TS App Config
- shadcn Component Config
- EVA Map Screenshot
- Debrief Screenshot
- Hub Screenshot
- FoV Screenshot
- Plan Screenshot
- TS Node Config
- Comms Link Screenshot
- Comms Passes Screenshot
- TS Root Config
- Design Tokens

## God Nodes (most connected - your core abstractions)
1. `cn()` - 60 edges
2. `PlanScreen()` - 35 edges
3. `react` - 30 edges
4. `EvaMapScreen()` - 29 edges
5. `motionMs()` - 26 edges
6. `DebriefScreen()` - 22 edges
7. `CommsPassesScreen()` - 19 edges
8. `Icon()` - 17 edges
9. `stagger()` - 17 edges
10. `compilerOptions` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Uplink margin across the sky (half-dome elevation chart)` --references--> `SkyDome()`  [INFERRED]
  docs/screenshots/comms.png → src/screens/comms-link.tsx
- `Comms screenshot (Relay link - MRS constellation, Link budget tab)` --references--> `CommsLinkScreen()`  [INFERRED]
  docs/screenshots/comms.png → src/screens/comms-link.tsx
- `Comms Passes screenshot (Relay passes over Jezero West)` --references--> `CommsPassesScreen()`  [INFERRED]
  docs/screenshots/comms-passes.png → src/screens/comms-passes.tsx
- `Debrief screen screenshot (EVA-07 debrief, Sol 412)` --references--> `DebriefScreen()`  [INFERRED]
  docs/screenshots/debrief.png → src/screens/debrief.tsx
- `EVA Map screen screenshot` --references--> `EvaMapScreen()`  [INFERRED]
  docs/screenshots/eva.png → src/screens/eva-map.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Seven Marswalk screens across Pre-EVA, During EVA, Post-EVA** — readme_mission_hub, readme_route_planner, readme_eva_map, readme_fov_simulation, readme_comms_link_budget, readme_comms_pass_prediction, readme_debrief [EXTRACTED 1.00]
- **Motion system patterns** — readme_stepped_motion, readme_hold_to_confirm, readme_hazard_interrupt, readme_reduced_motion, readme_status_line_toast [EXTRACTED 1.00]
- **Figma raster placeholder image slots** — public_images_readme_mars_basemap, public_images_readme_fov_camera, public_images_readme_mars_globe [EXTRACTED 1.00]
- **Pass prediction views sharing one pass schedule** — docs_screenshots_comms_passes_orbit_view, docs_screenshots_comms_passes_link_prediction_list, docs_screenshots_comms_passes_contact_windows, docs_screenshots_comms_passes_coverage_stats [INFERRED 0.85]
- **Statistical link budget analysis (sky dome, elevation stats, rx/tx waterfalls)** — docs_screenshots_comms_sky_dome, docs_screenshots_comms_elevation_statistics, docs_screenshots_comms_receive_waterfall, docs_screenshots_comms_transmit_waterfall [INFERRED 0.85]
- **Plan-vs-actual review (route overlay, deviation callouts, metric deltas)** — docs_screenshots_debrief_planned_vs_walked, docs_screenshots_debrief_deviation_annotations, docs_screenshots_debrief_metric_cards [INFERRED 0.85]
- **Comms link awareness on EVA map** — docs_screenshots_eva_connectivity_chain, docs_screenshots_eva_relay_pass_cards, docs_screenshots_eva_map_layer_legend [INFERRED 0.85]
- **Consumables and turnaround decision support** — docs_screenshots_eva_progress_panel, docs_screenshots_eva_prediction_panel, docs_screenshots_eva_live_telemetry [INFERRED 0.85]
- **Relay pointing cues** — docs_screenshots_fov_relay_arc, docs_screenshots_fov_satellite_reticle, docs_screenshots_fov_elevation_scale [INFERRED 0.85]
- **View orientation cues** — docs_screenshots_fov_camera_readout, docs_screenshots_fov_heading_tape, docs_screenshots_fov_minimap [INFERRED 0.85]
- **Pre/During/Post EVA checklist trio** — docs_screenshots_hub_pre_eva_checklist, docs_screenshots_hub_during_eva_checklist, docs_screenshots_hub_post_eva_checklist [EXTRACTED 1.00]
- **Slope hazard reroute shown consistently in alert, map dashed segment and profile** — docs_screenshots_plan_slope_alert, docs_screenshots_plan_route_map, docs_screenshots_plan_route_profile [EXTRACTED 1.00]

## Communities (19 total, 1 thin omitted)

### Community 0 - "Map & Route Screens"
Cohesion: 0.11
Nodes (45): HazardAlert(), Verdict, VerdictBanner(), verdictTone, PassRow(), Icon(), IconName, paths (+37 more)

### Community 1 - "Package & Build Config"
Cohesion: 0.06
Nodes (43): #root mount element, dependencies, class-variance-authority@^0.7.1, clsx@^2.1.1, @fontsource/geologica@^5.3.0, @fontsource/urbanist@^5.3.0, radix-ui@^1.8.1, react@^19.3.1 (+35 more)

### Community 2 - "App Shell, Motion & Controls"
Cohesion: 0.09
Nodes (36): radix-ui, react, App(), CLOCK, Phase, SCREENS, useScreenChange(), CommsToggle() (+28 more)

### Community 3 - "Fit Layout & Comms/FoV Screens"
Cohesion: 0.09
Nodes (38): clamp(), computeFit(), Fit(), FitBox, FitLayer(), FitMode, Size, useFit() (+30 more)

### Community 4 - "Shared Primitives & Hub"
Cohesion: 0.13
Nodes (32): Hash router, 01 Mission Hub (#/hub), ChecklistCard(), ChecklistItem(), levelTag, LogLevel, MetricTile(), Status (+24 more)

### Community 5 - "Mission Data & Store"
Cohesion: 0.07
Nodes (26): src/data/mission.ts demo data, BudgetNode, BudgetStage, ChecklistEntry, CONTACT_WINDOWS, DURING_EVA, GRID_TOP, LAYER_CELLS (+18 more)

### Community 6 - "README & Screen Catalog"
Cohesion: 0.10
Nodes (16): fov-camera.jpg, mars-basemap.jpg, mars-globe.png, 05 Comms Link Budget (#/comms), 06 Comms Pass Prediction (#/comms/passes), 07 Debrief (#/debrief), DESIGN-MOTION.md, 03 EVA Map (#/eva) (+8 more)

### Community 7 - "TS App Config"
Cohesion: 0.11
Nodes (18): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+10 more)

### Community 8 - "shadcn Component Config"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 9 - "EVA Map Screenshot"
Cohesion: 0.18
Nodes (15): EVA Map screen screenshot, Connectivity link chain (Tablet to HUD to relay MRS-L1 to habitat), Dark UI with Mars-orange accent, Live telemetry (heart rate, suit pressure, CO2 partial, outside temp; 1 Hz simulated), Map search and controls (search, compass, recenter, zoom), Map layer legend (Slope, Dose Rate, Relay Link Margin gradients), Astronaut position marker (You 1.43 km, heading 032), Prediction vs plan panel (O2 at return, return to airlock, slack to cap, comms gap) (+7 more)

### Community 10 - "Debrief Screenshot"
Cohesion: 0.19
Nodes (13): Debrief screen screenshot (EVA-07 debrief, Sol 412), Deviation callouts (detour +120 m around 24 deg slope after WP3; extra 0.12 km near WP5), EVA dose summary card (0.08 mSv, quiet sun, forecast 0.08), Events log (6 flagged, timestamped INF/WRN entries: LOS MRS-L3 54 min gap, slope 18 deg, dust gust), Orange corner-bracket focus indicator, Debrief header (EVA-07 debrief, Sol 412, 14:00-17:12 LMST, crew, synthetic data note), Plan-vs-actual metric cards (Distance 3.52 km, Duration 3:12 h, O2 at return 43%, EVA dose 0.08 mSv, Uplink below threshold 7.9 min), Planned vs walked route chart (WP1-WP5, dashed plan vs solid walked) (+5 more)

### Community 11 - "Hub Screenshot"
Cohesion: 0.21
Nodes (13): Hub screen screenshot, Dark theme with Mars-orange accent, During-EVA checklist card (0/6, starts 14:00), Orange corner-bracket focus on current item (Top up O2 and power), During-EVA missions timeline (bottom sheet, 5 tracks, 14:00-18:00), Navigation tabs: Hub, Plan, EVA Map, FoV, Comms, Debrief, Post-EVA checklist card (0/5, +offset times), Pre-EVA checklist card (4/7 done, T-minus times) (+5 more)

### Community 12 - "FoV Screenshot"
Cohesion: 0.26
Nodes (12): FoV screen screenshot (fov.png), Camera readout pill (heading 032, tilt +4, FoV 70), Elevation scale (0-90 deg vertical ruler), Heading/compass tape (N to 060), AR HUD overlay pattern (dark UI, orange accent, pill labels), Image credit caption (NASA/JPL-Caltech placeholder, overlay simulated), Minimap inset (Map north up), Relay pass arc (MRS-L1, AOS 15:35 to LOS 15:44) (+4 more)

### Community 13 - "Plan Screenshot"
Cohesion: 0.29
Nodes (11): Plan screen screenshot (EVA-07 Jezero West route plan), Commit route (primary orange) and Edit stops actions, Map layer panel (search, Slope, Hydrated Minerals, Thermal Inertia, Dose Rate gradient legends), Map controls (north, locate, zoom in/out), Route map with heatmap-tile terrain overlay, waypoint path and dashed red blocked segment, Route elevation profile chart with WP markers and rerouted climb, Route stats card (distance, climb, max slope, duration, dose rate, relay coverage), CAUTION route verdict banner (stops, time vs cap, slope, dust gust risk, relay coverage) (+3 more)

### Community 14 - "TS Node Config"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+3 more)

### Community 15 - "Comms Link Screenshot"
Cohesion: 0.29
Nodes (11): Comms screenshot (Relay link - MRS constellation, Link budget tab), Elevation statistics panel (gamma fit, 214 simulated passes), Link budget / Pass prediction segmented toggle, Outage probability P_out = F(theta_min), Receive relay -> suit link budget waterfall (margin +4.0 dB, Safe), MRS-L1 relay marker (el 25 deg) with pass arc, Uplink margin across the sky (half-dome elevation chart), Safe / Caution status pills (+3 more)

### Community 16 - "Comms Passes Screenshot"
Cohesion: 0.29
Nodes (11): Comms Passes screenshot (Relay passes over Jezero West), Contact windows timeline (next 6 h), Pass coverage statistics panel, Link prediction pass list, Link budget / Pass prediction segmented toggle, Relay orbit view (Mars disc with 4 relay ellipses), MRS relay satellites L1-L4, Orange corner-bracket selection marker (+3 more)

### Community 17 - "TS Root Config"
Cohesion: 0.40
Nodes (4): compilerOptions, paths, files, references

## Ambiguous Edges - Review These
- `fit.tsx` → `Fixed 1366x1024 stage scaled to fit`  [AMBIGUOUS]
  README.md · relation: references
- `Top bar (MARSWALK, EVA-07 Jezero West, tabs, SOL 412 15:38 LMST, MRS-L3, Safe pill)` → `Relay pass arc (MRS-L1, AOS 15:35 to LOS 15:44)`  [AMBIGUOUS]
  docs/screenshots/fov.png · relation: conceptually_related_to
- `Safe status pill` → `Relay passes MRS-L1/L2/L3`  [AMBIGUOUS]
  docs/screenshots/hub.png · relation: conceptually_related_to

## Knowledge Gaps
- **26 isolated node(s):** `NASA Space Apps Jakarta: Interplanetary Survival Guide: Martian Map`, `03 EVA Map (#/eva)`, `04 FoV Simulation (#/fov)`, `05 Comms Link Budget (#/comms)`, `07 Debrief (#/debrief)` (+21 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 139 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App Shell, Motion & Controls` to `Map & Route Screens`, `Package & Build Config`, `Fit Layout & Comms/FoV Screens`, `Shared Primitives & Hub`, `Mission Data & Store`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `PlanScreen()` (e.g. with `Plan screen screenshot (EVA-07 Jezero West route plan)` and `App.tsx`) actually correct?**
  _`PlanScreen()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `NASA Space Apps Jakarta: Interplanetary Survival Guide: Martian Map`, `03 EVA Map (#/eva)`, `04 FoV Simulation (#/fov)` to the rest of the system?**
  _26 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Map & Route Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.11175616835994194 - nodes in this community are weakly interconnected._
- **Why does `EvaMapScreen()` connect `Map & Route Screens` to `EVA Map Screenshot`, `App Shell, Motion & Controls`, `Fit Layout & Comms/FoV Screens`, `Shared Primitives & Hub`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `fit.tsx` and `Fixed 1366x1024 stage scaled to fit`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Top bar (MARSWALK, EVA-07 Jezero West, tabs, SOL 412 15:38 LMST, MRS-L3, Safe pill)` and `Relay pass arc (MRS-L1, AOS 15:35 to LOS 15:44)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._