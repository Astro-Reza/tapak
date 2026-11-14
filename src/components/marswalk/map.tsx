import { useState, type CSSProperties, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LayerId } from "@/data/mission";
import { FitLayer, useFit, type Size } from "./fit";
import { Icon } from "./icons";
import { Brackets } from "./primitives";
import { useToast } from "./toaster";

const asset = (file: string) => `${import.meta.env.BASE_URL}images/${file}`;

/* ---------- Imagery ---------- */

/**
 * A raster image slot (basemap, camera view, globe). The files are placeholders
 * exported from the Figma file into public/images. If one is missing the slot
 * falls back to a neutral surface and says so, instead of breaking the layout.
 */
const reported = new Set<string>();

export function ImageSlot({
  file,
  src,
  alt = "",
  className,
  style,
  missingLabel,
}: {
  file: string;
  /** full URL instead of public/images/<file> */
  src?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  missingLabel: string;
}) {
  const toast = useToast();
  const [missing, setMissing] = useState(false);
  // The placeholder takes the slot's own geometry (the basemap runs far past
  // the design box), so a missing image still fills the frame edge to edge.
  if (missing)
    return (
      <div
        role="img"
        aria-label={missingLabel}
        className={cn("absolute bg-inset", style ? undefined : "inset-0", className)}
        style={style}
      />
    );
  return (
    <img
      src={src ?? asset(file)}
      alt={alt}
      draggable={false}
      onError={() => {
        setMissing(true);
        if (!reported.has(file)) {
          reported.add(file);
          toast(missingLabel, { safety: true });
        }
      }}
      className={cn("pointer-events-none absolute max-w-none object-cover select-none", className)}
      style={style}
    />
  );
}

/**
 * Dims the basemap. It runs far past the design box because the basemap does,
 * so wide or tall frames are dimmed edge to edge.
 */
export function MapDim({ opacity }: { opacity: number }) {
  return <div className="absolute -inset-[300%] bg-canvas" style={{ opacity }} />;
}

/** Mars basemap placeholder texture, positioned like the Figma frame (2:1 image). */
export function Basemap({ width, left, top }: { width: number; left: number; top: number }) {
  return (
    <ImageSlot
      file="mars-basemap.jpg"
      missingLabel="Basemap image missing · add public/images/mars-basemap.jpg"
      style={{ width, height: width / 2, left, top }}
    />
  );
}

/** Real terrain: HiRISE orthoimage of the planning patch, placed by the projection (square image). */
export function OrthoBasemap({ src, left, top, width, height }: { src: string; left: number; top: number; width: number; height: number }) {
  return (
    <ImageSlot
      file="jezero-ortho.jpg"
      src={src}
      alt="HiRISE orthoimage, Jezero crater"
      missingLabel="Terrain image missing · public/data/terrain/ortho.jpg"
      style={{ left, top, width, height }}
    />
  );
}

/* ---------- Map frame with a smooth camera ---------- */

const ZOOM_STEPS = [1, 1.25, 1.6] as const;

/**
 * Map viewport. `world` (imagery, layers, route, markers) is drawn in design
 * pixels (`design`) and fitted to the frame around `origin`; the basemap runs
 * past the design box so any aspect ratio stays filled. The world sits on a
 * camera that zooms smoothly; this is the one place DESIGN-MOTION.md allows a
 * smooth ease. `children` are panels that float over the map and do not move.
 */
export function MapFrame({
  world,
  children,
  design,
  controlsClassName = "right-xl bottom-xl",
  className,
  origin,
}: {
  world: ReactNode;
  children?: ReactNode;
  design: Size;
  controlsClassName?: string;
  className?: string;
  origin: { x: number; y: number };
}) {
  const [zoom, setZoom] = useState(0);
  const [ref, box] = useFit(design, "contain", origin, { min: 0.55, max: 1.25 });
  return (
    <div ref={ref} className={cn("relative overflow-hidden bg-canvas", className)}>
      <FitLayer design={design} box={box}>
        <div
          className="mw-map-camera absolute inset-0"
          style={{
            transform: `scale(${ZOOM_STEPS[zoom]})`,
            transformOrigin: `${origin.x}px ${origin.y}px`,
          }}
        >
          {world}
        </div>
      </FitLayer>
      {children}
      <div className={cn("absolute z-10 flex flex-col gap-sm", controlsClassName)}>
        <Button variant="map" size="icon" className="size-glove" aria-label="North up" onClick={() => setZoom(0)}>
          <Icon name="north" size={20} />
        </Button>
        <Button variant="map" size="icon" className="size-glove" aria-label="Center on position" onClick={() => setZoom(0)}>
          <Icon name="locate" size={20} />
        </Button>
        <Button
          variant="map"
          size="icon"
          className="size-glove"
          aria-label="Zoom in"
          disabled={zoom === ZOOM_STEPS.length - 1}
          onClick={() => setZoom((z) => Math.min(z + 1, ZOOM_STEPS.length - 1))}
        >
          <Icon name="plus" size={20} />
        </Button>
        <Button
          variant="map"
          size="icon"
          className="size-glove"
          aria-label="Zoom out"
          disabled={zoom === 0}
          onClick={() => setZoom((z) => Math.max(z - 1, 0))}
        >
          <Icon name="minus" size={20} />
        </Button>
      </div>
    </div>
  );
}

/* ---------- Route ---------- */

export type Point = readonly [number, number];
const toPath = (points: readonly Point[]) => points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");

/**
 * Route overlay. Solid lines draw from the start in stepped segments
 * (route draw, pattern 11); dashed variants cannot use the dash trick and appear at once.
 */
export function RouteLine({
  points,
  variant = "planned",
  delay = 0,
}: {
  points: readonly Point[];
  variant?: "planned" | "walked-dotted" | "plan-dashed" | "blocked" | "walked";
  delay?: number;
}) {
  const d = toPath(points);
  const steps = points.length - 1;
  if (variant === "planned" || variant === "walked") {
    return (
      <path
        d={d}
        pathLength={1}
        className="mw-route-draw"
        stroke="var(--route-path)"
        strokeWidth={3}
        style={{ "--route-steps": steps, "--d": `${delay}ms` } as CSSProperties}
      />
    );
  }
  if (variant === "blocked") {
    return (
      <path
        d={d}
        className="mw-hazard-stroke"
        stroke="var(--route-hazard)"
        strokeWidth={3}
        strokeDasharray="8 6"
      />
    );
  }
  if (variant === "walked-dotted") {
    return (
      <path d={d} stroke="var(--text-secondary)" strokeWidth={3} strokeLinecap="round" strokeDasharray="2 6" />
    );
  }
  return <path d={d} stroke="var(--text-secondary)" strokeWidth={2} strokeDasharray="8 8" />;
}

export function RouteOverlay({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0"
    >
      {children}
    </svg>
  );
}

/* ---------- Markers ---------- */

/** Route waypoint dot: route-waypoint fill with a white ring. */
export function WaypointDot({ size, className, style }: { size: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block shrink-0 rounded-pill border-2 border-fg bg-route-waypoint", className)}
      style={{ width: size, height: size, ...style }}
    />
  );
}

/** 56 px hit area around a 16 px dot. Selected shows the signature brackets. */
export function WaypointMarker({
  label,
  x,
  y,
  selected = false,
  onSelect,
  delay = 0,
}: {
  label: string;
  /** center of the dot in map coordinates */
  x: number;
  y: number;
  selected?: boolean;
  onSelect?: () => void;
  delay?: number;
}) {
  const Comp = onSelect ? "button" : "div";
  return (
    <Comp
      {...(onSelect ? { type: "button" as const, onClick: onSelect, "aria-pressed": selected } : {})}
      aria-label={onSelect ? `Waypoint ${label}` : undefined}
      className="mw-reveal absolute size-glove"
      style={{ left: x - 28, top: y - 28, "--d": `${delay}ms` } as CSSProperties}
    >
      <WaypointDot size={16} className="absolute top-[20px] left-[20px]" />
      <span className="absolute top-xs left-[40px] whitespace-nowrap t-data-telemetry text-fg">{label}</span>
      {selected ? <Brackets /> : null}
    </Comp>
  );
}

/** Relay satellite position on the sky dome, globe or FoV arc. */
export function SatelliteMarker({
  label,
  className,
  style,
}: {
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Badge variant="marker" className={cn("absolute", className)} style={style}>
      <span aria-hidden="true" className="flex size-[14px] shrink-0 items-center justify-center">
        <span className="block size-[10px] -rotate-45 border border-canvas bg-link-high" />
      </span>
      {label}
    </Badge>
  );
}

/* ---------- Layers ---------- */

export const LAYERS: Record<LayerId, { name: string; unit: string; low: string; high: string; ramp: string }> = {
  slope: { name: "Slope", unit: "deg", low: "0", high: "35", ramp: "ramp-slope" },
  minerals: { name: "Hydrated Minerals", unit: "index", low: "0.15", high: "1.0", ramp: "ramp-minerals" },
  thermal: { name: "Thermal Inertia", unit: "SI", low: "120", high: "720", ramp: "ramp-thermal" },
  dose: { name: "Dose Rate (quiet)", unit: "mSv/day", low: "0.56", high: "0.65", ramp: "ramp-dose" },
  link: { name: "Relay Link Margin", unit: "dB", low: "−6", high: "+18", ramp: "ramp-link" },
};

/**
 * Layer toggle with a fixed low-to-high ramp. Toggling changes visibility only,
 * never the data, ramp or numbers. The ring's dot snaps in one tick.
 */
export function LayerRow({
  layer,
  active,
  onToggle,
  className,
  low,
  high,
  note,
}: {
  layer: LayerId;
  active: boolean;
  onToggle?: () => void;
  className?: string;
  /** ramp end labels from the data, when computed */
  low?: string;
  high?: string;
  /** provenance line under the ramp, e.g. "synthetic" or "modelled" */
  note?: string;
}) {
  const def = { ...LAYERS[layer], ...(low ? { low } : {}), ...(high ? { high } : {}) };
  const head = (
    <>
      <span
        aria-hidden="true"
        className="flex size-[20px] shrink-0 items-center justify-center rounded-pill border-2 border-fg"
      >
        {active ? <span className="size-[10px] rounded-pill bg-fg" /> : null}
      </span>
      <span className="min-w-px flex-1 text-left t-label-m text-fg">{def.name}</span>
      <span className="shrink-0 whitespace-nowrap t-label-unit text-fg-secondary">{def.unit}</span>
    </>
  );
  return (
    <div className={cn("flex flex-col gap-xs py-sm", className)}>
      {onToggle ? (
        <button
          type="button"
          role="switch"
          aria-checked={active}
          onClick={onToggle}
          className="flex min-h-glove w-full items-center gap-sm"
        >
          {head}
        </button>
      ) : (
        <div className="flex w-full items-center gap-sm">{head}</div>
      )}
      <div className={cn("h-md w-full rounded-pill", def.ramp)} />
      <div className="flex w-full justify-between t-data-telemetry text-fg-secondary">
        <span>{def.low}</span>
        <span>{def.high}</span>
      </div>
      {note ? <p className="t-data-telemetry text-fg-muted">{note}</p> : null}
    </div>
  );
}

/* ---------- Stepped data cells ---------- */

export type Cell = { x: number; y: number; color: string };

/**
 * A data layer drawn as stepped square cells on the 24 px grid (22 px cells,
 * 2 px gap). Turning it on runs the scan reveal; off removes it bottom to top.
 */
export function CellLayer({
  cells,
  opacity,
  leaving = false,
}: {
  cells: readonly Cell[];
  opacity: number;
  leaving?: boolean;
}) {
  return (
    <div className={cn("absolute inset-0", leaving ? "mw-scan-out" : "mw-scan-in")} style={{ opacity }}>
      {cells.map((c) => (
        <span
          key={`${c.x}-${c.y}`}
          className="absolute size-[22px]"
          style={{ left: c.x, top: c.y, background: c.color }}
        />
      ))}
    </div>
  );
}

/* ---------- Elevation profile ---------- */

export function ProfileChart({
  width,
  height,
  baseline,
  children,
  area,
}: {
  width: number;
  height: number;
  baseline: number;
  area: readonly Point[];
  children: ReactNode;
}) {
  const first = area[0];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="absolute top-0 left-0"
    >
      <path d={`${toPath(area)}V${baseline}H${first[0]}Z`} fill="var(--surface-inset)" />
      {children}
    </svg>
  );
}

export function ProfileLine({
  points,
  tone = "primary",
  draw = false,
}: {
  points: readonly Point[];
  tone?: "primary" | "secondary" | "hazard";
  draw?: boolean;
}) {
  if (tone === "hazard") {
    return (
      <path
        d={toPath(points)}
        className="mw-hazard-stroke"
        stroke="var(--route-hazard)"
        strokeWidth={3}
        strokeDasharray="5 4"
      />
    );
  }
  return (
    <path
      d={toPath(points)}
      pathLength={draw ? 1 : undefined}
      className={draw ? "mw-route-draw" : undefined}
      stroke={tone === "primary" ? "var(--route-path)" : "var(--text-secondary)"}
      strokeWidth={2}
      style={draw ? ({ "--route-steps": points.length - 1 } as CSSProperties) : undefined}
    />
  );
}
