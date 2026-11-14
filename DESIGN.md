---
version: alpha
name: Marswalk
description: >
  Dark, high-contrast interface for a layered Martian map and Marswalk (single EVA) route planner.
  Built for NASA Space Apps, challenge "Interplanetary Survival Guide: Martian Map".
  Used on a carried tablet, a habitat display and a visor HUD.
companions:
  # Required reading. Any agent or developer using this file must also read these.
  motion: claude/DESIGN-MOTION.md   # motion tokens, timing, sequencing and animation patterns
colors:
  # Surfaces (near-black, so the map and data layers carry the color)
  surface-base: "#060606"
  surface-raised: "#1E1E1E"
  surface-panel: "#222222"
  surface-inset: "#272727"
  surface-top-bar: "#000000"
  surface-scrim: "#060606CC"        # surface-base at 80%, panels over the map or imagery
  # Borders and text
  border-default: "#848484"         # control outlines only (secondary button, pending checkbox)
  border-subtle: "#FFFFFF14"        # hairline, text-primary at 8%: dividers and card outlines
  border-strong: "#FFFFFF"
  text-primary: "#FFFFFF"
  text-secondary: "#BDBDBD"
  text-muted: "#848484"
  # Brand (Mars terracotta)
  brand: "#D9663A"
  brand-soft: "#F2A47E"
  brand-deep: "#8C3B20"
  # Status (reserved for safety meaning only)
  status-safe: "#1FE53A"
  status-caution: "#FFD60A"
  status-danger: "#FF2A1F"
  status-caution-tint: "#FFD60A2E"  # caution at 18%, hazard time windows
  # Route
  route-path: "#FFFFFF"
  route-waypoint: "#D9663A"
  route-hazard: "#FF2A1F"
  # Data layer ramps (low -> high)
  data-slope-low: "#1FE53A"
  data-slope-mid: "#FFD60A"
  data-slope-high: "#FF2A1F"
  data-mineral-low: "#1A0B2E"
  data-mineral-high: "#FF00E5"
  data-thermal-low: "#00F0F0"
  data-thermal-mid: "#FFFFFF"
  data-thermal-high: "#FF2A1F"
  data-radiation-low: "#2400FF"
  data-radiation-high: "#FFD60A"
  data-link-low: "#0E2240"          # relay link margin ramp, low
  data-link-high: "#8FD3FF"         # relay link margin ramp, high; also the "radio" hue
  # Link budget candles (relative change only, never a verdict)
  data-budget-gain: "#2EB872"
  data-budget-loss: "#D9483F"
typography:
  wordmark:
    fontFamily: Geologica
    fontWeight: 600
    fontSize: 36px
  display-readout:
    fontFamily: Geologica
    fontWeight: 600
    fontSize: 64px
  display-metric:
    fontFamily: Geologica
    fontWeight: 500
    fontSize: 40px
  heading-l:
    fontFamily: Geologica
    fontWeight: 600
    fontSize: 28px
  heading-m:
    fontFamily: Geologica
    fontWeight: 500
    fontSize: 20px
  heading-s:
    fontFamily: Geologica
    fontWeight: 500
    fontSize: 17px
  body-l:
    fontFamily: Geologica
    fontWeight: 400
    fontSize: 20px
  body-m:
    fontFamily: Geologica
    fontWeight: 400
    fontSize: 16px
  body-s:
    fontFamily: Geologica
    fontWeight: 400
    fontSize: 14px
  label-m:
    fontFamily: Geologica
    fontWeight: 500
    fontSize: 17px
  label-unit:
    fontFamily: Geologica
    fontWeight: 400
    fontSize: 16px
  caption:
    fontFamily: Geologica
    fontWeight: 400
    fontSize: 11px
  data-coordinate:
    fontFamily: Urbanist
    fontWeight: 500
    fontSize: 16px
    fontFeature: tnum
  data-telemetry:
    fontFamily: Urbanist
    fontWeight: 500
    fontSize: 14px
    fontFeature: tnum
rounded:
  sm: 8px
  md: 16px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 40px
  touch-glove: 56px
  control-height: 36px
  search-height: 52px
  top-bar-height: 86px
  rail-width: 328px
  layer-panel-width: 304px
components:
  search-field:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.surface-panel}"
    typography: "{typography.body-m}"
    rounded: "{rounded.pill}"
    height: 36px
    padding: 16px
  panel:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-m}"
    rounded: "{rounded.sm}"
    padding: 16px
  layer-row:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label-m}"
    rounded: "{rounded.sm}"
  map-control:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.surface-panel}"
    rounded: "{rounded.sm}"
    height: 36px
    width: 36px
  status-chip-safe:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-s}"
    rounded: "{rounded.pill}"
    padding: 12px
  status-chip-caution:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-s}"
    rounded: "{rounded.pill}"
    padding: 12px
  status-chip-danger:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-s}"
    rounded: "{rounded.pill}"
    padding: 12px
  hazard-alert:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-s}"
    rounded: "{rounded.sm}"
    padding: 16px
  metric-tile:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    typography: "{typography.display-metric}"
    rounded: "{rounded.sm}"
    padding: 12px
---
 
# Marswalk Design System
 
Source of truth for the Marswalk look and behavior. Figma: file "Marswalk - Palatine", page "Brand Style Guide" (board "Brand Style Guide — Marswalk (16:4)"). Every value above exists as a Figma variable or text style with the same name. This file follows the DESIGN.md format (YAML tokens for machines, prose for the reasoning).
 
> **Read with `DESIGN-MOTION.md`.** This file covers how Marswalk looks. `claude/DESIGN-MOTION.md` (same project, listed under `companions.motion` above) covers how it moves: motion tokens, timing, easing and every animation pattern. Agents and developers building front-end code must read both files before writing UI. Where they overlap, this file wins on color, type, spacing and safety; the motion file wins on timing and sequencing.
 
## Overview
 
Marswalk helps one astronaut pair plan a single surface excursion. The screen must answer three questions at a glance: where am I, where next, and what is in the way.
 
The personality is calm, technical and trustworthy. It sits closer to a flight-control display than a consumer app. The reference is Revel's telemetry dashboards (near-black canvas, thin dividers, tabular readouts, red only when something is wrong) and the Telemetrix guide for structure.
 
### Direction (unslop pass, Nov 2026)
 
- **Product.** Plans and runs one Mars surface walk for an astronaut pair: route, hazards, consumables and relay comms in one place.
- **Character.** Exact, sober, field-worn.
- **World.** A night-shift flight-control console next to rust regolith. Graphite neutrals, terracotta from the dust as the one accent, ice blue reserved for radio link data.
- **Moments.** Where the rich color is allowed: the map (route line plus stepped data cells), the sky-dome link chart and link budget candles on Comms, and the surface photo on FoV. Everything else is quiet chrome.
- **Signature.** Lock-on corner brackets (`brand`, 2 px, 10 px arms) mark the one live thing on a screen: the next waypoint, the satellite in view, the active checklist step. One per screen. Never decoration.
Figma: section "Marswalk v1 · iPad screens + components (Claude)" on the Scratches page holds the component board and eight screens (Hub, Plan, EVA Map, FoV, Comms link budget, Comms pass prediction, Debrief, Motion storyboard).
 
Principles, in priority order:
 
1. **Safety first.** Hazards (steep slope, boulders, radiation, cold) outrank decoration. Red, amber and green mean status and nothing else.
2. **Glanceable in a suit.** Large type, high contrast on near-black, targets of at least 56 px for gloved fingers.
3. **Layered, never cluttered.** Four toggleable science layers over real Mars imagery. Show only the layers the current task needs.
4. **Route-centric.** The route, waypoints and hazards are the brightest marks on the map.
5. **Tokens over values.** Use variables and text styles. Never write raw hex, pixel spacing, font sizes, durations or easing in screens or code.
## Colors
 
The palette is near-black neutrals plus one brand color from Martian terrain. All other color carries meaning.
 
- **Surfaces.** `surface-base` is the canvas, `surface-raised` is a column or card, `surface-panel` is a floating panel on the map, `surface-inset` is a well or chart area, `surface-top-bar` is the header strip. Depth comes from lightness steps, not shadows.
- **Text.** `text-primary` for content, `text-secondary` for supporting copy, `text-muted` for captions and sources. `text-muted` on a light fill fails contrast. Do not use it on white.
- **Brand.** `brand` (terracotta) is the single accent and is used rarely: the primary action, the active tab underline, the signature brackets, the "now" marker, route waypoints and the wordmark. Not on progress bars, checkboxes or decorative strokes. `brand-soft` and `brand-deep` for tints on imagery. `brand` is also the flash color in motion sequences (see DESIGN-MOTION.md).
- **Borders.** Dividers and card outlines are hairlines in `border-subtle` (white at 8%). `border-default` is for control outlines only (secondary button, empty checkbox). Panels over the map use `surface-scrim`.
- **Translucency is a token.** Figma drops paint opacity on variable-bound colors, so translucent colors live in the variable itself (`surface-scrim`, `border-subtle`, `status-caution-tint`). Never fake it with a paint opacity.
- **Status.** `status-safe`, `status-caution`, `status-danger`. The planner verdict maps to them: GO to safe, CAUTION to caution, NO-GO to danger. Never use these for decoration or for data ramps in a way that reads as a verdict.
- **Route.** `route-path` (white) is the planned line. `route-waypoint` marks stops. `route-hazard` (red) marks a segment that breaks a limit.
- **Data layers.** Each layer has a fixed ramp, always drawn low to high, left to right:
| Layer | Range | Ramp | Candidate NASA source |
| --- | --- | --- | --- |
| Slope | 0 to 35 deg | green, yellow, red | MOLA / HiRISE terrain model |
| Hydrated minerals | 0.15 to 1.0 index | dark purple, magenta | CRISM spectral data |
| Thermal inertia | 120 to 720 SI | cyan, white, red | THEMIS |
| Dose rate (quiet) | 0.56 to 0.65 mSv/day | blue, yellow | MSL RAD |
| Relay link margin | −6 to +18 dB | navy, ice | Modelled (see Comms) |
 
- **Link budget candles.** `data-budget-gain` (green) and `data-budget-loss` (red) are used only inside the link budget candle chart, where they mean "this stage adds dB" or "removes dB". They are deliberately duller than the status colors, and the verdict for a link is always the status chip next to the chart, never the candle color.
Slope uses the status colors on purpose: steep is dangerous. The other three ramps avoid pure red/green meaning where possible, so a magenta or cyan area never reads as a verdict. The source column is a suggestion until the layers are wired to real datasets.
 
Accessibility: never rely on color alone. Pair every status color with a word (Safe, Caution, Danger, Offline) or an icon, and every ramp with its low and high numbers.
 
## Typography
 
Two families only. No JetBrains Mono or other monospace.
 
- **Geologica** for interface, headings and labels. Weights 400, 500 and 600. No 700+, no italic.
- **Urbanist** for coordinates, telemetry, times and chart labels (`data-*` styles). Always set `font-variant-numeric: tabular-nums` in code so digits do not jump as values update.
Rules:
- Hierarchy comes from size and color, not weight.
- Sentence case everywhere ("Distance", "System log"), no uppercase tracked labels.
- Big numbers use `display-readout` or `display-metric` with the unit in `label-unit` beside it, upright, in `text-secondary` (for example "0.58" then "mSv/day").
- Layer and panel titles use `label-m`; section titles `heading-s` to `heading-l`.
- Coordinates, timestamps and raw readouts use `data-coordinate` or `data-telemetry`.
- `caption` (11 px) is for source credits and notes only. Do not put essential information in it.
- Always show units. A bare number is a bug.
## Layout
 
- Spacing scale: 4, 8, 12, 16, 24, 32, 40. Use `spacing.lg` (16) inside panels, `spacing.xl` (24) between blocks.
- **Tablet (iPad Pro 12.9", 1366 x 1024).** Carried on the surface. Top bar 86 px, left rail 328 px, map fills the rest, layer panel 304 px floats top-right, route profile docks along the bottom, map controls bottom-right.
- **Habitat display (1920 x 1080).** Pre-EVA route planning. More room for the layer panel, route profile and the stop list.
- **Visor HUD (concept).** Reduced layers: route, hazards and dose only. Large type, no panels, nothing that needs a tap.
- Touch targets are at least `spacing.touch-glove` (56 px) on EVA screens. The 36 px `control-height` is for habitat or desk use only.
- Map-first: the map is always the largest element. Panels float over it and must not hide the route.
## Elevation and Depth
 
Flat. Hierarchy comes from surface lightness (`surface-base` to `surface-raised` to `surface-panel` to `surface-inset`) and 1 px `border-subtle` hairlines. No drop shadows, glows or blurred color blobs. Panels over the map use `surface-scrim` so the terrain shows through. Data layers on the map are drawn as stepped square cells (24 px grid, 2 px gap) at the layer's opacity, not as soft blurred patches.
 
Stroke weights: 1 px for dividers and card outlines, 2 px for toggle rings, hazard card border and the route line, 3 px for emphasis strokes.
 
## Shapes
 
- `rounded.sm` (8 px) for panels, tiles, cards and buttons.
- `rounded.md` (16 px) for large containers (columns, sheets).
- `rounded.pill` for the search field, status chips and tags.
- Gradient bars are 10 to 14 px tall with fully rounded ends.
- Icons are simple, filled or 2 px stroke, in `surface-panel` on white buttons or `text-primary` on dark.
## Motion
 
Full spec: `claude/DESIGN-MOTION.md`. Summary for anyone skimming this file:
 
- **Stepped, tactical HUD motion.** Panels, chips, bars and controls snap in 50 ms steps (`steps()` timing). No springs, bounces or smooth ease-in-out.
- **Flash-in build.** Elements appear by flashing `brand`, then `text-primary`, then their resting style, staggered in reading order. Exits run in reverse and are faster.
- **Lock-on origin.** Panels open from the waypoint, layer or control that called them, with a halo, a reticle with corner marks, then the build.
- **The map is the exception.** Pan, zoom and fly-to stay smooth.
- **Safety first.** Hazard alerts, verdicts and dose warnings are readable on the first frame; motion only adds emphasis afterwards. Status colors are never used as flash colors.
- **Reduced motion.** Every pattern falls back to a 100 ms opacity fade.
Use the `motion.*` tokens from DESIGN-MOTION.md for every duration, stagger and easing.
 
## Components
 
Each component's enter, exit, hover and press behavior follows the patterns in DESIGN-MOTION.md (lock-on open, flash-in, header wipe, collapse exit, hover underline, hold to confirm, hazard interrupt, verdict stamp, route draw, layer scan reveal).
 
- **Search field.** White pill, 36 px high, placeholder in `surface-panel`, search icon at the right.
- **Layer panel.** One row per layer: toggle ring (20 px, filled center dot when active), name in `label-m`, unit in `label-unit` right-aligned, gradient bar, then low and high values in `data-telemetry`. Four rows: Slope, Hydrated Minerals, Thermal Inertia, Dose Rate (quiet).
- **Map controls.** White 36 px squares: north arrow, locate, zoom in and out stacked.
- **Route profile.** Docked panel with title, summary stats (distance, climb, max slope) and an elevation chart. White line for the route, red thicker segment where a limit is broken, waypoint dots in `route-waypoint` with a white ring.
- **Waypoint row.** Dot, "WP# · name" in `label-m`, coordinate in `data-telemetry`, status chip at the right.
- **Status chip** (Figma component set "Status Chip", variants Safe, Caution, Danger, Offline). Pill on `surface-inset` with a colored 8 px dot, the status word, and a `border-subtle` hairline. The dot carries the color; the ring does not.
- **Hazard alert.** `surface-panel` card with a 2 px `status-danger` border, a red triangle, a one-line title with the number that matters (for example slope and length), and one line saying what to do instead.
- **Crew status tile.** Pair name, status chip, team tags (EVA-1, EVA-2, Rover) and four metric tiles (oxygen, power, dose rate, comms link) in `display-metric`.
- **Radiation status.** Dose-rate ramp with a white marker at the current value, low and high numbers, and a plain-language line ("Quiet conditions").
- **POV preview card.** Image of the arrival view with a map tag ("POV · WP3"), a title ("What to expect at WP3") and a short description of ground and slope. Replace the placeholder with real NASA surface imagery and always credit the source.
- **Verdict banner** (component set "Verdict Banner", GO / CAUTION / NO-GO). Quiet `surface-panel` strip with a 4 px left edge in the status color, the verdict word in the status color (`heading-l`), then the reasons in `text-secondary` (stops reached, time vs cap, steepest step, dose, dust, relay coverage). Not a full-color slab: the map stays the brightest thing on the planner.
- **Metric tile** (Size L / S). Label, number + unit, and a comparison line ("+0.12 km vs plan"). No decorative mini-bars; the optional progress bar is off by default and neutral when used.
- **Checklist item** (Done / Active / Pending). Done is a neutral filled box with a check; Active gets the signature brackets; Pending is an empty `border-default` box.
- **Pass row** (In view / Next / Later). Satellite icon in the text color, name, AOS → LOS window, max elevation and uplink margin. In view gets the signature brackets. A pass whose max elevation is below θmin says so ("below θmin") and shows a negative margin.
- **Timeline bar** (Task / Comms pass / Hazard window / Rover). Tasks are neutral `surface-raised`, comms passes use the link hue, hazard windows `status-caution-tint`, rover moves are dashed outlines.
- **Budget candle + candle wick.** See "Comms: link budget" below.
- **Map tag, satellite marker, waypoint marker, search field, map control, panel header, stat row, log line, layer row (incl. Relay Link Margin), button (Primary / Secondary / Ghost / Hold to confirm), top bar, nav tab, 16 line icons.** All live on the Components board in Figma with text properties for their copy.
## Comms: link budget
 
The comms screens implement the elevation-based statistical link budget from the team's Orbit-Link proposal (after Gongora-Torres et al., 2022, IEEE Access 10). Elevation θ of a relay pass is treated as a gamma-distributed random variable instead of a best/worst case.
 
- **Inputs shown.** Shape k and scale λ of the fitted gamma distribution, mean elevation E[θ], θmin (the elevation where Pr(θ) = Pth), outage probability P_out = F(θmin), expected received power E[Pr] with its spread, threshold Pth, margin E[Pr] − Pth and the quartiles of Pr.
- **Sky dome.** The main chart. A half-dome from horizon to zenith, each 3° wedge shaded on the `data-link` ramp by the uplink margin at that elevation; below θmin the wedge is shaded as outage with a dashed `status-danger` boundary. The live relay sits on its pass track with the signature brackets.
- **Candlestick link budget** (Receive = relay → suit, Transmit = suit → relay). Each stage of the signal path is a candle, read left to right: transmitter icon, Pt and Gt (gains, green), free-space loss, dust and pointing (losses, red), receive antenna icon, Gr (gain), then a hollow E[Pr] candle drawn from Pth up to the expected received power. The candle body is the stage value at E[θ]; the wick is its spread over the elevation quartiles Q1–Q3, so path loss shows how much a pass swings and the E[Pr] wick shows when the link dips under Pth. The y axis is broken between the transmit band (dBW near 0) and the receive band (around −125 to −137 dBW) with a zigzag across the path-loss candle. The margin, outage and status chip sit to the right.
- **Values in the prototype are modelled, not measured** (UHF 401.6 MHz, relays at 400 km, k = 2.4, λ = 14.8°). Label them as simulated.
## Behavior and Data Honesty
 
- The prototype terrain, minerals, thermal inertia, boulders, dose and temperature are **synthetic**. Label any screen that shows synthetic data as such. Never present demo numbers as Mars measurements.
- Show where a number came from (instrument or model) and its resolution in `caption` text or a details view. Confirm each source on its product page before quoting it.
- Routes are shown as "planned" and verdicts as planning aids, not guarantees. Risk is relative, not a predicted fall.
- Layer toggles never change data, only visibility. Opacity of an active layer is adjustable, but the ramp and its numbers stay fixed.
- A hazard on the route always surfaces in two places: red on the map or profile, and a hazard alert with an alternative.
- Animated numbers never roll, count or scramble. The correct value is shown on the first frame.
## Do's and Don'ts
 
Do:
- Use semantic tokens (`status-danger`) in screens and code, never primitives or raw hex.
- Pair each color meaning with text or an icon.
- Keep the route the highest-contrast element on the map.
- Show units and low/high values with every ramp.
- Keep touch targets at 56 px or larger on EVA screens.
- Keep text on near-black at `text-primary` or `text-secondary`.
- Read DESIGN-MOTION.md before animating anything, and use its `motion.*` tokens.
- Keep one bright moment per screen (map, sky dome, photo) and quiet chrome around it.
- Use sentence case, upright units and tabular figures.
Don't:
- Use JetBrains Mono or any other monospace, italic, or weights above 600.
- Put the accent on progress bars, checkboxes or decoration.
- Use paint opacity on a variable-bound color; use the translucent token instead.
- Use emoji as icons or end labels with periods.
- Use red, amber or green for anything except status, hazard or slope.
- Add shadows, glows or decorative gradients outside the data ramps.
- Put more than four layers on screen at once or add a fifth ramp without a new, distinct hue.
- Place essential information in `caption` text.
- Use `text-muted` on light fills.
- Present synthetic data as real, or a planned route as safe by default.
- Hard-code durations or easing, or use springs and smooth eases on panels and controls.
## Naming and Handoff
 
- Figma variables use slashes (`status/danger`, `data/slope/high`). CSS variables use hyphens, for example `--status-danger`, and the same names as the YAML keys above.
- Motion tokens live in DESIGN-MOTION.md and follow the same rule, prefixed `motion` (for example `--motion-duration-build`, `--motion-easing-step-structural`).
- Collections: Primitives, Color (mode Dark), Spacing, Size, Radius, Stroke, Motion (durations and staggers in ms, hidden from property pickers). Add new colors as primitives first, then alias them in Color. Translucent tokens (`surface/scrim`, `border/subtle`, `status/caution-tint`) hold their alpha in the variable value.
- Text styles are named `Group/Name` (for example `Display/Metric`, `Data/Coordinate`, `Label/Unit`).
- When adding a component, build it in Figma with variable bindings, add a variant set if it has states, add its entry to the `components` block here, and name its motion pattern from DESIGN-MOTION.md.