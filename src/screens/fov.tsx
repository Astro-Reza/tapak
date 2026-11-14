import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { OrthoBasemap, WaypointDot } from "@/components/marswalk/map";
import { useFit } from "@/components/marswalk/fit";
import { MapTag } from "@/components/marswalk/primitives";
import { sampleAt, type ProfileSample } from "@/engine";
import { ORTHO } from "@/sim/load";
import { MissionGate } from "@/sim/controls";
import { useMission } from "@/sim/mission";
import { TerrainView, FOV_V, type Projected } from "@/sim/terrain-view";
import { arrivalIndices, fitProjection, fmtHM } from "@/sim/view";

/** Elevation ruler: 0° at 607 px, 6 px per degree, major tick every 10°. */
const ELEVATION = { zero: 607, pxPerDeg: 5.99, satellite: 25, passMax: 29 };
/** Azimuth ruler: 19.5 px per degree from N at 35 px, major tick every 15°. */
/** Azimuth ruler: 19.5 px per degree; the strip is centred on the live heading. */
const AZIMUTH = { pxPerDeg: 19.5, satellite: 22 };
const azLabel = (deg: number) => { const d = ((Math.round(deg) % 360) + 360) % 360; return d === 0 ? "N" : d === 90 ? "E" : d === 180 ? "S" : d === 270 ? "W" : String(d).padStart(3, "0"); };

/** The Figma frame the camera scene is drawn in. */
const SCENE = { width: 1366, height: 938 };
/** Elevation ruler span in scene pixels (top edge and height). */
const ELEVATION_RULER = { top: 96, height: 608 };
/** Keeps the ruler clear of the minimap / tag row at the top of the screen. */
const RULER_MIN_TOP = 72;

const elevationTicks = Array.from({ length: 19 }, (_, i) => i * 5);


/**
 * 04 · FoV Simulation (During EVA): first-person 3D view on the HiRISE DTM from the astronaut's
 * position on the plan at the EVA clock, looking along the route. The relay elevation ruler is
 * still the simulated pass from the design.
 */
export function FovScreen() {
  return (
    <MissionGate>
      <FovLoaded />
    </MissionGate>
  );
}

function FovLoaded() {
  const [ref, box] = useFit(SCENE, "cover", { x: 683, y: 560 });
  const s = box.scale;
  const { data, result, ev, evaT, setEvaT } = useMission();
  const prof = ev?.prof as ProfileSample[] | undefined;
  const now = prof ? sampleAt(prof, evaT, result!.s) : null;
  // look 30 m ahead along the route (MARSWALK/app lookAheadPoint)
  const look = useMemo(() => {
    if (!prof || !now) return { x: 0, z: -10 };
    const j = prof.findIndex((p) => p.dist >= now.dist + 30);
    const p = prof[j < 0 ? prof.length - 1 : j];
    return p.x === now.x && p.z === now.z ? { x: now.x, z: now.z - 10 } : { x: p.x, z: p.z };
  }, [prof, now?.dist, now?.x, now?.z]);
  const arrivals = useMemo(() => (ev?.prof ? arrivalIndices(ev) : []), [ev]);
  const nextK = prof && now ? arrivals.findIndex((pi) => prof[pi].dist > now.dist + 1) : -1;
  const nextP = prof && nextK >= 0 ? prof[arrivals[nextK]] : null;
  const marks = useMemo(() => (nextP ? [{ x: nextP.x, z: nextP.z }] : []), [nextP]);
  const [proj, setProj] = useState<Projected[]>([]);
  const onProject = useCallback((p: Projected[]) => setProj(p), []);
  const mini = useMemo(() => (prof ? fitProjection(prof, { x0: 24, y0: 24, x1: 232, y1: 168 }, data!.terrain) : null), [prof, data]);
  if (!prof || !now || !ev?.end || !mini) return <p role="alert" className="p-xl t-body-m text-danger">No route: {ev?.error}</p>;
  const heading = (Math.atan2(look.x - now.x, -(look.z - now.z)) * 180) / Math.PI;
  const hdg = (heading + 360) % 360;
  const nextLabel = nextK === arrivals.length - 1 ? "WP1 (home)" : `WP${nextK + 1}`;

  // Elevation ruler: scene-aligned vertically, clipped below the top chrome.
  const rulerTop = box.y + ELEVATION_RULER.top * s;
  const rulerBottom = rulerTop + ELEVATION_RULER.height * s;
  const elevTop = Math.max(rulerTop, RULER_MIN_TOP);
  const elevShift = rulerTop - elevTop;
  const elevY = (deg: number) => (ELEVATION.zero - deg * ELEVATION.pxPerDeg) * s + elevShift;

  // Azimuth ruler: centred on the heading.
  const width = box.width;
  const azX = (deg: number) => width / 2 - 24 + (((deg - hdg + 540) % 360) - 180) * AZIMUTH.pxPerDeg * s;
  const azimuthTicks = Array.from({ length: 41 }, (_, i) => Math.round(hdg / 5) * 5 - 100 + i * 5);
  const [mx, my] = mini.px(now.x, now.z);

  return (
    <div ref={ref} className="relative h-full min-h-[520px] overflow-hidden">
      <TerrainView
        className="absolute inset-0"
        eye={{ x: now.x, z: now.z }}
        look={look}
        route={prof}
        marks={marks}
        onProject={onProject}
      />
      {nextP && proj[0]?.visible ? (
        <MapTag className="absolute -translate-x-1/2 -translate-y-full" style={{ left: proj[0].x, top: proj[0].y - 8 }}>
          {`${nextLabel} · ${Math.round(nextP.dist - now.dist)} m · ${nextP.y - now.y >= 0 ? "+" : ""}${Math.round(nextP.y - now.y)} m`}
        </MapTag>
      ) : null}

      {/* ---------- Screen chrome ---------- */}

      {/* Minimap */}
      <div className="mw-flash-in absolute top-lg left-lg h-[144px] w-[192px] overflow-hidden rounded-sm border border-line-subtle bg-canvas md:top-xl md:left-xl md:h-[192px] md:w-[256px]">
        <div className="absolute top-0 left-0 h-[192px] w-[256px] origin-top-left scale-75 md:scale-100">
          <OrthoBasemap src={ORTHO} {...mini.basemap} />
          <svg width={256} height={192} viewBox="0 0 256 192" fill="none" aria-hidden="true" className="absolute -top-px -left-px">
            <path d={prof.map((p, i) => `${i ? "L" : "M"}${mini.px(p.x, p.z).join(" ")}`).join("")} stroke="var(--route-path)" strokeWidth={2} />
          </svg>
          <WaypointDot size={12} className="absolute" style={{ left: mx - 6, top: my - 6 }} />
        </div>
        <MapTag className="absolute top-[7px] left-[7px]">Map · north up</MapTag>
      </div>

      <MapTag className="absolute top-[176px] left-lg max-w-[calc(100%_-_128px)] whitespace-normal md:top-xl md:left-[304px] md:max-w-[calc(100%_-_432px)]">
        {`Eye 1.7 m · heading ${String(Math.round(hdg)).padStart(3, "0")}° · vertical FoV ${FOV_V}° · T+${fmtHM(evaT)} · ${(now.dist / 1000).toFixed(2)} km`}
      </MapTag>

      {/* Elevation ruler */}
      <MapTag className="absolute right-lg md:right-xl" style={{ top: Math.max(elevTop - 40, 16) }}>
        Relay el. · simulated
      </MapTag>
      <div
        className="mw-flash-in absolute right-lg w-[72px] overflow-hidden rounded-sm bg-scrim md:right-xl"
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

      {/* Azimuth ruler */}
      <div className="mw-flash-in absolute inset-x-lg bottom-lg h-glove overflow-hidden rounded-sm bg-scrim md:inset-x-xl md:bottom-xl">
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
        <span
          aria-label={`Heading ${Math.round(hdg)}°`}
          className="absolute top-0 h-full w-(--stroke-default) bg-fg"
          style={{ left: azX(hdg) }}
        />
        <span
          aria-label={`Satellite azimuth ${AZIMUTH.satellite}°`}
          className="absolute top-0 h-[20px] w-(--stroke-default) bg-brand"
          style={{ left: azX(AZIMUTH.satellite) }}
        />
      </div>

      {/* Source credit: always shown, the image is a placeholder */}
      <MapTag className="absolute bottom-[88px] left-lg max-w-[calc(100%_-_32px)] whitespace-normal md:bottom-[96px] md:left-xl">
        Terrain: USGS Mars 2020 TRN HiRISE DTM + orthoimage (tinted) · position from the plan at the EVA clock
      </MapTag>
      <div className="absolute right-lg bottom-[88px] flex gap-sm md:right-xl md:bottom-[96px]" role="group" aria-label="EVA clock">
        <Button variant="secondary" className="bg-scrim" onClick={() => setEvaT(Math.max(0, evaT - 5))}>−5 min</Button>
        <Button variant="secondary" className="bg-scrim" onClick={() => setEvaT(Math.min(ev.end!.t, evaT + 5))}>+5 min</Button>
      </div>
    </div>
  );
}
