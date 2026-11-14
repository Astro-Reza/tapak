import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FitLayer, useFit } from "@/components/marswalk/fit";
import { OrthoBasemap, SatelliteMarker, WaypointDot, WaypointMarker } from "@/components/marswalk/map";
import { Brackets, MapTag } from "@/components/marswalk/primitives";
import { sampleAt, status, type Evaluation, type MissionResult, type ProfileSample, type Sample, type Suit } from "@/engine";
import { isReducedMotion, motionMs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ORTHO } from "@/sim/load";
import { MissionGate } from "@/sim/controls";
import { useMission } from "@/sim/mission";
import { TerrainView, FOV_H, type TerrainApi } from "@/sim/terrain-view";
import { arrivalIndices, fitProjection, fmtHM, nextArrival } from "@/sim/view";
import { BOB_LEVELS, BOB_REST, composeCamera, damp, dampAngle, samePose, stepBob, type BobLevel, type CameraPose } from "@/sim/fov/camera-rig";
import { EXPLORE_FAST_X, EXPLORE_MPS, stepExplore, type MoveInput } from "@/sim/fov/explore";
import { readInput, useFovInput } from "@/sim/fov/input";
import { pointAtDist, routeHeading, stepRoute, WALK_RATES, type WalkRate } from "@/sim/fov/route-walker";
import { heightAt, terrainBounds, toCompassDeg, wrapPi, type WorldXZ } from "@/sim/fov/world";

/**
 * Screen chrome is drawn in the Figma frame (1366 × 938 design px) at the design's positions and scaled to fit,
 * so the layout matches the FoV design exactly; the 3D view behind it fills the whole screen.
 */
const SCENE = { width: 1366, height: 938 };
/** Elevation ruler: 0° at 607 px, 6 px per degree, major tick every 10°. */
const ELEVATION = { zero: 607, pxPerDeg: 5.99, satellite: 25, passMax: 29 };
/** Azimuth ruler: 19.5 px per degree (1366 px / 70° field of view); the heading sits at 659 px, as in the design. */
const AZIMUTH = { pxPerDeg: 19.5, headingX: 659, satellite: 22 };
/** The relay pass overlay is drawn for the design heading (032°) and slides with the camera heading. */
const PASS_DESIGN_HEADING = 32;
/** Next-waypoint marker sits at (840, 736) in the design; its tag and the spot note hang off it. */
const WP_TAG = { dx: 36, dy: 8 };
const SPOT = { dx: -700, dy: -12, lineDx: -404, lineDy: -36 };

const elevationTicks = Array.from({ length: 19 }, (_, i) => i * 5);
const azLabel = (deg: number) => { const d = ((Math.round(deg) % 360) + 360) % 360; return d === 0 ? "N" : d === 90 ? "E" : d === 180 ? "S" : d === 270 ? "W" : String(d).padStart(3, "0"); };
const deg3 = (d: number) => String(Math.round(d) % 360).padStart(3, "0");
/** Signed shortest difference a − b in degrees, −180…180. */
const dDeg = (a: number, b: number) => (wrapPi(((a - b) * Math.PI) / 180) * 180) / Math.PI;

type Mode = "route" | "explore";

/** HUD snapshot, refreshed from the animation loop at ~15 Hz (the 3D view itself draws every frame). */
type Hud = {
  T: number;
  dist: number;
  o2Pct: number;
  nextLabel: string;
  nextM: number;
  nextDz: number;
  nextMaxSlope: number;
  nextMin: number;
  dwelling: boolean;
  lookDeg: number;
  tiltDeg: number;
  walkDeg: number;
  exploredM: number;
  pos: WorldXZ;
  k: number;
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

type Ctx = { prof: ProfileSample[]; arrivals: number[]; end: ProfileSample; suit: Suit; env: MissionResult["env"] };

/** HUD numbers from the same engine sample the walk uses, with EVA Map's next-stop rule. */
function hudFor(ctx: Ctx, sm: Sample, mode: Mode, pos: WorldXZ, pose: { yaw: number; pitch: number }, heading: number, exploredM: number): Hud {
  const nx = nextArrival(ctx.prof, ctx.arrivals, sm.t);
  let maxSlope = 0;
  for (let i = sm.k; i <= ctx.arrivals[nx.index]; i++) maxSlope = Math.max(maxSlope, ctx.prof[i].slope);
  return {
    T: sm.t,
    dist: sm.dist,
    o2Pct: status(sm as unknown as ProfileSample, ctx.end, ctx.suit, ctx.env).o2Pct,
    nextLabel: nx.label,
    nextM: mode === "route" ? Math.max(0, nx.point.dist - sm.dist) : Math.hypot(nx.point.x - pos.x, nx.point.z - pos.z),
    nextDz: nx.point.y - sm.y,
    nextMaxSlope: maxSlope,
    nextMin: nx.minutes,
    dwelling: sm.dwelling,
    lookDeg: toCompassDeg(pose.yaw),
    tiltDeg: (pose.pitch * 180) / Math.PI,
    walkDeg: toCompassDeg(heading),
    exploredM,
    pos,
    k: sm.k,
  };
}

const PAD: { label: string; text: string; col: number; move: Partial<MoveInput> }[] = [
  { label: "Walk forward", text: "↑", col: 2, move: { forward: 1 } },
  { label: "Step left", text: "←", col: 1, move: { right: -1 } },
  { label: "Step right", text: "→", col: 3, move: { right: 1 } },
  { label: "Walk back", text: "↓", col: 2, move: { forward: -1 } },
];

function FovScene({ ev }: { ev: Evaluation }) {
  const [ref, box] = useFit(SCENE, "contain");
  const boxRef = useRef(box);
  boxRef.current = box;
  const tick = motionMs("tick");
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
  const [more, setMore] = useState(false);
  const cfg = useRef({ mode, rate, bobLevel, walking });
  cfg.current = { mode, rate, bobLevel, walking };

  const viewRef = useRef<HTMLDivElement>(null);
  const { input, locked } = useFovInput(viewRef);
  input.current.pad.fast = fast;
  const api = useRef<TerrainApi | null>(null);
  const wpRef = useRef<HTMLDivElement>(null);
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
  const ctx = useMemo<Ctx>(() => ({ prof, arrivals, end, suit, env }), [prof, arrivals, end, suit, env]);
  const [hud, setHud] = useState<Hud>(() => hudFor(ctx, init.sm, "route", init.pos, { yaw: init.heading, pitch: 0 }, init.heading, 0));

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
        // next-waypoint marker, its tag and spot note follow the waypoint on screen (design px, straight to the DOM)
        const nx = nextArrival(prof, arrivals, st.T).point;
        const [p] = a.project([{ x: nx.x, y: heightAt(grid, nx.x, nx.z) + 1, z: nx.z }]);
        const el = wpRef.current, b = boxRef.current;
        if (el && b.scale) {
          el.style.visibility = p.visible ? "visible" : "hidden";
          // off-screen points project far away: park the hidden marker so it never widens the layout
          el.style.transform = p.visible ? `translate(${(p.x - b.x) / b.scale}px, ${(p.y - b.y) / b.scale}px)` : "none";
        }
      }

      if (now - lastHud > 66) {
        lastHud = now;
        const next = hudFor(ctx, step.sample, c.mode, { x, z }, pose, st.heading, st.exploredM);
        const key = [next.T.toFixed(2), next.nextLabel, Math.round(next.nextM), next.lookDeg.toFixed(1), next.tiltDeg.toFixed(0), Math.round(next.walkDeg), Math.round(next.exploredM), x.toFixed(1), z.toFixed(1)].join("|");
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

  // the design box moved (resize): re-place the waypoint marker on the next frame
  useEffect(() => {
    sim.current.dirty = true;
  }, [box.x, box.y, box.scale]);

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

  /* ---------- live geometry in design px ---------- */

  const look = hud.lookDeg;
  const passDx = -dDeg(look, PASS_DESIGN_HEADING) * AZIMUTH.pxPerDeg;
  const azX = (deg: number) => AZIMUTH.headingX + dDeg(deg, look) * AZIMUTH.pxPerDeg;
  const azimuthTicks = Array.from({ length: 15 }, (_, i) => Math.round(look / 5) * 5 - 35 + i * 5);
  const [mx, my] = mini.px(hud.pos.x, hud.pos.z);
  const lookRad = (look * Math.PI) / 180, half = ((FOV_H / 2) * Math.PI) / 180;
  const cone = (a: number) => `${mx + 72 * Math.sin(a)} ${my - 72 * Math.cos(a)}`;
  const walkedPath = [...prof.slice(0, hud.k).map((p) => mini.px(p.x, p.z)), [mx, my]].map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join("");
  const aheadPath = [[mx, my], ...prof.slice(hud.k).map((p) => mini.px(p.x, p.z))].map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join("");
  const pct = Math.round((100 * hud.dist) / (end.dist || 1));
  const done = hud.T >= end.t;

  return (
    <div ref={ref} className="relative h-full min-h-[520px] overflow-clip">
      <TerrainView className="absolute inset-0" route={prof} heightAt={ground} onReady={onReady} />
      {/* look surface: drag to look around; touch-none keeps the page from scrolling */}
      <div
        ref={viewRef}
        role="application"
        aria-label="3D view. Drag to look around; arrow keys turn the view."
        className={cn("absolute inset-0 touch-none select-none", locked ? "cursor-none" : "cursor-grab active:cursor-grabbing")}
      />

      <FitLayer design={SCENE} box={box} className="pointer-events-none">
        {/* Relay pass (simulated): predicted dashed, flown solid; slides with the camera heading */}
        <div className="absolute inset-0 overflow-clip">
          <div className="absolute inset-0" style={{ transform: `translateX(${passDx}px)` }}>
            <svg width={1366} height={938} viewBox="0 0 1366 938" fill="none" aria-hidden="true" className="absolute top-0 left-0 overflow-visible">
              <path d="M-40 724C420 500 880 480 1250 600" stroke="var(--text-primary)" strokeWidth={2} strokeDasharray="6 8" opacity={0.75} />
              <path
                d="M-40 724L-12 711L15 698L43 686L70 674L98 663L125 652L153 642L180 632L208 622L235 614L263 605L290 597L317 590L344 582L372 576L399 570L426 564L453 558L479 554"
                pathLength={1}
                className="mw-route-draw"
                stroke="var(--text-primary)"
                strokeWidth={2}
                style={{ "--route-steps": 12 } as CSSProperties}
              />
            </svg>
            <SatelliteMarker label={`MRS-L1 · el ${ELEVATION.satellite}° · az ${deg3(AZIMUTH.satellite)}° · uplink +0.6 dB`} style={{ left: 467, top: 540 }} />
            <Brackets className="top-[532.5px] left-[460px] size-[40px]" delay={tick * 12} />
            <span className="absolute top-[657px] left-[98px] h-md w-(--stroke-default) bg-fg" />
            <MapTag className="absolute top-[611px] left-[68px]">AOS 15:35</MapTag>
            <span className="absolute top-[568px] left-[1160px] h-md w-(--stroke-default) bg-fg" />
            <MapTag className="absolute top-[586px] left-[1130px]">LOS 15:44</MapTag>
          </div>
        </div>

        {/* Elevation ruler */}
        <MapTag className="absolute top-[56px] left-[1260px]">Elevation</MapTag>
        <div className="mw-flash-in absolute top-[96px] left-[1270px] h-[608px] w-[72px] overflow-hidden rounded-sm bg-scrim">
          {elevationTicks.map((deg) => {
            const top = ELEVATION.zero - deg * ELEVATION.pxPerDeg;
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
            style={{ top: ELEVATION.zero - ELEVATION.passMax * ELEVATION.pxPerDeg }}
          />
          <span
            aria-label={`Satellite elevation ${ELEVATION.satellite}°`}
            className="absolute left-0 h-(--stroke-default) w-full bg-brand"
            style={{ top: ELEVATION.zero - ELEVATION.satellite * ELEVATION.pxPerDeg + 1 }}
          />
        </div>

        {/* Horizon 0° */}
        <span className="absolute top-[704px] left-0 h-px w-[1262px] bg-fg opacity-35" />

        {/* Azimuth ruler, centred on where the camera looks */}
        <div className="mw-flash-in absolute top-[858px] left-xl h-glove w-[1318px] overflow-hidden rounded-sm bg-scrim">
          {azimuthTicks.map((deg) => {
            const left = azX(deg);
            const major = ((deg % 15) + 15) % 15 === 0;
            return (
              <span key={deg}>
                <span className="absolute top-0 w-px bg-fg-secondary" style={{ left, height: major ? 14 : 7 }} />
                {major ? (
                  <span
                    className={`absolute top-xl -translate-x-1/2 t-data-telemetry ${azLabel(deg) === "N" ? "text-fg" : "text-fg-secondary"}`}
                    style={{ left }}
                  >
                    {azLabel(deg)}
                  </span>
                ) : null}
              </span>
            );
          })}
          <span aria-label={`Heading ${Math.round(look)}°`} className="absolute top-0 h-full w-(--stroke-default) bg-fg" style={{ left: AZIMUTH.headingX }} />
          <span
            aria-label={`Satellite azimuth ${AZIMUTH.satellite}°`}
            className="absolute top-0 h-[20px] w-(--stroke-default) bg-brand"
            style={{ left: azX(AZIMUTH.satellite) }}
          />
          <span
            aria-label={`Walking direction ${Math.round(hud.walkDeg)}°`}
            className="absolute bottom-0 h-[10px] w-(--stroke-default) bg-route-path"
            style={{ left: azX(hud.walkDeg) }}
          />
        </div>

        {/* Minimap: walked dotted, ahead solid, view cone */}
        <div className="mw-flash-in absolute top-xl left-xl h-[192px] w-[256px] overflow-hidden rounded-sm border border-line-subtle bg-canvas">
          <OrthoBasemap src={ORTHO} {...mini.basemap} />
          <svg width={256} height={192} viewBox="0 0 256 192" fill="none" aria-hidden="true" className="absolute -top-px -left-px">
            <path d={walkedPath} stroke="var(--route-path)" strokeWidth={2} strokeDasharray="2 5" />
            <path d={aheadPath} stroke="var(--route-path)" strokeWidth={2} />
            <path d={`M${cone(lookRad - half)}L${mx} ${my}L${cone(lookRad + half)}`} stroke="var(--text-primary)" opacity={0.6} />
          </svg>
          <WaypointDot size={12} className="absolute" style={{ left: mx - 6, top: my - 6 }} />
          <MapTag className="absolute top-[7px] left-[7px]">Map · north up</MapTag>
        </div>

        <MapTag className="absolute top-xl left-[520px]">
          {`Camera · heading ${deg3(look)}° · tilt ${hud.tiltDeg >= 0 ? "+" : "−"}${Math.abs(Math.round(hud.tiltDeg))}° · field of view ${FOV_H}°`}
        </MapTag>

        {/* Next waypoint: marker, tag and (at WP4) the spot note, placed by projecting the waypoint */}
        <div ref={wpRef} className="absolute top-0 left-0" style={{ visibility: "hidden" }}>
          <WaypointMarker label={hud.nextLabel} x={0} y={0} />
          <MapTag className="absolute" style={{ left: WP_TAG.dx, top: WP_TAG.dy }}>
            {`${hud.nextLabel} · ${Math.round(hud.nextM)} m · ${hud.nextDz >= 0 ? "+" : "−"}${Math.abs(Math.round(hud.nextDz))} m · max ${Math.round(hud.nextMaxSlope)}°`}
          </MapTag>
          {hud.nextLabel === "WP4" ? (
            <>
              <div className="mw-flash-in absolute flex w-[296px] flex-col gap-xs rounded-sm border border-line-subtle bg-scrim p-md" style={{ left: SPOT.dx, top: SPOT.dy }}>
                <p className="whitespace-nowrap t-label-m text-fg">Spot note · outcrop left of WP4</p>
                <p className="t-body-s text-fg-secondary">Layered rock, loose scree on the left flank. Approach from the east bench</p>
              </div>
              <svg width={160} height={40} viewBox="0 0 160 40" fill="none" aria-hidden="true" className="absolute" style={{ left: SPOT.lineDx, top: SPOT.lineDy }}>
                <path d="M1.90479 0.526367L152.381 36.8422" stroke="var(--text-primary)" strokeWidth={1.5} />
                <ellipse cx={152.381} cy={36.8421} rx={5.714} ry={1.579} stroke="var(--text-primary)" strokeWidth={1.5} />
              </svg>
            </>
          ) : null}
        </div>

        {/* Source credit: always shown */}
        <MapTag className="absolute top-[819px] left-xl">
          Terrain: USGS HiRISE DTM + orthoimage, tinted · relay pass and spot note simulated
        </MapTag>

        {/* ---------- Walk dock: not in the design frame, so it sits in the open sky right of the camera tag ---------- */}
        <section aria-label="FoV walk controls" className="pointer-events-auto absolute top-xl left-[936px] flex w-[308px] flex-col gap-sm">
          <ToggleGroup type="single" value={mode} onValueChange={(v) => v && changeMode(v as Mode)} aria-label="Movement mode" className="flex w-full bg-scrim">
            <ToggleGroupItem value="route" className="h-glove min-w-0 flex-1 px-sm">Follow route</ToggleGroupItem>
            <ToggleGroupItem value="explore" className="h-glove min-w-0 flex-1 px-sm">Free explore</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex gap-sm">
            {mode === "route" ? (
              <Button className="min-w-0 flex-1" onClick={toggleWalk}>{walking ? "Pause" : done ? "Walk again" : "Walk"}</Button>
            ) : null}
            <Button variant="secondary" className={cn("bg-scrim", mode === "explore" && "flex-1")} onClick={() => (sim.current.resetting = true)}>Reset view</Button>
            <Button variant="secondary" className="bg-scrim px-md" aria-label="More walk settings" aria-expanded={more} onClick={() => setMore(!more)}>
              {more ? "Less" : "More"}
            </Button>
          </div>
          {mode === "route" ? (
            <MapTag className="self-start whitespace-normal">{`T+${fmtHM(hud.T)} · ${(hud.dist / 1000).toFixed(2)} / ${(end.dist / 1000).toFixed(2)} km · ${pct} % · O₂ ${hud.o2Pct.toFixed(0)} %${done ? " · complete" : hud.dwelling ? " · science stop" : ""}`}</MapTag>
          ) : (
            <MapTag className="self-start whitespace-normal text-caution">{`Free explore · not part of the plan · clock held at T+${fmtHM(hud.T)} · ${Math.round(hud.exploredM)} m`}</MapTag>
          )}

          {more ? (
            <div className="flex flex-col gap-sm rounded-sm border border-line-subtle bg-scrim p-md">
              {mode === "route" ? (
                <>
                  <div className="flex gap-sm" role="group" aria-label="EVA clock">
                    <Button variant="secondary" className="min-w-0 flex-1" onClick={restart} aria-label="Restart from the route start">Restart</Button>
                    <Button variant="secondary" className="px-md" aria-label="Back 5 minutes" onClick={() => jump(sim.current.T - 5)}>−5</Button>
                    <Button variant="secondary" className="px-md" aria-label="Forward 5 minutes" onClick={() => jump(sim.current.T + 5)}>+5</Button>
                  </div>
                  <p className="t-data-telemetry text-fg-muted">Speed · simulated s per real s</p>
                  <ToggleGroup type="single" value={String(rate)} onValueChange={(v) => v && setRate(Number(v) as WalkRate)} aria-label="Playback speed" className="flex w-full">
                    {WALK_RATES.map((r) => (
                      <ToggleGroupItem key={r} value={String(r)} className="h-glove min-w-0 flex-1 px-xs">{`${r}×`}</ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </>
              ) : (
                <p className="t-data-telemetry text-fg-secondary">{finePointer ? "W A S D to walk · Shift fast · drag or arrows to look" : "Hold the arrows to walk · drag to look"}</p>
              )}
              <p className="t-data-telemetry text-fg-muted">Head bob</p>
              <ToggleGroup type="single" value={bobLevel} onValueChange={(v) => v && setBobLevel(v as BobLevel)} aria-label="Head bob" className="flex w-full">
                <ToggleGroupItem value="off" className="h-glove min-w-0 flex-1 px-xs">Off</ToggleGroupItem>
                <ToggleGroupItem value="reduced" className="h-glove min-w-0 flex-1 px-xs">Reduced</ToggleGroupItem>
                <ToggleGroupItem value="normal" className="h-glove min-w-0 flex-1 px-xs">Normal</ToggleGroupItem>
              </ToggleGroup>
              {finePointer ? (
                <Button variant="secondary" onClick={() => viewRef.current?.requestPointerLock()} disabled={locked}>
                  {locked ? "Esc to release mouse" : "Mouse look"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Free explore pad: press and hold (keyboard: W A S D). Desktop/tablet simulation only, never in AR. */}
        {mode === "explore" ? (
          <div role="group" aria-label="Walk pad" className="pointer-events-auto absolute top-[592px] left-[1070px] grid grid-cols-3 gap-sm">
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
      </FitLayer>
    </div>
  );
}
