# AR mission package (`marswalk.ar-mission`, version 1)

The phone AR app (Phase 4: Unity + AR Foundation on ARCore / ARKit) follows a planned EVA from this JSON file.
Mission Control computes everything with the science engine; **the phone never re-plans**. It only looks values up
along the profile at the mission clock, and checks its own lookup against the `checks` in the file.

**Export:** Plan screen → **Export AR package** (current mode, rules, suit model and start time). File name
`marswalk-ar-<mode>-<HHMM>.json`, about 26 kB. Builder: `src/sim/ar-package.ts`; tests: `src/sim/ar-package.test.ts`.

## Fields

| Field | Meaning |
| --- | --- |
| `format`, `version` | `"marswalk.ar-mission"`, `1`. Reject anything else. |
| `createdAt` | ISO 8601 time of export. |
| `plan` | The same recipe the light-time link sends (`v`, `mode`, `sliderT`, `modelKey`, `startLmst`, `kSuit`, `o2CapacityL`, `summary`) plus `scienceId`, `policyId`, `verdict`, `reasons`, `cautions`. For display and traceability. |
| `frame` | Mission world frame: metres; **x east, y up (areoid elevation), z south; north is −z**; origin at the terrain patch centre (`origin.lat`, `origin.lon`); `patchSizeM`. |
| `suit` | `o2CapacityL`, `reserveFrac`, `evaLimitMin`, `maxSlopeDeg`, `cautionSlopeDeg`, `stationLpm` (O₂ L/min while stopped, used by the lookup). |
| `route` | Totals at the end: `distanceM`, `durationMin`, `o2UsedL`, `doseMSv`. |
| `profile` | `fields` = `["t","dist","x","y","z","o2","dose","dwell","slope","sky"]` and `rows` (one array per sample, in that order). `t` EVA minutes at departure from the sample, `dist` metres along the route, `x y z` metres, `o2` litres used, `dose` mSv, `dwell` minutes stopped at this sample (0 if none), `slope` degrees, `sky` sky-view fraction. Rounded to cm / 0.1 mL / 1 nSv; the rounded rows are the truth. |
| `waypoints` | `id` (`WP1`…), `name`, `stopId`, `lat`, `lon`, `profileIndex`, `x y z`, `dist`, `arriveT`, `departT`, `dwellMin`, `legMaxSlopeDeg`. WP1 is the start, the last one is the return home. |
| `calibration` | Two `markers` (`origin` at WP1, `heading` at the first waypoint ≥ 50 m away) with `x y z`, and `maxResidualM` (2). |
| `rules` | `progressRequires: { tracking: "normal", calibrated: true, maxResidualM }`, `reanchorAtWaypoints: true`, `scaledModeCountsProgress: false`. |
| `checks` | Golden samples `{ T, k, dwelling, x, y, z, dist, o2, dose }` at the start, before and during every stop, through the walk, at the end, and outside both ends. |
| `credits` | Data credits to show in the app. |

## Lookup at mission minute T (port this exactly)

```
k = 1
while k < rows.length - 1 and rows[k].t < T: k += 1
a = rows[k - 1], b = rows[k]
arrive  = b.t - b.dwell
dwellO2 = b.dwell * suit.stationLpm
span(v) = (v == 0) ? 1 : v
clamp01(v) = min(1, max(0, v))
g    = clamp01((T - a.t) / span(b.t - a.t))
dose = a.dose + g * (b.dose - a.dose)
if T < arrive or b.dwell == 0:                     # walking from a to b
    f = clamp01((T - a.t) / span(arrive - a.t))
    x, y, z, dist = lerp(a, b, f)
    o2 = a.o2 + f * (b.o2 - dwellO2 - a.o2)
    dwelling = false
else:                                               # stopped at b
    x, y, z, dist = b
    o2 = b.o2 - dwellO2 + (T - arrive) * suit.stationLpm
    dwelling = true
```

On load, run the lookup for every entry in `checks` and refuse the file if any value differs by more than 1e-6.
The test suite runs a reference port written from this page (not from the engine) against every check.

## Rules for the AR app

- The camera pose comes only from ARCore / ARKit 6DoF tracking: no joystick, D-pad, simulated rotation or head bob.
- Map the AR session frame onto the mission frame with the two `calibration.markers` (stand on each, confirm). The fit
  residual must be ≤ `maxResidualM`.
- Physical movement counts as route progress only while tracking is `normal` **and** calibrated within tolerance;
  otherwise show a warning and keep the committed route unchanged.
- Tracking drifts by roughly 1–2 % of distance walked: re-anchor at each waypoint marker (`reanchorAtWaypoints`).
- A scaled-down practice walk never counts as route progress (`scaledModeCountsProgress: false`).
- Telemetry (O₂, dose, time) comes from the lookup above, never from the camera pose.
