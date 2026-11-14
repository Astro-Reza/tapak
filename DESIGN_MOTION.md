---
version: alpha
name: Marswalk Motion
extends: claude/DESIGN.md
description: >
  Motion language for Marswalk. Stepped, frame-snapped "tactical HUD" motion:
  elements build in with a short color-flash sequence, staggered in reading order,
  and leave the same way in reverse. Read together with DESIGN.md; colors, type,
  spacing and the safety rules there always win.
reference:
  source: "Instagram post by carlos___tv (instagram.com/p/DfVUFRwjama), Rive UI interactions influenced by Cyberpunk 2077 and Marathon"
  use: Motion reference only. Do not copy its layout, light-grey palette, pink accent or wording.
motion:
  tick: 50ms              # one "frame". Every structural duration is a multiple of this.
  duration:
    instant: 0ms
    flash: 50ms           # 1 tick: a single color frame inside a sequence
    micro: 100ms          # 2 ticks: hover fill, toggle snap, underline
    short: 150ms          # 3 ticks: one element's full flash-in (accent, inverse, final)
    build: 350ms          # 7 ticks: a full panel build including stagger
    exit: 250ms           # 5 ticks: a full panel collapse (exits are always faster than entries)
    wipe: 200ms           # 4 ticks: a bar or header wiping across
    hold-confirm: 1200ms  # press-and-hold for destructive or committing actions
    map-camera: 400ms     # the only smooth motion: map pan, zoom and fly-to
    camera-fly: 1100ms    # 3D camera flights (globe center, double-click fly-to, intro)
  stagger:
    item: 50ms            # between siblings in a build
    group: 100ms          # between groups (header, then body, then footer)
  easing:
    step-structural: "steps(3, jump-end)"  # panels, chips, bars: snaps, no glide
    step-fine: "steps(6, jump-end)"        # longer wipes and fills
    linear: "linear"                        # progress, hold-to-confirm fill
    map: "cubic-bezier(0.2, 0, 0, 1)"       # map camera only
  flash-sequence:
    # Order of fills an element passes through as it appears, one tick each.
    enter: ["{colors.brand}", "{colors.text-primary}", "final"]
    exit: ["{colors.brand}", "transparent"]
    text-enter: ["{colors.brand}", "final"]
  reduced-motion:
    rule: "Replace every sequence with a single 100ms opacity fade. No flashes, no stagger, no scramble."
---
 
# Marswalk Motion
 
Companion to `DESIGN.md`. That file says what Marswalk looks like; this one says how it moves. Agents building front-end code must read both. If the two ever disagree, `DESIGN.md` wins on color, type, spacing and safety, and this file wins on timing and sequencing.
 
## The reference, decoded
 
The reference is a pair of looping UI clips built in Rive (an inventory "looted item" panel opening from a small target square). What makes it feel modern and tactical, rather than "app-like":
 
1. **No glide.** Nothing eases smoothly. Shapes snap between states in 50 ms steps, like a game UI running at 20 fps on purpose. Size changes are hard cuts.
2. **Color-flash build.** Each element appears by flashing through colors: accent fill, then inverse (black on the light original), then its resting look. A grey button shows up pink for one frame, black for one frame, then grey with its label.
3. **Staggered, in reading order.** The panel builds piece by piece: index tag, connector pixels, header bar, then buttons left to right, then the corner icon. Roughly 50 ms between pieces, whole build about 0.7 s.
4. **Lock-on origin.** Panels are born from the thing they describe. Hovering the target square shows a translucent accent halo. Clicking it throws out a thin outline box with four small "x" corner marks (a targeting reticle), which snaps to the final frame before the panel builds beside it.
5. **Wipes, not fades.** Header bars draw left to right as a solid block, then a thin accent progress line runs inside them before the text appears. Text arrives in the accent color and settles to the normal color one tick later.
6. **Reverse, faster exit.** Closing runs the build backwards (right to left), each piece flashing accent once before it vanishes. The exit is about 0.4 s, quicker than the entry.
7. **Hover = fill plus underline.** Buttons fill solid accent on hover with a thick underline bar along the bottom edge; the underline arrives one tick before the fill.
8. **Directional ticks.** In the second clip, two short accent ticks beside the center dot rotate to point at the cursor, so the panel "tracks" input.
9. **Hold to confirm.** The destructive BURN action turns black on hover with an accent bar along its left edge; it reads as press-and-hold rather than a single tap.
10. **Texture.** A pixel-stair connector and a "glitch barcode" strip of broken grey blocks give the panel a machine-made feel without gradients or shadows.
## How it translates to Marswalk
 
Marswalk is dark, terracotta-accented and safety-first, so the reference is adapted, not copied:
 
| Reference | Marswalk |
| --- | --- |
| Light grey canvas | `surface-base` / `surface-panel` (unchanged from DESIGN.md) |
| Hot pink accent flash | `brand` (terracotta) flash |
| Black inverse flash | `text-primary` (white) inverse flash, one tick only |
| Pink hover fill | `brand` fill with `surface-base` text |
| Black destructive button | `surface-inset` with a `status-danger` edge bar, and only for real danger |
| Glitch barcode strip | Optional decorative loader / footer in `border-default` at low opacity |
 
The status colors (`status-safe`, `status-caution`, `status-danger`) are **never** used as flash colors. A flash of red would read as a hazard. Flashes are always `brand` then `text-primary`.
 
## Principles
 
1. **Snap, don't glide.** Structural UI (panels, chips, bars, rows, toggles) moves in steps. Use `steps()` timing, or animate discrete keyframes. No springs, no overshoot, no bounce.
2. **The map is the exception.** Map pan, zoom and fly-to use `easing.map` and stay smooth. A stepping map is disorienting and makes it hard to keep track of the route.
3. **Everything has an origin.** Panels open from the waypoint, layer or control that called them, using the lock-on pattern. Nothing appears from nowhere.
4. **Reading order.** Builds go left to right, top to bottom, header before body. Exits go in reverse.
5. **Exits are faster.** The astronaut asked for it to go away; get out of the way.
6. **Safety beats style.** Hazard alerts, verdict changes and dose warnings appear in full on the first frame. Their motion only adds emphasis after the information is already readable (see Hazard interrupt). Never stagger, scramble or delay safety information.
7. **Glove and visor.** On EVA screens, total motion per interaction stays under 400 ms, and the visor HUD uses only the hazard interrupt and route-draw patterns.
8. **Respect reduced motion.** Under `prefers-reduced-motion: reduce`, and as a user setting in the app, all sequences collapse to a 100 ms opacity fade.
## Tokens
 
All values are in the YAML header. Name CSS custom properties after the YAML keys:
 
```css
:root {
  --motion-tick: 50ms;
  --motion-duration-flash: 50ms;
  --motion-duration-micro: 100ms;
  --motion-duration-short: 150ms;
  --motion-duration-build: 350ms;
  --motion-duration-exit: 250ms;
  --motion-duration-wipe: 200ms;
  --motion-duration-hold-confirm: 1200ms;
  --motion-duration-map-camera: 400ms;
  --motion-stagger-item: 50ms;
  --motion-stagger-group: 100ms;
  --motion-easing-step-structural: steps(3, jump-end);
  --motion-easing-step-fine: steps(6, jump-end);
  --motion-easing-map: cubic-bezier(0.2, 0, 0, 1);
}
```
 
Never hard-code a duration or easing in a component. If a new timing is needed, add it here first.
 
## Patterns from the reference
 
### 1. Flash-in (the core primitive)
 
Every structural element enters with three one-tick frames: `brand` fill, `text-primary` fill, then its resting style. Text inside it is hidden for the first two ticks, then appears in `brand` and settles to its token color one tick later.
 
```css
@keyframes mw-flash-in {
  0%    { opacity: 1; background: var(--brand); color: transparent; }
  33.3% { background: var(--text-primary); color: transparent; }
  66.6% { background: var(--rest-bg); color: var(--brand); }
  100%  { background: var(--rest-bg); color: var(--rest-fg); }
}
.mw-flash-in {
  animation: mw-flash-in var(--motion-duration-short) steps(1, jump-end) both;
  animation-delay: calc(var(--i, 0) * var(--motion-stagger-item));
}
```
 
Set `--i` on each child to its reading-order index. Use `steps(1)` per keyframe so each frame is a hard cut.
 
### 2. Lock-on open (panel from a target)
 
For waypoint details, layer info, crew tiles and POV preview cards.
 
1. **Halo (hover or focus):** a square at `brand` 35% opacity snaps up around the target in two steps (100 ms).
2. **Reticle (tap):** a 1 px `border-default` outline box with four 6 px "x" marks at the corners appears at target size, then snaps to the panel's anchor size in two steps (100 ms).
3. **Frame:** the outline turns `brand` (1 tick), then the panel's real border.
4. **Build:** connector, header, body, footer run the flash-in with item stagger. Groups are separated by `stagger.group`.
Total: about 350 ms (`duration.build`).
 
### 3. Header wipe
 
Panel title bars draw as a solid `text-primary` block from left to right (`duration.wipe`, `step-fine`), a 3 px `brand` line runs across inside the block, then the bar drops to `surface-inset` and the title text flashes in. Use `clip-path: inset(0 100% 0 0)` to `inset(0 0 0 0)` with stepped timing.
 
### 4. Collapse exit
 
The build in reverse, right to left and bottom to top: each element flashes `brand` for one tick, then disappears. The header shrinks to a dashed `brand` line before vanishing, the reticle shrinks back to the target, and the halo fades. `duration.exit` total.
 
### 5. Hover and press
 
- **Hover / focus (pointer, habitat display):** a 3 px `brand` underline snaps in along the bottom edge, then one tick later the fill snaps to `brand` with `surface-base` text. `duration.micro`.
- **Press:** the fill inverts to `text-primary` for one tick, then the action runs.
- **Touch (tablet, gloves):** no hover state. Show the press inversion and the focus underline only.
- Keyboard focus uses the same underline plus the standard focus ring. Never remove the focus ring.
### 6. Directional ticks
 
Two short 2 px `brand` ticks either side of a center dot that rotate in 15° steps to point toward the thing that matters. In Marswalk: on the POV preview and the waypoint marker, the ticks point toward the next waypoint (heading). Update at most every tick (50 ms).
 
### 7. Hold to confirm
 
For committing a route, deleting a waypoint, or overriding a NO-GO verdict. The button gains a 4 px edge bar on its left that fills top to bottom with `linear` timing over `duration.hold-confirm`. Releasing early snaps the bar back in two steps. On completion, the whole button flashes once (`text-primary`, one tick) and the action runs. Use `status-danger` for the bar only when the action is genuinely dangerous; otherwise `brand`. Give it a visible label ("Hold to delete") and a non-hold alternative for keyboard and switch users (a confirm dialog).
 
## Improvised patterns in the same style
 
These are not in the reference clip; they extend the same language to the rest of Marswalk.
 
### 8. Text decode
 
Labels and headings (never numbers that carry meaning) resolve from scrambled glyphs to the real text, left to right, over 3 to 6 ticks. Use Urbanist with tabular figures and a fixed-width text box for the scramble so the width does not jump. Use on first appearance of a panel title or a screen name only. Do not use on coordinates, metrics, doses or anything someone might read mid-animation.
 
### 9. Stepped readout ticker
 
(Also applies to link budget candles: when a new pass changes the budget, the candles rebuild left to right with flash-in at 50 ms stagger, gains and losses keeping their colors on the final frame.)
 
 
When a metric changes (oxygen, power, distance remaining), the new value is shown immediately; then a 2 px `brand` bar under the number sweeps across once in `step-fine`. The value itself never rolls or counts, so the reading is always correct.
 
### 10. Layer scan reveal
 
Turning a data layer on reveals it over the map in horizontal bands, top to bottom, 6 steps over 300 ms (like a scanline pass), and the layer row's toggle ring snaps to the filled dot in one tick. Turning it off removes it in 3 steps, bottom to top. Opacity changes from the slider stay instant.
 
### 11. Route draw
 
When a route is planned or re-planned, the white `route-path` draws from the start in stepped segments (one segment per tick, capped at 600 ms overall). Each waypoint dot does a mini lock-on (four corner marks converge, then disappear) as the line reaches it. Hazard segments draw in `route-hazard` at the moment they are reached, not after.
 
### 12. Hazard interrupt
 
A hazard alert appears complete and readable on frame one, with no stagger and no build. Emphasis follows: its 2 px `status-danger` border flashes off and on twice (4 ticks each, so under 3 flashes per second, within WCAG 2.3.1), then holds steady. No continuous blinking. On the map, the hazard segment gets the same two flashes in sync.
 
### 13. Verdict stamp
 
The verdict banner wipes in from the left in the status color over `duration.wipe` in stepped timing, and the word (GO, CAUTION, NO-GO) is visible from the first frame of the wipe, sitting on top. Reasons then flash in as a staggered list. When the verdict changes, the old banner collapses right to left (one tick per step) before the new one wipes in, so the change is unmissable.
 
### 14. Pixel-stair loader
 
While a layer or dataset loads, a short row of `border-default` squares lights up in sequence (each `brand` for one tick) like the reference's connector pixels. For longer loads, show the "barcode" strip: broken blocks in `border-default` at 40% opacity shifting one block per tick. Always pair with a text label ("Loading THEMIS layer").
 
### 15. Screen change
 
Moving between Map, Planner and Crew views: the outgoing view is covered by 6 vertical `surface-base` columns that snap in left to right (one per tick), then removed left to right to show the new view. 300 ms each way at most. The top bar stays put throughout so the astronaut never loses the header.
 
### 16. Toast / system message
 
A status line (for example "Route saved", "Comms link degraded") enters as a tag that flashes in, with its text decoding over 3 ticks, holds, then collapses right to left. Comms or safety messages skip the decode.
 
### 17. Selection brackets (the signature)
 
Selecting a map feature, list row or crew member, or marking the one live thing on a screen (next waypoint, satellite in view, active checklist step): four L-shaped corner brackets snap in from 8 px outside the element to its edges in two steps. Deselecting reverses it. This replaces glows and shadows, which DESIGN.md forbids.
 
## Implementation notes
 
- **CSS first.** Most patterns are `@keyframes` with `steps()` timing, `clip-path` wipes and `--i` stagger variables. This keeps them cheap and token-driven.
- **JS libraries.** If the stack uses Framer Motion or GSAP, pass `ease: "steps(3)"` (GSAP) or a stepped keyframe array with `times` and `ease: "linear"` (Framer Motion), and read durations from the CSS variables. No springs.
- **Rive.** The reference was made in Rive. Rive is a good fit for the lock-on reticle, the directional ticks and the hold-to-confirm button as state machines. Keep their colors bound to the same tokens.
- **Map.** Pan, zoom and fly-to use the map library's own camera animation with `duration.map-camera` and the `map` easing. Do not step the map.
- **Performance.** Animate `opacity`, `transform`, `clip-path` and `background-color` only. Never animate layout properties on the map overlay; the map must hold 60 fps on the tablet.
- **Testing.** Check each pattern at 0.25x speed (Chrome DevTools Animations panel) so every tick frame is visible, and check once with reduced motion on.
## Do's and Don'ts
 
Do:
- Use stepped timing for every structural transition.
- Start every panel from its origin with the lock-on pattern.
- Flash `brand` then `text-primary`, one tick each.
- Make exits faster than entries.
- Show safety information on the first frame, then add emphasis.
- Use the Motion variables in Figma (`motion/duration/*`, `motion/stagger/*`) as the source for these values; the Figma section has a Motion storyboard frame showing lock-on, flash-in, hazard interrupt and hold to confirm.
- Provide the reduced-motion fade for every pattern.
Don't:
- Use springs, bounces, overshoot or smooth ease-in-out on panels and controls.
- Flash or animate using `status-safe`, `status-caution` or `status-danger`, except the hazard interrupt and verdict stamp.
- Scramble, count or roll numbers that carry meaning.
- Blink continuously, or flash more than three times a second.
- Delay a hazard, verdict or dose warning behind a build or stagger.
- Step the map camera.