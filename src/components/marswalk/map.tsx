import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);
  // ponytail: keeps at least half the frame on the world; tighten to real image bounds if users get lost
  const limX = (box.width / 2) * ZOOM_STEPS[zoom];
  const limY = (box.height / 2) * ZOOM_STEPS[zoom];
  const clampPan = (x: number, y: number) => ({ x: clamp(x, -limX, limX), y: clamp(y, -limY, limY) });
  // re-clamped every render, so zooming out or resizing never strands the world off-frame
  const shown = clampPan(pan.x, pan.y);
  const recenter = () => {
    setZoom(0);
    setPan({ x: 0, y: 0 });
  };
  return (
    <div ref={ref} className={cn("relative overflow-hidden bg-canvas", className)}>
      <div
        data-testid="map-pan"
        className={cn("absolute inset-0 touch-none select-none", dragging ? "cursor-grabbing" : "mw-map-camera cursor-grab")}
        style={{ transform: `translate(${shown.x}px, ${shown.y}px)` }}
        onPointerDown={(e) => {
          if (e.button !== 0 || dragging) return; // a second finger mid-drag doesn't restart it
          drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, px: shown.x, py: shown.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
          // under 4 px is a tap, so waypoint buttons still get their click
          if (!d.moved && Math.hypot(dx, dy) < 4) return;
          if (!d.moved) {
            d.moved = true;
            setDragging(true);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* pointer already released: the drag still works without capture */
            }
          }
          setPan(clampPan(d.px + dx, d.py + dy));
        }}
        onPointerUp={(e) => {
          if (drag.current?.id !== e.pointerId) return;
          setDragging(false);
          // leave `moved` set until the click that follows, then drop it
          if (!drag.current.moved) drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.stopPropagation();
            e.preventDefault();
          }
          drag.current = null;
        }}
      >
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
      </div>
      {children}
      <div className={cn("absolute z-10 flex flex-col gap-sm", controlsClassName)}>
        <Button variant="map" size="icon" className="size-glove" aria-label="North up" onClick={recenter}>
          <Icon name="north" size={20} />
        </Button>
        <Button variant="map" size="icon" className="size-glove" aria-label="Center on position" onClick={recenter}>
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

/* ---------- Layer panel (search · add · per-layer opacity) ---------- */

/** Opacity steps the pie cycles through. 0 hides the layer. */
export const OPACITY_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;

/** Layers the user can add later. No dataset behind them yet: they list but draw nothing. */
export const EXTRA_LAYERS = {
  ph: { name: "Soil pH", unit: "scale", low: "5.5", high: "7.0", gradient: "linear-gradient(to right, #00ff1a, #ff1a00)" },
  moisture: { name: "Moisture Content", unit: "percent", low: "10", high: "25", gradient: "linear-gradient(to right, #00ff1a, #ff1a00)" },
  nutrient: { name: "Nutrient Density", unit: "index", low: "0.8", high: "1.5", gradient: "linear-gradient(to right, #2a1a4a, #ff00cc)" },
} as const;
export type ExtraLayerId = keyof typeof EXTRA_LAYERS;

export type PanelLayer = {
  id: string;
  name: string;
  unit: string;
  low: string;
  high: string;
  /** Tailwind ramp class, or a css gradient for added layers */
  ramp?: string;
  gradient?: string;
  note?: string;
  opacity: number;
};

/** Pie showing a layer's opacity: filled clockwise from the top. Click steps it. */
function OpacityPie({ value, label, onChange }: { value: number; label: string; onChange: (v: number) => void }) {
  const r = 8;
  const a = Math.min(1, Math.max(0, value)) * Math.PI * 2;
  const x = 10 + r * Math.sin(a);
  const y = 10 - r * Math.cos(a);
  const next = OPACITY_STEPS.find((s) => s > value + 1e-6) ?? 0;
  return (
    <button
      type="button"
      aria-label={`${label} opacity ${Math.round(value * 100)}%, change to ${Math.round(next * 100)}%`}
      title={`${Math.round(value * 100)}% · click to change`}
      onClick={() => onChange(next)}
      className="flex size-9 shrink-0 items-center justify-center rounded-pill text-fg hover:bg-raised/70 active:scale-95 transition-[background-color,transform] duration-75 focus-visible:outline-2 focus-visible:outline-brand"
    >
      <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true" className="text-fg">
        <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        {value >= 0.999 ? (
          <circle cx="10" cy="10" r={r} fill="currentColor" />
        ) : value > 0 ? (
          <path d={`M10 10V2A${r} ${r} 0 ${value > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`} fill="currentColor" />
        ) : null}
      </svg>
    </button>
  );
}

/**
 * Overlay control, snapped to the map's top-right. Search filters the active layers,
 * "+" lists more layers to add (no data behind them yet), the pie sets each layer's opacity.
 */
export function LayerPanel({
  layers,
  addable,
  onOpacity,
  onAdd,
  className,
  footer,
}: {
  layers: readonly PanelLayer[];
  addable: readonly { id: string; name: string; unit: string }[];
  onOpacity: (id: string, v: number) => void;
  onAdd: (id: string) => void;
  className?: string;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = layers.filter((l) => l.name.toLowerCase().includes(q));
  const options = addable.filter((l) => l.name.toLowerCase().includes(q));
  return (
    <div
      className={cn(
        "mw-flash-in flex flex-col gap-sm rounded-sm border border-line-subtle bg-scrim px-lg py-md",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-sm">
        <label className="flex h-control min-w-px flex-1 items-center gap-sm rounded-pill bg-fg px-lg text-panel focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
          <input
            type="search"
            placeholder="Search"
            aria-label="Search layers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-px flex-1 appearance-none bg-transparent t-body-m text-panel outline-none placeholder:text-panel [&::-webkit-search-cancel-button]:hidden"
          />
          <Icon name="search" size={18} />
        </label>
        <button
          type="button"
          aria-label="Add layer"
          aria-expanded={adding}
          onClick={() => setAdding((a) => !a)}
          className={cn(
            "flex size-control shrink-0 items-center justify-center rounded-pill",
            adding ? "bg-brand text-panel" : "bg-fg text-panel",
          )}
        >
          <Icon name="plus" size={18} />
        </button>
      </div>

      {adding ? (
        <div role="group" aria-label="Add a layer" className="flex shrink-0 flex-col rounded-sm bg-panel p-xs">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onAdd(o.id);
                setAdding(false);
                setQuery("");
              }}
              className="flex min-h-glove items-center gap-sm rounded-sm px-sm text-left hover:bg-raised"
            >
              <Icon name="plus" size={16} />
              <span className="min-w-px flex-1 t-label-m text-fg">{o.name}</span>
              <span className="shrink-0 t-label-unit text-fg-secondary">{o.unit}</span>
            </button>
          ))}
          {options.length === 0 ? (
            <p className="px-sm py-sm t-body-s text-fg-secondary">
              {addable.length === 0 ? "Every available layer is already on the map" : `No layer matches “${query}”`}
            </p>
          ) : null}
        </div>
      ) : null}

      <ScrollArea className="flex min-h-0 flex-col" viewportClassName="min-h-0 flex-1" aria-label="Map layers">
        <div className="flex flex-col gap-sm py-xs">
          {shown.map((l) => (
            <div key={l.id} className="flex items-center gap-md py-xs">
              {/* Left div: overlay name, units, color heatmap, number, note */}
              <div className="flex min-w-0 flex-1 flex-col gap-xs">
                <div className="flex items-baseline justify-between gap-sm">
                  <span className="truncate t-label-m text-fg">{l.name}</span>
                  <span className="shrink-0 whitespace-nowrap t-label-unit text-fg-secondary">{l.unit}</span>
                </div>
                <div
                  className={cn("h-2.5 w-full rounded-pill", l.ramp)}
                  style={l.gradient ? { background: l.gradient } : undefined}
                />
                <div className="flex w-full justify-between t-data-telemetry text-fg-secondary">
                  <span>{l.low}</span>
                  <span>{l.high}</span>
                </div>
                {l.note ? <p className="t-data-telemetry text-fg-muted">{l.note}</p> : null}
              </div>

              {/* Right div: circular graphic that controls map opacity */}
              <div className="flex shrink-0 items-center justify-center">
                <OpacityPie value={l.opacity} label={l.name} onChange={(v) => onOpacity(l.id, v)} />
              </div>
            </div>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="py-sm t-body-s text-fg-secondary">
            {layers.length === 0 ? "No layers on the map" : `No layer matches “${query}”`}
          </p>
        ) : null}
        {footer}
      </ScrollArea>
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
