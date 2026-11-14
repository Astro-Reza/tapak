import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFit } from "@/components/marswalk/fit";
import { Icon } from "@/components/marswalk/icons";
import { OrthoBasemap, SatelliteMarker, WaypointDot, WaypointMarker } from "@/components/marswalk/map";
import { Brackets, MapTag, StatList, StatRow } from "@/components/marswalk/primitives";
import { sampleAt, status, type Evaluation, type MissionResult, type ProfileSample, type Sample, type Suit } from "@/engine";
import { mapEase, stepMs } from "@/lib/camera";
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

/** Elevation gauge: 0° at 607 px, 6 px per degree, major tick every 10° (design). */
const ELEVATION = { zero: 607, pxPerDeg: 5.99, satellite: 25, passMax: 29 };
const elevationTicks = Array.from({ length: 19 }, (_, i) => i * 5);

/**
 * Relay pass (simulated, from the design): the design's arc converted to sky directions (azimuth, elevation),
 * so it is drawn by projecting through the 3D camera and stays fixed in the sky as you turn and tilt.
 */
const SAT = { az: 22, label: "MRS-L1 · el 25° · az 022° · uplink +0.6 dB" };
const cubic = (t: number, a: number, b: number, c: number, d: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
const PASS = Array.from({ length: 49 }, (_, i) => {
  const t = i / 48;
  const x = cubic(t, -40, 420, 880, 1250), y = cubic(t, 724, 500, 480, 600);
  return { az: 32 + (x - 691) / 19.5, el: (704 - y) / 5.99 }; // design heading 032° at x 691, horizon at y 704
});
const elOnPass = (az: number) => {
  const j = PASS.findIndex((p) => p.az >= az);
  const a = PASS[Math.max(j - 1, 0)], b = PASS[Math.max(j, 0)];
  return a.el + ((az - a.az) / (b.az - a.az || 1)) * (b.el - a.el);
};
const AOS = { az: 2, label: "AOS 15:35" };
const LOS = { az: 56, label: "LOS 15:44" };
/** Spot note geometry relative to the WP4 marker (design): outcrop ellipse and card. */
const SPOT = { outcropDx: -252, outcropDy: 1, cardW: 296, cardDx: -700, cardDy: -12, lineDx: -402, lineDy: -35.5 };

const azLabel = (deg: number) => { const d = ((Math.round(deg) % 360) + 360) % 360; return d === 0 ? "N" : d === 90 ? "E" : d === 180 ? "S" : d === 270 ? "W" : String(d).padStart(3, "0"); };
const deg3 = (d: number) => String(((Math.round(d) % 360) + 360) % 360).padStart(3, "0");
/** Signed shortest difference a − b in degrees, −180…180. */
const dDeg = (a: number, b: number) => (wrapPi(((a - b) * Math.PI) / 180) * 180) / Math.PI;
const RAD = Math.PI / 180;

type Mode = "route" | "explore";

/** HUD snapshot, refreshed from the animation loop at ~15 Hz (the 3D view and sky overlays update every frame). */
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
    tiltDeg: pose.pitch / RAD,
    walkDeg: toCompassDeg(heading),
    exploredM,
    pos,
    k: sm.k,
  };
}

/** Explore pad: a cross of map controls; the centre square toggles fast. */
const PAD: { label: string; rotate: number; row: number; col: number; move: Partial<MoveInput> }[] = [
  { label: "Walk forward", rotate: 0, row: 1, col: 2, move: { forward: 1 } },
  { label: "Step left", rotate: -90, row: 2, col: 1, move: { right: -1 } },
  { label: "Step right", rotate: 90, row: 2, col: 3, move: { right: 1 } },
  { label: "Walk back", rotate: 180, row: 3, col: 2, move: { forward: -1 } },
];

function FovScene({ ev }: { ev: Evaluation }) {
  const [ref, view] = useFit({ width: 1366, height: 938 }); // used for the view size only
  const viewSize = useRef(view);
  viewSize.current = view;
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
  const cfg = useRef({ mode, rate, bobLevel, walking });
  cfg.current = { mode, rate, bobLevel, walking };

  const viewRef = useRef<HTMLDivElement>(null);
  const { input, locked } = useFovInput(viewRef);
  input.current.pad.fast = fast;
  const api = useRef<TerrainApi | null>(null);
  const finePointer = useMemo(() => window.matchMedia("(pointer: fine)").matches, []);
  const wide = useMemo(() => window.matchMedia("(min-width: 768px)"), []);

  // Overlay elements placed straight from the animation loop (screen px), so they stay locked to the 3D view.
  const el = {
    flown: useRef<SVGPathElement>(null),
    predicted: useRef<SVGPathElement>(null),
    horizon: useRef<SVGLineElement>(null),
    leader: useRef<SVGLineElement>(null),
    outcrop: useRef<SVGEllipseElement>(null),
    sat: useRef<HTMLDivElement>(null),
    satPin: useRef<HTMLDivElement>(null),
    aos: useRef<HTMLDivElement>(null),
    los: useRef<HTMLDivElement>(null),
    wp: useRef<HTMLDivElement>(null),
    spot: useRef<HTMLDivElement>(null),
  };

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
    /** clock jump in progress: glide from here to the new point on the map easing (lib/camera) */
    glide: null as { x: number; z: number; heading: number; t0: number; ms: number } | null,
  });
  const ctx = useMemo<Ctx>(() => ({ prof, arrivals, end, suit, env }), [prof, arrivals, end, suit, env]);
  const [hud, setHud] = useState<Hud>(() => hudFor(ctx, init.sm, "route", init.pos, { yaw: init.heading, pitch: 0 }, init.heading, 0));
  const spotShown = useRef(false);
  spotShown.current = hud.nextLabel === "WP4";

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

    const place = (node: HTMLElement | null, p: { x: number; y: number; front: boolean } | null) => {
      if (!node) return;
      const W = viewSize.current.width, H = viewSize.current.height;
      const on = !!p && p.front && p.x > -400 && p.x < W + 400 && p.y > -200 && p.y < H + 200;
      node.style.visibility = on ? "visible" : "hidden";
      node.style.transform = on ? `translate(${p!.x}px, ${p!.y}px)` : "none"; // parked: never widens the layout
    };
    const drawOverlays = (a: TerrainApi, pose: CameraPose) => {
      const sky = (azDeg: number, elDeg: number) => {
        const az = azDeg * RAD, e = elDeg * RAD, R = 3000;
        return { x: pose.x + Math.sin(az) * Math.cos(e) * R, y: pose.y + Math.sin(e) * R, z: pose.z - Math.cos(az) * Math.cos(e) * R };
      };
      const path = (pts: { az: number; el: number }[]) => {
        let d = "", pen = false;
        for (const p of a.project(pts.map((q) => sky(q.az, q.el)))) {
          if (!p.front) { pen = false; continue; }
          d += `${pen ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
          pen = true;
        }
        return d;
      };
      const satEl = elOnPass(SAT.az);
      el.flown.current?.setAttribute("d", path([...PASS.filter((p) => p.az < SAT.az), { az: SAT.az, el: satEl }]));
      el.predicted.current?.setAttribute("d", path(PASS));
      const [sat, aos, los, hz] = a.project([sky(SAT.az, satEl), sky(AOS.az, elOnPass(AOS.az)), sky(LOS.az, elOnPass(LOS.az)), sky(pose.yaw / RAD, 0)]);
      // out of view: pin the satellite marker to the nearest screen edge, pointing the way to it
      const W = viewSize.current.width, H = viewSize.current.height;
      const satNode = el.sat.current, pin = el.satPin.current;
      if (satNode && pin) {
        const inView = sat.visible;
        satNode.style.visibility = inView ? "visible" : "hidden";
        satNode.style.transform = inView ? `translate(${sat.x}px, ${sat.y}px)` : "none";
        pin.style.visibility = inView ? "hidden" : "visible";
        if (!inView) {
          const side = dDeg(SAT.az, pose.yaw / RAD);
          const left = wide.matches ? 304 : 16, right = W - (wide.matches ? 360 : 240), top = wide.matches ? 88 : 216, bottom = H - 180;
          const x = Math.abs(side) > FOV_H / 2 || !sat.front ? (side < 0 ? left : right) : Math.min(Math.max(sat.x, left), right);
          const y = sat.front ? Math.min(Math.max(sat.y, top), bottom) : top;
          const ang = Math.atan2(sat.front ? sat.y - y : -1, sat.front && Math.abs(side) <= FOV_H / 2 ? sat.x - x : side) / RAD + 90;
          pin.style.transform = `translate(${x}px, ${y}px)`;
          const arrow = pin.firstElementChild as HTMLElement | null;
          if (arrow) arrow.style.transform = `rotate(${ang}deg)`;
        }
      }
      place(el.aos.current, aos);
      place(el.los.current, los);
      const h = el.horizon.current;
      if (h) {
        h.setAttribute("y1", String(hz.y));
        h.setAttribute("y2", String(hz.y));
        h.setAttribute("x2", String(viewSize.current.width));
      }

      // next waypoint marker + tag; the spot note hangs off WP4 (card kept clear of the walk panel)
      const nx = nextArrival(prof, arrivals, st.T).point;
      const [p] = a.project([{ x: nx.x, y: heightAt(grid, nx.x, nx.z) + 1, z: nx.z }]);
      place(el.wp.current, p);
      const spot = el.spot.current, leader = el.leader.current, outcrop = el.outcrop.current;
      const showSpot = spotShown.current && p.visible;
      if (spot && leader && outcrop) {
        spot.style.visibility = showSpot ? "visible" : "hidden";
        leader.style.visibility = outcrop.style.visibility = showSpot ? "visible" : "hidden";
        if (showSpot) {
          const left = Math.max(p.x + SPOT.cardDx, wide.matches ? 304 : 16);
          const top = Math.min(p.y + SPOT.cardDy, viewSize.current.height - 240); // stays above the credit and azimuth ruler
          spot.style.transform = `translate(${left}px, ${top}px)`;
          const ox = p.x + SPOT.outcropDx, oy = p.y + SPOT.outcropDy;
          leader.setAttribute("x1", String(left + SPOT.cardW + 2));
          leader.setAttribute("y1", String(top - 23.5));
          leader.setAttribute("x2", String(ox));
          leader.setAttribute("y2", String(oy));
          outcrop.setAttribute("cx", String(ox));
          outcrop.setAttribute("cy", String(oy));
        } else spot.style.transform = "none";
      }
    };

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
        const g = st.glide;
        if (g) {
          const p = Math.min(1, (now - g.t0) / g.ms), e = mapEase(p);
          x = g.x + (x - g.x) * e;
          z = g.z + (z - g.z) * e;
          if (h != null) st.heading = g.heading + wrapPi(h - g.heading) * e;
          if (p >= 1) st.glide = null;
        } else if (h != null) st.heading = st.snap ? h : dampAngle(st.heading, h, 2.5, dt);
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
        drawOverlays(a, pose);
        st.pose = pose;
        st.dirty = false;
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
  }, [prof, end, suit, grid, arrivals, bounds, input, setEvaT, ctx, wide]);

  // resize or a new waypoint label: redraw overlays on the next frame
  useEffect(() => {
    sim.current.dirty = true;
  }, [view.width, view.height, hud.nextLabel]);

  /* ---------- actions ---------- */

  const jump = (T: number) => {
    const st = sim.current;
    const from = st.explore;
    st.T = Math.min(Math.max(T, 0), end.t);
    // the eye glides to the new point like the map camera (instant with reduced motion or for tiny steps)
    const to = sampleAt(prof, st.T, suit);
    const ms = isReducedMotion() || Math.hypot(to.x - from.x, to.z - from.z) <= 0.5 ? 0 : stepMs();
    st.glide = ms > 0 ? { x: from.x, z: from.z, heading: st.heading, t0: performance.now(), ms } : null;
    st.snap = !st.glide;
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

  /* ---------- live chrome ---------- */

  const look = hud.lookDeg;
  const pxPerDeg = (view.width || 1366) / FOV_H; // the ruler matches the 3D view: 70° across the screen
  const rulerMid = ((view.width || 1366) - 48) / 2;
  const azX = (deg: number) => rulerMid + dDeg(deg, look) * pxPerDeg;
  const azimuthTicks = Array.from({ length: 17 }, (_, i) => Math.round(look / 5) * 5 - 40 + i * 5);
  const [mx, my] = mini.px(hud.pos.x, hud.pos.z);
  const cone = (a: number) => `${mx + 72 * Math.sin(a)} ${my - 72 * Math.cos(a)}`;
  const toPath = (pts: readonly (readonly number[])[]) => pts.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join("");
  const walkedPath = toPath([...prof.slice(0, hud.k).map((p) => mini.px(p.x, p.z)), [mx, my]]);
  const aheadPath = toPath([[mx, my], ...prof.slice(hud.k).map((p) => mini.px(p.x, p.z))]);
  const pct = Math.round((100 * hud.dist) / (end.dist || 1));
  const done = hud.T >= end.t;
  const ahead = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}`;

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

      {/* ---------- Sky and scene overlays: projected through the 3D camera every frame ---------- */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible" fill="none">
        <line ref={el.horizon} x1={0} x2={0} y1={-10} y2={-10} stroke="var(--text-primary)" opacity={0.35} />
        <path ref={el.predicted} stroke="var(--text-primary)" strokeWidth={2} strokeDasharray="6 8" opacity={0.75} />
        <path ref={el.flown} stroke="var(--text-primary)" strokeWidth={2} />
        <line ref={el.leader} stroke="var(--text-primary)" strokeWidth={1.5} style={{ visibility: "hidden" }} />
        <ellipse ref={el.outcrop} rx={5.714} ry={1.579} stroke="var(--text-primary)" strokeWidth={1.5} style={{ visibility: "hidden" }} />
      </svg>
      <div className="pointer-events-none absolute inset-0">
        <div ref={el.sat} className="absolute top-0 left-0" style={{ visibility: "hidden" }}>
          <SatelliteMarker label={SAT.label} style={{ left: -13, top: -12 }} />
          <Brackets className="top-[-19.5px] left-[-20px] size-[40px]" delay={tick * 12} />
        </div>
        <div ref={el.satPin} className="absolute top-0 left-0 flex items-center gap-xs" style={{ visibility: "hidden" }}>
          <span className="flex size-[24px] items-center justify-center rounded-pill bg-scrim text-fg">
            <Icon name="arrow" size={16} />
          </span>
          <SatelliteMarker label="MRS-L1 · out of view" className="relative" />
        </div>
        <div ref={el.aos} className="absolute top-0 left-0" style={{ visibility: "hidden" }}>
          <span className="absolute top-[-8px] left-[-1px] h-lg w-(--stroke-default) bg-fg" />
          <MapTag className="absolute top-[-54px] left-[-30px]">{AOS.label}</MapTag>
        </div>
        <div ref={el.los} className="absolute top-0 left-0" style={{ visibility: "hidden" }}>
          <span className="absolute top-[-8px] left-[-1px] h-lg w-(--stroke-default) bg-fg" />
          <MapTag className="absolute top-[18px] left-[-30px]">{LOS.label}</MapTag>
        </div>
        <div ref={el.wp} className="absolute top-0 left-0" style={{ visibility: "hidden" }}>
          <WaypointMarker label={hud.nextLabel} x={0} y={0} />
          <MapTag className="absolute top-sm left-[36px]">
            {`${hud.nextLabel} · ${Math.round(hud.nextM)} m · ${ahead(hud.nextDz)} m · max ${Math.round(hud.nextMaxSlope)}°`}
          </MapTag>
        </div>
        <div ref={el.spot} className="mw-flash-in absolute top-0 left-0 flex w-[296px] flex-col gap-xs rounded-sm border border-line-subtle bg-scrim p-md" style={{ visibility: "hidden" }}>
          <p className="whitespace-nowrap t-label-m text-fg">Spot note · outcrop left of WP4</p>
          <p className="t-body-s text-fg-secondary">Layered rock, loose scree on the left flank. Approach from the east bench</p>
        </div>
      </div>

      {/* ---------- Screen chrome, anchored to the screen edges ---------- */}

      {/* Minimap: walked dotted, ahead solid, view cone */}
      <div className="mw-flash-in pointer-events-none absolute top-lg left-lg h-[144px] w-[192px] overflow-hidden rounded-sm border border-line-subtle bg-canvas md:top-xl md:left-xl md:h-[192px] md:w-[256px]">
        <div className="absolute top-0 left-0 h-[192px] w-[256px] origin-top-left scale-75 md:scale-100">
          <OrthoBasemap src={ORTHO} {...mini.basemap} />
          <svg width={256} height={192} viewBox="0 0 256 192" fill="none" aria-hidden="true" className="absolute -top-px -left-px">
            <path d={walkedPath} stroke="var(--route-path)" strokeWidth={2} strokeDasharray="2 5" />
            <path d={aheadPath} stroke="var(--route-path)" strokeWidth={2} />
            <path d={`M${cone((look - FOV_H / 2) * RAD)}L${mx} ${my}L${cone((look + FOV_H / 2) * RAD)}`} stroke="var(--text-primary)" opacity={0.6} />
          </svg>
          <WaypointDot size={12} className="absolute" style={{ left: mx - 6, top: my - 6 }} />
        </div>
        <MapTag className="absolute top-[7px] left-[7px]">Map · north up</MapTag>
      </div>

      {/* Camera tag */}
      <MapTag className="pointer-events-none absolute top-[176px] left-lg md:top-xl md:left-1/2 md:-translate-x-1/2">
        {`Camera · heading ${deg3(look)}° · tilt ${ahead(hud.tiltDeg)}° · field of view ${FOV_H}°`}
      </MapTag>

      {/* Elevation ruler */}
      <MapTag className="pointer-events-none absolute top-lg right-lg md:top-xl md:right-xl">Elevation</MapTag>
      <div className="mw-flash-in pointer-events-none absolute top-[64px] right-lg h-[608px] w-[72px] origin-top-right scale-[0.6] overflow-hidden rounded-sm bg-scrim md:top-[72px] md:right-xl md:scale-100">
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
        <span aria-label={`Pass maximum elevation ${ELEVATION.passMax}°`} className="absolute left-0 h-px w-full bg-fg opacity-60" style={{ top: ELEVATION.zero - ELEVATION.passMax * ELEVATION.pxPerDeg }} />
        <span aria-label={`Satellite elevation ${ELEVATION.satellite}°`} className="absolute left-0 h-(--stroke-default) w-full bg-brand" style={{ top: ELEVATION.zero - ELEVATION.satellite * ELEVATION.pxPerDeg + 1 }} />
      </div>

      {/* View controls: white map squares beside the ruler */}
      <div className="absolute top-[64px] right-[80px] z-10 flex flex-col gap-sm md:top-[72px] md:right-[112px]">
        <Button variant="map" size="icon" className="size-glove" aria-label="Reset view" title="Reset view" onClick={() => (sim.current.resetting = true)}>
          <Icon name="locate" size={20} />
        </Button>
        {finePointer ? (
          <Button
            variant="map"
            size="icon"
            className={cn("size-glove", locked && "bg-brand text-canvas")}
            aria-label={locked ? "Mouse look on, Esc to release" : "Mouse look"}
            aria-pressed={locked}
            title={locked ? "Esc to release" : "Mouse look"}
            onClick={() => viewRef.current?.requestPointerLock()}
          >
            <Icon name="look" size={20} />
          </Button>
        ) : null}
      </div>

      {/* Walk panel (brand floating panel: scrim, hairline, 16 px inside) */}
      <section
        aria-label="Walk"
        className="mw-flash-in absolute inset-x-lg bottom-[88px] flex max-h-[40%] flex-col overflow-hidden rounded-sm border border-line-subtle bg-scrim md:inset-x-auto md:top-[240px] md:bottom-auto md:left-xl md:max-h-[calc(100%_-_344px)] md:w-[256px]"
      >
        <header className="mw-header-wipe flex shrink-0 items-center gap-sm border-b border-line-subtle py-xs pr-xs pl-lg">
          <h2 className="min-w-px flex-1 t-label-m text-fg">Walk</h2>
          {mode === "route" ? (
            <Button variant="ghost" size="control" className="text-fg-secondary" onClick={restart} aria-label="Restart from the route start">
              Restart
            </Button>
          ) : (
            <p className="py-sm pr-md t-data-telemetry text-caution">Off the plan</p>
          )}
        </header>
        <ScrollArea className="flex min-h-0 flex-col" viewportClassName="min-h-0 flex-1">
          <div className="flex flex-col gap-md px-lg py-md">
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && changeMode(v as Mode)} aria-label="Movement mode" className="flex w-full">
              <ToggleGroupItem value="route" className="h-glove min-w-0 flex-1 px-xs">Follow route</ToggleGroupItem>
              <ToggleGroupItem value="explore" className="h-glove min-w-0 flex-1 px-xs">Free explore</ToggleGroupItem>
            </ToggleGroup>

            {mode === "route" ? (
              <>
                <StatList>
                  <StatRow label="EVA clock" value={`T+${fmtHM(hud.T)}`} unit={done ? "done" : hud.dwelling ? "stop" : ""} />
                  <StatRow label="Distance" value={`${(hud.dist / 1000).toFixed(2)} / ${(end.dist / 1000).toFixed(2)}`} unit="km" />
                  <StatRow label="O₂ (model)" value={hud.o2Pct.toFixed(0)} unit="%" />
                  <StatRow label={`Next · ${hud.nextLabel}`} value={`${Math.round(hud.nextM)}`} unit="m" />
                </StatList>
                <div className="h-xs w-full overflow-hidden rounded-pill bg-inset" role="progressbar" aria-label="Route progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className="h-full bg-route-path" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex gap-sm" role="group" aria-label="EVA clock">
                  <Button variant="secondary" className="px-md" aria-label="Back 5 minutes" onClick={() => jump(sim.current.T - 5)}>−5</Button>
                  <Button className="min-w-0 flex-1 px-md" onClick={toggleWalk}>{walking ? "Pause" : done ? "Walk again" : "Walk"}</Button>
                  <Button variant="secondary" className="px-md" aria-label="Forward 5 minutes" onClick={() => jump(sim.current.T + 5)}>+5</Button>
                </div>
                <div className="flex flex-col gap-xs">
                  <p className="t-data-telemetry text-fg-muted">Speed · simulated s per real s</p>
                  <ToggleGroup type="single" value={String(rate)} onValueChange={(v) => v && setRate(Number(v) as WalkRate)} aria-label="Playback speed" className="flex w-full">
                    {WALK_RATES.map((r) => (
                      <ToggleGroupItem key={r} value={String(r)} className="h-glove min-w-0 flex-1 px-xs">{`${r}×`}</ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </>
            ) : (
              <>
                <p className="t-body-s text-fg-secondary">{`Not saved to the plan. Mission clock held at T+${fmtHM(hud.T)}.`}</p>
                <StatList>
                  <StatRow label="Explored" value={`${Math.round(hud.exploredM)}`} unit="m" />
                  <StatRow label={`To ${hud.nextLabel}`} value={`${Math.round(hud.nextM)}`} unit="m" />
                </StatList>
                <p className="t-data-telemetry text-fg-muted">{finePointer ? "W A S D to walk · Shift fast · drag or arrows to look" : "Hold the arrows to walk · drag to look"}</p>
              </>
            )}

            <div className="flex flex-col gap-xs">
              <p className="t-data-telemetry text-fg-muted">Head bob</p>
              <ToggleGroup type="single" value={bobLevel} onValueChange={(v) => v && setBobLevel(v as BobLevel)} aria-label="Head bob" className="flex w-full">
                <ToggleGroupItem value="off" className="h-glove min-w-0 flex-1 px-xs">Off</ToggleGroupItem>
                <ToggleGroupItem value="reduced" className="h-glove min-w-0 flex-1 px-xs">Reduced</ToggleGroupItem>
                <ToggleGroupItem value="normal" className="h-glove min-w-0 flex-1 px-xs">Normal</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </ScrollArea>
      </section>

      {/* Free explore pad: map controls in a cross, the centre toggles fast. Desktop/tablet simulation only, never in AR. */}
      {mode === "explore" ? (
        <div role="group" aria-label="Walk pad" className="absolute top-[232px] left-lg grid grid-cols-3 gap-sm md:top-auto md:right-[112px] md:bottom-[104px] md:left-auto">
          {PAD.map((b) => (
            <Button
              key={b.label}
              variant="map"
              size="icon"
              aria-label={b.label}
              className="size-glove touch-none"
              style={{ gridRow: b.row, gridColumn: b.col }}
              onPointerDown={press(b.move)}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              onContextMenu={(e) => e.preventDefault()}
            >
              <Icon name="arrow" size={20} style={{ transform: `rotate(${b.rotate}deg)` }} />
            </Button>
          ))}
          <Button
            variant={fast ? "primary" : "secondary"}
            size="icon"
            className="size-glove bg-scrim t-label-m data-[variant=primary]:bg-brand"
            style={{ gridRow: 2, gridColumn: 2 }}
            aria-pressed={fast}
            aria-label={`Fast, ${EXPLORE_MPS * EXPLORE_FAST_X} m/s`}
            title={`Fast · ${EXPLORE_MPS * EXPLORE_FAST_X} m/s`}
            onClick={() => setFast(!fast)}
          >
            ×{EXPLORE_FAST_X}
          </Button>
        </div>
      ) : null}

      {/* Source credit */}
      <MapTag className="pointer-events-none absolute right-lg bottom-[88px] hidden max-w-[calc(100%_-_200px)] whitespace-normal md:right-[112px] md:bottom-[96px] md:block lg:right-auto lg:left-xl">
        Terrain: USGS HiRISE DTM + orthoimage, tinted · relay pass and spot note simulated
      </MapTag>

      {/* Azimuth ruler: heading at the centre, 70° across like the view */}
      <div className="mw-flash-in pointer-events-none absolute inset-x-lg bottom-lg h-glove overflow-hidden rounded-sm bg-scrim md:inset-x-xl md:bottom-xl">
        {azimuthTicks.map((deg) => {
          const left = azX(deg);
          const major = ((deg % 15) + 15) % 15 === 0;
          return (
            <span key={deg}>
              <span className="absolute top-0 w-px bg-fg-secondary" style={{ left, height: major ? 14 : 7 }} />
              {major ? (
                <span className={`absolute top-xl -translate-x-1/2 t-data-telemetry ${azLabel(deg) === "N" ? "text-fg" : "text-fg-secondary"}`} style={{ left }}>
                  {azLabel(deg)}
                </span>
              ) : null}
            </span>
          );
        })}
        <span aria-label={`Heading ${Math.round(look)}°`} className="absolute top-0 h-full w-(--stroke-default) bg-fg" style={{ left: rulerMid }} />
        <span aria-label={`Satellite azimuth ${SAT.az}°`} className="absolute top-0 h-[20px] w-(--stroke-default) bg-brand" style={{ left: azX(SAT.az) }} />
        <span aria-label={`Walking direction ${Math.round(hud.walkDeg)}°`} className="absolute bottom-0 h-[10px] w-(--stroke-default) bg-route-path" style={{ left: azX(hud.walkDeg) }} />
      </div>
    </div>
  );
}
