import type { CSSProperties } from "react";

import {
  Basemap,
  ImageSlot,
  SatelliteMarker,
  WaypointDot,
  WaypointMarker,
} from "@/components/marswalk/map";
import { FitLayer, useFit } from "@/components/marswalk/fit";
import { Brackets, MapTag } from "@/components/marswalk/primitives";
import { motionMs } from "@/lib/motion";

/** Elevation ruler: 0° at 607 px, 6 px per degree, major tick every 10°. */
const ELEVATION = { zero: 607, pxPerDeg: 5.99, satellite: 25, passMax: 29 };
/** Azimuth ruler: 19.5 px per degree from N at 35 px, major tick every 15°. */
const AZIMUTH = { north: 35, pxPerDeg: 19.5, heading: 32, satellite: 22, labels: ["N", "015", "030", "045", "060"] };

/** The Figma frame the camera scene is drawn in. */
const SCENE = { width: 1366, height: 938 };
/** Elevation ruler span in scene pixels (top edge and height). */
const ELEVATION_RULER = { top: 96, height: 608 };
/** Keeps the ruler clear of the minimap / tag row at the top of the screen. */
const RULER_MIN_TOP = 72;

const elevationTicks = Array.from({ length: 19 }, (_, i) => i * 5);
const azimuthTicks = Array.from({ length: 14 }, (_, i) => i * 5);

/**
 * 04 · FoV Simulation (During EVA): first-person view with the relay pass,
 * the path ahead and elevation / azimuth rulers. The surface photo is the one
 * bright moment; everything over it is quiet scrim chrome. Overlay geometry is
 * simulated and the image is a placeholder, as the on-screen credit says.
 *
 * The scene (photo and everything pinned to it) fills the screen around its
 * center at any aspect ratio. The rulers, minimap and credit are screen chrome
 * pinned to the edges; the rulers follow the scene's scale so their degrees
 * stay true to the photo.
 */
export function FovScreen() {
  const tick = motionMs("tick");
  const [ref, box] = useFit(SCENE, "cover", { x: 683, y: 560 });
  const s = box.scale;

  // Elevation ruler: scene-aligned vertically, clipped below the top chrome.
  const rulerTop = box.y + ELEVATION_RULER.top * s;
  const rulerBottom = rulerTop + ELEVATION_RULER.height * s;
  const elevTop = Math.max(rulerTop, RULER_MIN_TOP);
  const elevShift = rulerTop - elevTop;
  const elevY = (deg: number) => (ELEVATION.zero - deg * ELEVATION.pxPerDeg) * s + elevShift;

  // Azimuth ruler: scene-aligned horizontally inside a screen-wide strip (24 px inset).
  const azX = (deg: number) => box.x + (24 + AZIMUTH.north + deg * AZIMUTH.pxPerDeg) * s - 24;

  return (
    <div ref={ref} className="relative h-full min-h-[520px] overflow-hidden">
      <FitLayer design={SCENE} box={box}>
      <ImageSlot
        file="fov-camera.jpg"
        alt="Rover-eye view of the Martian surface toward waypoint 4"
        className="inset-0 size-full"
        missingLabel="Camera image missing · add public/images/fov-camera.jpg"
      />

      <svg width={1366} height={938} viewBox="0 0 1366 938" fill="none" aria-hidden="true" className="absolute top-0 left-0">
        {/* relay pass: predicted (dashed) and flown (solid) */}
        <path d="M-40 724C420 500 880 480 1250 600" stroke="var(--text-primary)" strokeWidth={2} strokeDasharray="6 8" opacity={0.75} />
        <path
          d="M-40 724L-12 711L15 698L43 686L70 674L98 663L125 652L153 642L180 632L208 622L235 614L263 605L290 597L317 590L344 582L372 576L399 570L426 564L453 558L479 554"
          pathLength={1}
          className="mw-route-draw"
          stroke="var(--text-primary)"
          strokeWidth={2}
          style={{ "--route-steps": 12 } as CSSProperties}
        />
        {/* path prediction toward WP4 */}
        <path d="M600 938C640 880 700 830 760 790C800 762 820 748 840 736" stroke="var(--route-path)" strokeWidth={3} strokeDasharray="10 8" />
      </svg>

      <SatelliteMarker label="MRS-L1 · el 25° · az 022° · uplink +0.6 dB" style={{ left: 467, top: 540 }} />
      <Brackets className="top-[532.5px] left-[460px] size-[40px]" delay={tick * 12} />

      <span className="absolute top-[657px] left-[98px] h-md w-(--stroke-default) bg-fg" />
      <MapTag className="absolute top-[611px] left-[68px]">AOS 15:35</MapTag>
      <span className="absolute top-[568px] left-[1160px] h-md w-(--stroke-default) bg-fg" />
      <MapTag className="absolute top-[586px] left-[1130px]">LOS 15:44</MapTag>

      {/* Horizon 0° */}
      <span className="absolute top-[704px] left-0 h-px w-full bg-fg opacity-35" />

      <WaypointMarker label="WP4" x={840} y={736} />
      <MapTag className="absolute top-[744px] left-[876px]">WP4 · 180 m · +22 m · max 12°</MapTag>

      {/* Spot note with its leader line */}
      <div className="mw-flash-in absolute top-[724px] left-[140px] flex w-[296px] flex-col gap-xs rounded-sm border border-line-subtle bg-scrim p-md">
        <p className="whitespace-nowrap t-label-m text-fg">Spot note · outcrop left of WP4</p>
        <p className="t-body-s text-fg-secondary">
          Layered rock, loose scree on the left flank. Approach from the east bench
        </p>
      </div>
      <svg width={160} height={40} viewBox="0 0 160 40" fill="none" aria-hidden="true" className="absolute top-[700px] left-[436px]">
        <path d="M1.90479 0.526367L152.381 36.8422" stroke="var(--text-primary)" strokeWidth={1.5} />
        <ellipse cx={152.381} cy={36.8421} rx={5.714} ry={1.579} stroke="var(--text-primary)" strokeWidth={1.5} />
      </svg>

      </FitLayer>

      {/* ---------- Screen chrome ---------- */}

      {/* Minimap */}
      <div className="mw-flash-in absolute top-lg left-lg h-[144px] w-[192px] overflow-hidden rounded-sm border border-line-subtle bg-canvas md:top-xl md:left-xl md:h-[192px] md:w-[256px]">
        <div className="absolute top-0 left-0 h-[192px] w-[256px] origin-top-left scale-75 md:scale-100">
          <Basemap width={8533.33} left={-6017} top={-1665} />
          <svg width={256} height={192} viewBox="0 0 256 192" fill="none" aria-hidden="true" className="absolute -top-px -left-px">
            <path d="M40 160L80 120L118 104" stroke="var(--route-path)" strokeWidth={2} strokeDasharray="2 5" />
            <path d="M118 104L150 60L176 130L120 168" stroke="var(--route-path)" strokeWidth={2} />
            <path d="M100 40L118 104L176 52" stroke="var(--text-primary)" opacity={0.6} />
          </svg>
          <WaypointDot size={12} className="absolute top-[97px] left-[111px]" />
        </div>
        <MapTag className="absolute top-[7px] left-[7px]">Map · north up</MapTag>
      </div>

      <MapTag className="absolute top-[176px] left-lg max-w-[calc(100%_-_128px)] whitespace-normal md:top-xl md:left-[304px] md:max-w-[calc(100%_-_432px)]">
        Camera · heading 032° · tilt +4° · field of view 70°
      </MapTag>

      {/* Elevation ruler */}
      <MapTag className="absolute right-lg md:right-xl" style={{ top: Math.max(elevTop - 40, 16) }}>
        Elevation
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
                  {AZIMUTH.labels[deg / 15]}
                </span>
              ) : null}
            </span>
          );
        })}
        <span
          aria-label={`Heading ${AZIMUTH.heading}°`}
          className="absolute top-0 h-full w-(--stroke-default) bg-fg"
          style={{ left: azX(AZIMUTH.heading) }}
        />
        <span
          aria-label={`Satellite azimuth ${AZIMUTH.satellite}°`}
          className="absolute top-0 h-[20px] w-(--stroke-default) bg-brand"
          style={{ left: azX(AZIMUTH.satellite) }}
        />
      </div>

      {/* Source credit: always shown, the image is a placeholder */}
      <MapTag className="absolute bottom-[88px] left-lg max-w-[calc(100%_-_32px)] whitespace-normal md:bottom-[96px] md:left-xl">
        Image: NASA/JPL-Caltech rover view, placeholder · overlay geometry simulated
      </MapTag>
    </div>
  );
}
