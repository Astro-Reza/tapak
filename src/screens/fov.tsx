import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OrthoBasemap, WaypointDot } from "@/components/marswalk/map";
import { useFit } from "@/components/marswalk/fit";
import { MapTag } from "@/components/marswalk/primitives";
import { sampleAt, status, type Evaluation, type MissionResult, type ProfileSample, type Sample, type Suit } from "@/engine";
import { isReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ORTHO } from "@/sim/load";
import { MissionGate } from "@/sim/controls";
import { useMission } from "@/sim/mission";
import { TerrainView, FOV_V, type TerrainApi } from "@/sim/terrain-view";
import { arrivalIndices, fitProjection, fmtHM, nextArrival } from "@/sim/view";
import { BOB_LEVELS, BOB_REST, composeCamera, damp, dampAngle, samePose, stepBob, type BobLevel, type CameraPose } from "@/sim/fov/camera-rig";
import { EXPLORE_FAST_X, EXPLORE_MPS, stepExplore, type MoveInput } from "@/sim/fov/explore";
import { readInput, useFovInput } from "@/sim/fov/input";
import { pointAtDist, routeHeading, stepRoute, WALK_RATES, type WalkRate } from "@/sim/fov/route-walker";
import { heightAt, terrainBounds, toCompassDeg, type WorldXZ } from "@/sim/fov/world";

/** Elevation ruler: 0° at 607 px, 6 px per degree, major tick every 10°. */
const ELEVATION = { zero: 607, pxPerDeg: 5.99, satellite: 25, passMax: 29 };
/** Azimuth ruler: 19.5 px per degree; the strip is centred on where the camera looks. */
const AZIMUTH = { pxPerDeg: 19.5, satellite: 22 };
const azLabel = (deg: number) => { const d = ((Math.round(deg) % 360) + 360) % 360; return d === 0 ? "N" : d === 90 ? "E" : d === 180 ? "S" : d === 270 ? "W" : String(d).padStart(3, "0"); };

/** The Figma frame the camera scene is drawn in. */
const SCENE = { width: 1366, height: 938 };
/** Elevation ruler span in scene pixels (top edge and height). */
const ELEVATION_RULER = { top: 96, height: 608 };
/** Keeps the ruler clear of the minimap / tag row at the top of the screen. */
const RULER_MIN_TOP = 72;

const elevationTicks = Array.from({ length: 19 }, (_, i) => i * 5);

type Mode = "route" | "explore";

/** HUD snapshot, refreshed from the animation loop at ~15 Hz (the 3D view itself draws every frame). */
type Hud = {
  T: number;
  dist: number;
  o2Pct: number;
  nextLabel: string;
  nextM: number;
  nextMin: number;
  dwelling: boolean;
  lookDeg: number;
  walkDeg: number;
  exploredM: number;
  pos: WorldXZ;
};

/**
 * 04 · FoV Simulation (During EVA): first-person 3D view on the HiRISE DTM.
 * Follow route walks the computed plan on the mission clock shared with EVA Map; the head looks
 * around on its own. Free explore walks anywhere on the terrain without touching the plan.
 */
export function FovScreen() {
  return (
    <MissionGate>
      <FovLoaded />
    </MissionGate>
  );
}

function FovLoaded() {
  const { ev } = useMission();
  if (!ev?.prof || !ev.end) return <p role="alert" className="p-xl t-body-m text-danger">No route: {ev?.error}</p>;
  return <FovScene ev={ev} />;
}

/** HUD numbers from the same engine sample the walk uses, with EVA Map's next-stop rule. */
function hudFor(
  ctx: { prof: ProfileSample[]; arrivals: number[]; end: ProfileSample; suit: Suit; env: MissionResult["env"] },
  sm: Sample,
  mode: Mode,
  pos: WorldXZ,
  yaw: number,
  heading: number,
  exploredM: number,
): Hud {
  const nx = nextArrival(ctx.prof, ctx.arrivals, sm.t);
  return {
    T: sm.t,
    dist: sm.dist,
    o2Pct: status(sm as unknown as ProfileSample, ctx.end, ctx.suit, ctx.env).o2Pct,
    nextLabel: nx.label,
    nextM: mode === "route" ? Math.max(0, nx.point.dist - sm.dist) : Math.hypot(nx.point.x - pos.x, nx.point.z - pos.z),
    nextMin: nx.minutes,
    dwelling: sm.dwelling,
    lookDeg: toCompassDeg(yaw),
    walkDeg: toCompassDeg(heading),
    exploredM,
    pos,
  };
}

const PAD: { label: string; text: string; col: number; move: Partial<MoveInput> }[] = [
  { label: "Walk forward", text: "↑", col: 2, move: { forward: 1 } },
  { label: "Step left", text: "←", col: 1, move: { right: -1 } },
  { label: "Step right", text: "→", col: 3, move: { right: 1 } },
  { label: "Walk back", text: "↓", col: 2, move: { forward: -1 } },
];

function FovScene({ ev }: { ev: Evaluation }) {
  const [ref, box] = useFit(SCENE, "cover", { x: 683, y: 560 });
  const s = box.scale;
  const { data, result, evaT, setEvaT, playing, setPlaying } = useMission();
  const prof = ev.prof as ProfileSample[];
  const end = ev.end!;
  const suit = result!.s;
  const env = result!.env;
  const grid = data!.grid;
  const arrivals = useMemo(() => arrivalIndices(ev), [ev]);
  const ground = useCallback((x: number, z: number) => heightAt(grid, x, z), [grid]);
  const bounds = useMemo(() => terrainBounds(data!.terrain.size), [data]);
  const mini = useMemo(() => fitProjection(prof, { x0: 24, y0: 24, x1: 232, y1: 168 }, data!.terrain), [prof, data]);

  const [mode, setMode] = useState<Mode>("route");
  const [rate, setRate] = useState<WalkRate>(60);
  const [bobLevel, setBobLevel] = useState<BobLevel>(() => (isReducedMotion() ? "off" : "normal"));
  const [walking, setWalking] = useState(false);
  const [fast, setFast] = useState(false);
  const cfg = useRef({ mode, rate, bobLevel, walking });
  cfg.current = { mode, rate, bobLevel, walking };

  const viewRef = useRef<HTMLDivElement>(null);
  const { input, locked } = useFovInput(viewRef);
  input.current.pad.fast = fast;
  const api = useRef<TerrainApi | null>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const finePointer = useMemo(() => window.matchMedia("(pointer: fine)").matches, []);

  // Astronaut + camera state, mutated by the animation loop (not React state: it changes every frame).
  const [init] = useState(() => {
    const T = Math.min(evaT, end.t);
    const sm = sampleAt(prof, T, suit);
    return { T, sm, heading: routeHeading(prof, sm.dist) ?? 0, pos: { x: sm.x, z: sm.z } };
  });
  const sim = useRef({
    T: init.T,
    syncedT: init.T,
    heading: init.heading,
    basePitch: 0,
    bob: BOB_REST,
    explore: init.pos as WorldXZ,
    exploredM: 0,
    pose: null as CameraPose | null,
    dirty: true,
    snap: true,
    resetting: false,
  });
  const ctx = useMemo(() => ({ prof, arrivals, end, suit, env }), [prof, arrivals, end, suit, env]);
  const [hud, setHud] = useState<Hud>(() => hudFor(ctx, init.sm, "route", init.pos, init.heading, init.heading, 0));

  const onReady = useCallback((a: TerrainApi | null) => {
    api.current = a;
    sim.current.dirty = true;
  }, []);

  // One clock for the whole app: if EVA Map was playing, FoV takes the walk over and hands it back on leave.
  useEffect(() => {
    if (playing) {
      setPlaying(false);
      setWalking(true);
    }
    return () => {
      setEvaT(sim.current.T);
      if (cfg.current.walking && cfg.current.mode === "route") setPlaying(true);
    };
  }, []); // mount / unmount only

  useEffect(() => {
    let raf = 0, last = performance.now(), lastHud = 0, lastSync = 0, hudKey = "";
    const st = sim.current;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); // a stall (hidden tab) never becomes a jump
      last = now;
      const c = cfg.current, inp = input.current;
      const move = readInput(inp, dt);
      if (st.resetting) {
        inp.look.yaw = damp(inp.look.yaw, 0, 8, dt);
        inp.look.pitch = damp(inp.look.pitch, 0, 8, dt);
        if (Math.abs(inp.look.yaw) + Math.abs(inp.look.pitch) < 1e-3) {
          inp.look.yaw = inp.look.pitch = 0;
          st.resetting = false;
        }
      }

      // Route progress only advances in Follow route; in Free explore the mission clock is held.
      const { T, step } = stepRoute(prof, suit, Math.min(st.T, end.t), c.mode === "route" && c.walking ? dt : 0, c.rate, end.t);
      st.T = T;
      if (c.walking && T >= end.t) setWalking(false);

      let x: number, z: number, walkMps: number;
      if (c.mode === "route") {
        ({ x, z } = step.sample);
        walkMps = step.walkMps;
        const h = routeHeading(prof, step.sample.dist);
        if (h != null) st.heading = st.snap ? h : dampAngle(st.heading, h, 2.5, dt);
        // as the original 30 m look-ahead point: tilt gently up or down the slope ahead
        const ahead = pointAtDist(prof, step.sample.dist + 30);
        const span = Math.max(Math.hypot(ahead.x - x, ahead.z - z), 10);
        const tilt = 0.6 * Math.atan2(heightAt(grid, ahead.x, ahead.z) - heightAt(grid, x, z), span);
        st.basePitch = st.snap ? tilt : damp(st.basePitch, tilt, 2, dt);
        st.explore = { x, z };
      } else {
        const r = stepExplore(st.explore, move, st.heading + inp.look.yaw, dt, bounds);
        st.explore = r.p;
        st.exploredM += r.movedM;
        ({ x, z } = r.p);
        walkMps = dt > 0 ? r.movedM / dt : 0;
        st.basePitch = damp(st.basePitch, 0, 2, dt);
      }
      st.snap = false;
      st.bob = stepBob(st.bob, dt, walkMps, BOB_LEVELS[c.bobLevel]);
      const pose = composeCamera({ x, z, ground: heightAt(grid, x, z), heading: st.heading }, st.basePitch, inp.look, st.bob);

      const a = api.current;
      if (a && (st.dirty || !samePose(st.pose, pose))) {
        a.draw(pose);
        st.pose = pose;
        st.dirty = false;
        // next-stop tag follows the waypoint on screen, written straight to the DOM
        const nx = nextArrival(prof, arrivals, st.T).point;
        const [p] = a.project([{ x: nx.x, y: heightAt(grid, nx.x, nx.z) + 1, z: nx.z }]);
        const tag = tagRef.current;
        if (tag) {
          tag.style.visibility = p.visible ? "visible" : "hidden";
          tag.style.transform = `translate(${p.x}px, ${p.y - 8}px) translate(-50%, -100%)`;
        }
      }

      if (now - lastHud > 66) {
        lastHud = now;
        const next = hudFor(ctx, step.sample, c.mode, { x, z }, pose.yaw, st.heading, st.exploredM);
        const key = [next.T.toFixed(2), next.nextLabel, Math.round(next.nextM), next.lookDeg.toFixed(1), Math.round(next.walkDeg), Math.round(next.exploredM), x.toFixed(1), z.toFixed(1)].join("|");
        if (key !== hudKey) {
          hudKey = key;
          setHud(next);
        }
      }
      // keep EVA Map, Hub and Comms on the same clock (4 Hz is plenty for a minutes-scale clock)
      if (st.T !== st.syncedT && now - lastSync > 250) {
        lastSync = now;
        st.syncedT = st.T;
        setEvaT(st.T);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [prof, end, suit, grid, arrivals, bounds, input, setEvaT, ctx]);

  /* ---------- actions ---------- */

  const jump = (T: number) => {
    const st = sim.current;
    st.T = Math.min(Math.max(T, 0), end.t);
    st.snap = true; // a jump is a teleport: no slow swing of the heading
    st.syncedT = st.T;
    setEvaT(st.T);
  };
  const toggleWalk = () => {
    if (!walking && sim.current.T >= end.t) jump(0);
    setWalking(!walking);
  };
  const restart = () => {
    jump(0);
    setWalking(true);
  };
  const changeMode = (m: Mode) => {
    if (m === mode) return;
    if (m === "explore") {
      setWalking(false); // the mission clock waits while you explore
      sim.current.exploredM = 0;
    } else {
      sim.current.snap = true; // back on the route at the mission clock
      setFast(false);
    }
    setMode(m);
  };
  const press = (m: Partial<MoveInput>) => (e: ReactPointerEvent) => {
    e.preventDefault();
    Object.assign(input.current.pad, m);
  };
  const release = () => Object.assign(input.current.pad, { forward: 0, right: 0 });

  const scene = (
    <>
      <TerrainView className="absolute inset-0" route={prof} heightAt={ground} onReady={onReady} />
      {/* look surface: drag to look around; touch-none keeps the page from scrolling */}
      <div
        ref={viewRef}
        role="application"
        aria-label="3D view. Drag to look around; arrow keys turn the view."
        className={cn("absolute inset-0 touch-none select-none", locked ? "cursor-none" : "cursor-grab active:cursor-grabbing")}
      />
    </>
  );

  /* ---------- layout ---------- */

  const hdg = hud.lookDeg;
  const rulerTop = box.y + ELEVATION_RULER.top * s;
  const rulerBottom = rulerTop + ELEVATION_RULER.height * s;
  const elevTop = Math.max(rulerTop, RULER_MIN_TOP);
  const elevShift = rulerTop - elevTop;
  const elevY = (deg: number) => (ELEVATION.zero - deg * ELEVATION.pxPerDeg) * s + elevShift;
  const width = box.width;
  const azX = (deg: number) => width / 2 - 24 + (((deg - hdg + 540) % 360) - 180) * AZIMUTH.pxPerDeg * s;
  const azimuthTicks = Array.from({ length: 41 }, (_, i) => Math.round(hdg / 5) * 5 - 100 + i * 5);
  const [mx, my] = mini.px(hud.pos.x, hud.pos.z);
  const pct = Math.round((100 * hud.dist) / (end.dist || 1));
  const done = hud.T >= end.t;

  return (
    <div ref={ref} className="relative h-full min-h-[520px] overflow-hidden">
      {scene}
      <div ref={tagRef} className="pointer-events-none absolute top-0 left-0" style={{ visibility: "hidden" }}>
        <MapTag>{`${hud.nextLabel} · ${Math.round(hud.nextM)} m`}</MapTag>
      </div>

      {/* ---------- Screen chrome ---------- */}

      {/* Minimap */}
      <div className="mw-flash-in pointer-events-none absolute top-lg left-lg h-[144px] w-[192px] overflow-hidden rounded-sm border border-line-subtle bg-canvas md:top-xl md:left-xl md:h-[192px] md:w-[256px]">
        <div className="absolute top-0 left-0 h-[192px] w-[256px] origin-top-left scale-75 md:scale-100">
          <OrthoBasemap src={ORTHO} {...mini.basemap} />
          <svg width={256} height={192} viewBox="0 0 256 192" fill="none" aria-hidden="true" className="absolute -top-px -left-px">
            <path d={prof.map((p, i) => `${i ? "L" : "M"}${mini.px(p.x, p.z).join(" ")}`).join("")} stroke="var(--route-path)" strokeWidth={2} />
          </svg>
          <WaypointDot size={12} className="absolute" style={{ left: mx - 6, top: my - 6 }} />
        </div>
        <MapTag className="absolute top-[7px] left-[7px]">Map · north up</MapTag>
      </div>

      <MapTag className="pointer-events-none absolute top-[176px] left-lg max-w-[calc(100%_-_128px)] whitespace-normal md:top-xl md:left-[304px] md:max-w-[calc(100%_-_432px)]">
        {`${mode === "route" ? "Follow route" : "Free explore"} · eye 1.7 m · looking ${String(Math.round(hud.lookDeg)).padStart(3, "0")}° · walking ${String(Math.round(hud.walkDeg)).padStart(3, "0")}° · vertical FoV ${FOV_V}°`}
      </MapTag>

      {/* Elevation ruler */}
      <MapTag className="pointer-events-none absolute right-lg md:right-xl" style={{ top: Math.max(elevTop - 40, 16) }}>
        Relay el. · simulated
      </MapTag>
      <div
        className="mw-flash-in pointer-events-none absolute right-lg w-[72px] overflow-hidden rounded-sm bg-scrim md:right-xl"
        style={{ top: elevTop, height: Math.max(rulerBottom - elevTop, 0) }}
      >
        {elevationTicks.map((deg) => {
          const top = elevY(deg);
          const major = deg % 10 === 0;
          return (
            <span key={deg}>
              <span className="absolute left-0 h-px bg-fg-secondary" style={{ top, width: major ? 16 : 8 }} />
              {major && deg > 0 ? (
                <span className="absolute left-xl t-data-telemetry text-fg-secondary" style={{ top: top - 9 }}>
                  {deg}°
                </span>
              ) : null}
            </span>
          );
        })}
        <span
          aria-label={`Pass maximum elevation ${ELEVATION.passMax}°`}
          className="absolute left-0 h-px w-full bg-fg opacity-60"
          style={{ top: elevY(ELEVATION.passMax) }}
        />
        <span
          aria-label={`Satellite elevation ${ELEVATION.satellite}°`}
          className="absolute left-0 h-(--stroke-default) w-full bg-brand"
          style={{ top: elevY(ELEVATION.satellite) + 1 }}
        />
      </div>

      {/* Azimuth ruler: white = where you look, route colour = where you walk */}
      <div className="mw-flash-in pointer-events-none absolute inset-x-lg bottom-lg h-glove overflow-hidden rounded-sm bg-scrim md:inset-x-xl md:bottom-xl">
        {azimuthTicks.map((deg) => {
          const left = azX(deg);
          const major = deg % 15 === 0;
          return (
            <span key={deg}>
              <span className="absolute top-0 w-px bg-fg-secondary" style={{ left, height: major ? 14 : 7 }} />
              {major ? (
                <span
                  className={`absolute top-xl -translate-x-1/2 t-data-telemetry ${deg === 0 ? "text-fg" : "text-fg-secondary"}`}
                  style={{ left }}
                >
                  {azLabel(deg)}
                </span>
              ) : null}
            </span>
          );
        })}
        <span aria-label={`Looking ${Math.round(hdg)}°`} className="absolute top-0 h-full w-(--stroke-default) bg-fg" style={{ left: azX(hdg) }} />
        <span
          aria-label={`Walking ${Math.round(hud.walkDeg)}°`}
          className="absolute bottom-0 h-[16px] w-(--stroke-emphasis) bg-route-path"
          style={{ left: azX(hud.walkDeg) }}
        />
        <span
          aria-label={`Satellite azimuth ${AZIMUTH.satellite}°`}
          className="absolute top-0 h-[20px] w-(--stroke-default) bg-brand"
          style={{ left: azX(AZIMUTH.satellite) }}
        />
      </div>

      {/* ---------- Walk controls (EVA screen: glove-size targets) ---------- */}
      <section
        aria-label="FoV walk controls"
        className="mw-flash-in absolute inset-x-lg bottom-[88px] flex flex-col gap-sm rounded-sm border border-line-subtle bg-scrim px-lg py-md md:right-auto md:bottom-[96px] md:left-xl md:w-[440px]"
      >
        <ToggleGroup type="single" value={mode} onValueChange={(v) => v && changeMode(v as Mode)} aria-label="Movement mode" className="flex w-full">
          <ToggleGroupItem value="route" className="h-glove min-w-0 flex-1">Follow route</ToggleGroupItem>
          <ToggleGroupItem value="explore" className="h-glove min-w-0 flex-1">Free explore</ToggleGroupItem>
        </ToggleGroup>

        {mode === "route" ? (
          <>
            <div className="flex flex-col gap-xs">
              <div className="flex justify-between gap-sm t-data-telemetry text-fg">
                <span>{`T+${fmtHM(hud.T)} · ${(hud.dist / 1000).toFixed(2)} / ${(end.dist / 1000).toFixed(2)} km`}</span>
                <span>{`O₂ ${hud.o2Pct.toFixed(0)} % · modelled`}</span>
              </div>
              <div className="h-xs w-full overflow-hidden rounded-pill bg-inset" role="progressbar" aria-label="Route progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div className="h-full bg-route-path" style={{ width: `${pct}%` }} />
              </div>
              <p className="t-data-telemetry text-fg-secondary">
                {done
                  ? "EVA complete · back at the start point"
                  : hud.dwelling
                    ? `Science stop · next ${hud.nextLabel} in ${Math.round(hud.nextMin)} min`
                    : `Next ${hud.nextLabel} · ${Math.round(hud.nextM)} m · ${Math.round(hud.nextMin)} min`}
              </p>
            </div>
            <div className="flex gap-sm" role="group" aria-label="EVA clock">
              <Button className="min-w-0 flex-1" onClick={toggleWalk}>{walking ? "Pause" : done ? "Walk again" : "Walk"}</Button>
              <Button variant="secondary" onClick={restart} aria-label="Restart from the route start">Restart</Button>
              <Button variant="secondary" className="px-md" aria-label="Back 5 minutes" onClick={() => jump(sim.current.T - 5)}>−5</Button>
              <Button variant="secondary" className="px-md" aria-label="Forward 5 minutes" onClick={() => jump(sim.current.T + 5)}>+5</Button>
            </div>
            <div className="flex items-center gap-sm">
              <p className="w-[72px] shrink-0 t-data-telemetry text-fg-muted">Speed</p>
              <ToggleGroup type="single" value={String(rate)} onValueChange={(v) => v && setRate(Number(v) as WalkRate)} aria-label="Playback speed, simulated seconds per real second" className="flex min-w-0 flex-1">
                {WALK_RATES.map((r) => (
                  <ToggleGroupItem key={r} value={String(r)} className="h-glove min-w-0 flex-1 px-xs">{`${r}×`}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </>
        ) : (
          <p className="t-data-telemetry text-caution">
            {`Free explore · not part of the plan · mission clock held at T+${fmtHM(hud.T)} · ${Math.round(hud.exploredM)} m explored · ${finePointer ? "W A S D to walk, Shift fast" : "hold the arrows to walk"}`}
          </p>
        )}

        <div className="flex items-center gap-sm">
          <p className="w-[72px] shrink-0 t-data-telemetry text-fg-muted">Head bob</p>
          <ToggleGroup type="single" value={bobLevel} onValueChange={(v) => v && setBobLevel(v as BobLevel)} aria-label="Head bob" className="flex min-w-0 flex-1">
            <ToggleGroupItem value="off" className="h-glove min-w-0 flex-1 px-xs">Off</ToggleGroupItem>
            <ToggleGroupItem value="reduced" className="h-glove min-w-0 flex-1 px-xs">Reduced</ToggleGroupItem>
            <ToggleGroupItem value="normal" className="h-glove min-w-0 flex-1 px-xs">Normal</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex gap-sm">
          <Button variant="secondary" className="min-w-0 flex-1" onClick={() => (sim.current.resetting = true)}>Reset view</Button>
          {finePointer ? (
            <Button variant="secondary" className="min-w-0 flex-1" onClick={() => viewRef.current?.requestPointerLock()} disabled={locked}>
              {locked ? "Esc to release" : "Mouse look"}
            </Button>
          ) : null}
        </div>
      </section>

      {/* Free explore pad: press and hold (keyboard: W A S D). Desktop/tablet simulation only, never in AR. */}
      {mode === "explore" ? (
        <div role="group" aria-label="Walk pad" className="absolute top-[232px] left-lg grid grid-cols-3 gap-xs md:top-auto md:right-[112px] md:bottom-[96px] md:left-auto">
          {PAD.map((b) => (
            <Button
              key={b.label}
              variant="map"
              aria-label={b.label}
              className="size-glove touch-none px-0"
              style={{ gridColumnStart: b.col }}
              onPointerDown={press(b.move)}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              onContextMenu={(e) => e.preventDefault()}
            >
              {b.text}
            </Button>
          ))}
          <Button variant={fast ? "primary" : "secondary"} aria-pressed={fast} className="col-span-3 bg-scrim" onClick={() => setFast(!fast)}>
            {`Fast · ${EXPLORE_MPS * EXPLORE_FAST_X} m/s`}
          </Button>
        </div>
      ) : null}

      {/* Source credit: always shown, the image is a placeholder */}
      <MapTag className={cn("pointer-events-none absolute right-lg hidden max-w-[360px] whitespace-normal lg:right-[112px] lg:block", mode === "route" ? "lg:bottom-[96px]" : "lg:bottom-[352px]")}>
        {mode === "route"
          ? "Terrain: USGS Mars 2020 TRN HiRISE DTM + orthoimage (tinted) · position from the plan at the EVA clock"
          : "Terrain: USGS Mars 2020 TRN HiRISE DTM · free explore position is not saved to the plan"}
      </MapTag>
    </div>
  );
}
