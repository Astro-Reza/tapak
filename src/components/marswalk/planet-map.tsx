import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isReducedMotion, motionMs } from "@/lib/motion";
import { MARS_R, fmtKm, fmtLat, fmtLon, type Bounds, type Region } from "@/sim/context";
import { Icon } from "./icons";

/**
 * The dataset GUI's map (gui/mapview.py) on the web: one equirectangular canvas from the whole planet down to
 * the 1 m patch. Catalog rasters draw coarse to fine; the planning patch's own layers (orthoimage, planning-grid
 * rasters, route, waypoints) mount on top in their design-pixel frame. The camera is the one smooth motion on
 * the page (DESIGN-MOTION.md, map-camera 400 ms); everything else is stepped.
 */

const DEG = 180 / Math.PI;
export type GeoView = { lon: number; lat: number; h: number };
export type MapTool = "pan" | "profile" | "region";
export type LonLat = [number, number];
export type MapLayer = { id: string; image: CanvasImageSource; bounds: Bounds; cols: number; rows: number; opacity: number };
export type MapLabel = { name: string; lon: number; lat: number; kind: "site" | "feature" };
export type MapTrack = { id: string; name: string; points: LonLat[] };
export type MapFootprint = { id: string; name: string; bounds: Bounds };
export type MapSite = {
  /** lon/lat of the design frame's edges [west, east, south, north] */
  bounds: Bounds;
  size: { width: number; height: number };
  /** drawn in design pixels and scaled with the map (orthoimage, rasters) */
  content: ReactNode;
  /** drawn in screen pixels so markers keep their size; `at` maps design px to screen px */
  overlay?: (at: (x: number, y: number) => [number, number]) => ReactNode;
};
export type PlanetMapHandle = { flyTo: (v: GeoView) => void; fit: (b: Region, pad?: number) => void };

const H_MIN = 0.004; // about 240 m of latitude on screen
const H_MAX = 200;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampView = (v: GeoView): GeoView => ({ lon: clamp(v.lon, -180, 180), lat: clamp(v.lat, -90, 90), h: clamp(v.h, H_MIN, H_MAX) });

function projection(v: GeoView, W: number, H: number) {
  const ppd = H / v.h;
  const k = ppd * Math.cos(clamp(v.lat, -80, 80) / DEG);
  return {
    ppd,
    k,
    x: (lon: number) => W / 2 + (lon - v.lon) * k,
    y: (lat: number) => H / 2 - (lat - v.lat) * ppd,
    lon: (x: number) => v.lon + (x - W / 2) / k,
    lat: (y: number) => v.lat - (y - H / 2) / ppd,
  };
}
type Proj = ReturnType<typeof projection>;

/* #root is CSS-zoomed (index.css): client coordinates are screen px, layout (and the projection) is not. */
const localScale = (el: HTMLElement) => el.getBoundingClientRect().width / (el.clientWidth || 1) || 1;
const localXY = (el: HTMLElement, cx: number, cy: number): [number, number] => {
  const r = el.getBoundingClientRect(), z = localScale(el);
  return [(cx - r.left) / z, (cy - r.top) / z];
};

/** cubic-bezier(0.2, 0, 0, 1), the map easing token */
function easeMap(t: number) {
  const bez = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (bez(0.2, 0, m) < t) lo = m;
    else hi = m;
  }
  return bez(0, 1, (lo + hi) / 2);
}

/** Graticule spacing for about six lines over `span` degrees */
const GRID_STEPS = [90, 45, 30, 15, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005];
const gridStep = (span: number) => GRID_STEPS.find((s) => span / s >= 4) ?? GRID_STEPS[GRID_STEPS.length - 1];
const decimals = (step: number) => Math.max(0, Math.ceil(-Math.log10(step) + 0.01));

/** A scale bar near 120 px in 1, 2 or 5 x 10^k metres */
function scaleBar(p: Proj) {
  const mpp = MARS_R / DEG / p.ppd;
  const target = 120 * mpp;
  const pow = 10 ** Math.floor(Math.log10(target));
  const nice = [5, 2, 1].map((m) => m * pow).find((m) => m <= target) ?? pow;
  return { width: nice / mpp, label: fmtKm(nice) };
}

export function PlanetMap({
  initial,
  home,
  layers,
  site,
  tool,
  labels,
  tracks,
  footprints,
  grid,
  profile,
  region,
  readout,
  onPick,
  onProfile,
  onRegion,
  onHover,
  onView,
  handle,
  className,
  children,
}: {
  initial: GeoView;
  /** where the locate button goes (the route) */
  home: GeoView;
  layers: MapLayer[];
  site?: MapSite | null;
  tool: MapTool;
  labels?: MapLabel[];
  tracks?: MapTrack[];
  footprints?: MapFootprint[];
  grid?: boolean;
  profile?: [LonLat, LonLat] | null;
  region?: Region | null;
  /** status-line text after the coordinates (elevation) */
  readout?: (lon: number, lat: number) => string;
  onPick?: (p: LonLat) => void;
  onProfile?: (a: LonLat, b: LonLat) => void;
  onRegion?: (r: Region) => void;
  onHover?: (p: LonLat | null) => void;
  /** the lon/lat window and pixels per degree, once the camera settles */
  onView?: (r: Region, ppd: number) => void;
  handle?: Ref<PlanetMapHandle>;
  className?: string;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(() => clampView(initial));
  const viewRef = useRef(view);
  viewRef.current = view;
  const anim = useRef(0);
  const [drag, setDrag] = useState<{ kind: MapTool; a: LonLat; b: LonLat } | null>(null);
  const press = useRef<{ id: number; sx: number; sy: number; v: GeoView; a: LonLat; moved: boolean } | null>(null);
  const status = useRef<(t: string | null) => void>(() => {});

  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const P = projection(view, size.w || 1, size.h || 1);

  const flyTo = useCallback((target: GeoView) => {
    cancelAnimationFrame(anim.current);
    const to = clampView(target);
    if (isReducedMotion()) return setView(to);
    const from = viewRef.current, dur = motionMs("duration-map-camera") || 400, t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur), e = easeMap(t);
      setView({
        lon: from.lon + (to.lon - from.lon) * e,
        lat: from.lat + (to.lat - from.lat) * e,
        h: Math.exp(Math.log(from.h) + (Math.log(to.h) - Math.log(from.h)) * e),
      });
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);
  const fit = useCallback(
    (r: Region, pad = 1.3) => {
      const el = box.current;
      const W = el?.clientWidth || 1, H = el?.clientHeight || 1;
      const lat = (r.s + r.n) / 2;
      const h = Math.max((r.n - r.s) * pad, ((r.e - r.w) * pad * H * Math.cos(lat / DEG)) / W);
      flyTo({ lon: (r.w + r.e) / 2, lat, h });
    },
    [flyTo],
  );
  useImperativeHandle(handle, () => ({ flyTo, fit }), [flyTo, fit]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  /** zoom by `f` keeping the point under (x, y) still */
  const zoomAt = useCallback(
    (f: number, x: number, y: number, animate: boolean) => {
      const el = box.current!;
      const W = el.clientWidth, H = el.clientHeight, v = viewRef.current;
      const p = projection(v, W, H);
      const lon = p.lon(x), lat = p.lat(y);
      const h = clamp(v.h * f, H_MIN, H_MAX);
      const ppd = H / h;
      const clat = lat + (y - H / 2) / ppd;
      const k = ppd * Math.cos(clamp(clat, -80, 80) / DEG);
      const next = clampView({ lon: lon - (x - W / 2) / k, lat: clat, h });
      if (animate) flyTo(next);
      else {
        cancelAnimationFrame(anim.current);
        setView(next);
      }
    },
    [flyTo],
  );

  useEffect(() => {
    const el = box.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = localXY(el, e.clientX, e.clientY);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(clamp(dy, -200, 200) * 0.0025), x, y, false);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomAt]);

  // report the settled window (the "in view" stretch and the full-resolution MOLA follow it)
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  useEffect(() => {
    if (!size.w || press.current?.moved) return;
    const id = window.setTimeout(() => {
      const p = projection(viewRef.current, size.w, size.h);
      onViewRef.current?.({ w: p.lon(0), e: p.lon(size.w), s: p.lat(size.h), n: p.lat(0) }, p.ppd);
    }, 180);
    return () => window.clearTimeout(id);
  }, [view, size, drag]);

  // rasters, coarse to fine; only the visible source pixels are drawn
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(size.w * dpr) || cv.height !== Math.round(size.h * dpr)) {
      cv.width = Math.round(size.w * dpr);
      cv.height = Math.round(size.h * dpr);
    }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const p = projection(view, size.w, size.h);
    const vw = p.lon(0), ve = p.lon(size.w), vs = p.lat(size.h), vn = p.lat(0);
    for (const l of layers) {
      if (l.opacity <= 0) continue;
      const [w, e, s, n] = l.bounds;
      const iw = Math.max(w, vw), ie = Math.min(e, ve), is = Math.max(s, vs), inn = Math.min(n, vn);
      if (iw >= ie || is >= inn) continue;
      const dlon = (e - w) / l.cols, dlat = (n - s) / l.rows;
      const c0 = Math.max(0, Math.floor((iw - w) / dlon)), c1 = Math.min(l.cols, Math.ceil((ie - w) / dlon));
      const r0 = Math.max(0, Math.floor((n - inn) / dlat)), r1 = Math.min(l.rows, Math.ceil((n - is) / dlat));
      if (c1 <= c0 || r1 <= r0) continue;
      const x0 = p.x(w + c0 * dlon), x1 = p.x(w + c1 * dlon), y0 = p.y(n - r0 * dlat), y1 = p.y(n - r1 * dlat);
      ctx.imageSmoothingEnabled = (x1 - x0) / (c1 - c0) < 1; // nearest pixel once a data pixel is wider than a screen pixel
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = l.opacity;
      ctx.drawImage(l.image, c0, r0, c1 - c0, r1 - r0, x0, y0, x1 - x0, y1 - y0);
    }
    ctx.globalAlpha = 1;
  }, [view, size, layers]);

  const lonLatAt = (clientX: number, clientY: number): LonLat => {
    const [x, y] = localXY(box.current!, clientX, clientY);
    return [P.lon(x), P.lat(y)];
  };
  const hover = (ll: LonLat | null) => {
    onHover?.(ll);
    status.current(ll ? `${fmtLat(ll[1])}  ${fmtLon(ll[0])}${readout ? `  ·  ${readout(ll[0], ll[1])}` : ""}` : null);
  };

  /* ---------- overlays in screen pixels ---------- */
  const W = size.w, H = size.h;
  const vw = P.lon(0), ve = P.lon(W), vs = P.lat(H), vn = P.lat(0);
  const inView = (lon: number, lat: number) => lon >= vw && lon <= ve && lat >= vs && lat <= vn;
  const rect = (b: Bounds) => {
    const x = P.x(b[0]), y = P.y(b[3]);
    return { x, y, w: P.x(b[1]) - x, h: P.y(b[2]) - y };
  };
  const gridLines: ReactNode[] = [];
  if (grid && W) {
    const st = gridStep(Math.min(vn - vs, ve - vw));
    const dec = decimals(st);
    for (let lon = Math.ceil(Math.max(-180, vw) / st) * st; lon <= Math.min(180, ve); lon += st) {
      const x = P.x(lon);
      gridLines.push(<line key={`x${lon}`} x1={x} x2={x} y1={0} y2={H} />);
      gridLines.push(
        <text key={`tx${lon}`} x={x + 4} y={H - 8} className="t-data-telemetry" stroke="none" fill="currentColor">
          {fmtLon(lon, dec)}
        </text>,
      );
    }
    for (let lat = Math.ceil(Math.max(-90, vs) / st) * st; lat <= Math.min(90, vn); lat += st) {
      const y = P.y(lat);
      gridLines.push(<line key={`y${lat}`} x1={0} x2={W} y1={y} y2={y} />);
      gridLines.push(
        <text key={`ty${lat}`} x={8} y={y - 4} className="t-data-telemetry" stroke="none" fill="currentColor">
          {fmtLat(lat, dec)}
        </text>,
      );
    }
  }
  const trackPaths = (tracks ?? []).map((t) => {
    let d = "", last: [number, number] | null = null;
    for (const [lon, lat] of t.points) {
      const x = P.x(lon), y = P.y(lat);
      if (last && Math.abs(x - last[0]) < 1 && Math.abs(y - last[1]) < 1) continue;
      d += `${d ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      last = [x, y];
    }
    return { id: t.id, name: t.name, d, end: last };
  });
  const siteRect = site ? rect(site.bounds) : null;
  // the patch's basemap reaches past the design frame, so keep it mounted while it is within one frame of the view
  const siteShown =
    site && siteRect && siteRect.w >= 8 && siteRect.x - siteRect.w < W && siteRect.x + 2 * siteRect.w > 0 && siteRect.y - siteRect.h < H && siteRect.y + 2 * siteRect.h > 0;
  const siteAt = (x: number, y: number): [number, number] =>
    siteRect && site ? [siteRect.x + (x / site.size.width) * siteRect.w, siteRect.y + (y / site.size.height) * siteRect.h] : [0, 0];
  const line = (a: LonLat, b: LonLat, tone: string, key: string) => (
    <g key={key} className={tone}>
      <line x1={P.x(a[0])} y1={P.y(a[1])} x2={P.x(b[0])} y2={P.y(b[1])} strokeWidth={2} />
      {[a, b].map((pt, i) => (
        <g key={i}>
          <circle cx={P.x(pt[0])} cy={P.y(pt[1])} r={4} fill="currentColor" />
          <text x={P.x(pt[0]) + 8} y={P.y(pt[1]) - 8} className="t-data-telemetry" stroke="none" fill="currentColor">
            {i ? "B" : "A"}
          </text>
        </g>
      ))}
    </g>
  );
  const box2 = (r: Region, key: string) => {
    const b = rect([r.w, r.e, r.s, r.n]);
    return <rect key={key} x={b.x} y={b.y} width={b.w} height={b.h} className="text-fg" fill="currentColor" fillOpacity={0.06} strokeWidth={1.5} />;
  };
  const bar = scaleBar(P);
  const cursor = tool === "pan" ? (press.current?.moved ? "cursor-grabbing" : "cursor-grab") : "cursor-crosshair";

  return (
    <div ref={box} className={cn("relative touch-none overflow-hidden bg-canvas select-none", cursor, className)}>
      <div
        className="absolute inset-0"
        data-testid="map-pan"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          cancelAnimationFrame(anim.current);
          const a = lonLatAt(e.clientX, e.clientY);
          press.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, v: viewRef.current, a, moved: false };
        }}
        onPointerMove={(e) => {
          const ll = lonLatAt(e.clientX, e.clientY);
          hover(ll);
          const d = press.current;
          if (!d || d.id !== e.pointerId) return;
          const z = localScale(box.current!);
          const dx = (e.clientX - d.sx) / z, dy = (e.clientY - d.sy) / z;
          if (!d.moved && Math.hypot(dx, dy) < 4) return; // a tap stays a click for the markers
          if (!d.moved) {
            d.moved = true;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* released already */
            }
          }
          if (tool === "pan") {
            const p0 = projection(d.v, W, H);
            setView(clampView({ ...d.v, lon: d.v.lon - dx / p0.k, lat: d.v.lat + dy / p0.ppd }));
          } else setDrag({ kind: tool, a: d.a, b: ll });
        }}
        onPointerUp={(e) => {
          const d = press.current;
          if (!d || d.id !== e.pointerId) return;
          const raw = lonLatAt(e.clientX, e.clientY);
          // past the poles there is no planet: a tap there picks nothing, a drag stops at the pole
          const pole = (p: LonLat): LonLat => [p[0], Math.max(-90, Math.min(90, p[1]))];
          const b = pole(raw);
          if (!d.moved) {
            if (Math.abs(raw[1]) <= 90 && !(e.target as Element).closest("button")) onPick?.(b);
          } else if (tool === "profile") onProfile?.(pole(d.a), b);
          else if (tool === "region")
            onRegion?.({ w: Math.min(d.a[0], b[0]), e: Math.max(d.a[0], b[0]), s: Math.max(-90, Math.min(d.a[1], b[1])), n: Math.min(90, Math.max(d.a[1], b[1])) });
          press.current = null;
          setDrag(null);
        }}
        onPointerCancel={() => {
          press.current = null;
          setDrag(null);
        }}
        onPointerLeave={() => hover(null)}
        onDoubleClick={(e) => {
          const [x, y] = localXY(box.current!, e.clientX, e.clientY);
          zoomAt(0.5, x, y, true);
        }}
      >
        <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 size-full" />
        {siteShown && site && siteRect ? (
          <div
            className="pointer-events-none absolute top-0 left-0 origin-top-left"
            style={{
              width: site.size.width,
              height: site.size.height,
              transform: `translate(${siteRect.x}px, ${siteRect.y}px) scale(${siteRect.w / site.size.width}, ${siteRect.h / site.size.height})`,
            }}
          >
            {site.content}
          </div>
        ) : null}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={W} height={H} fill="none" stroke="currentColor">
          {gridLines.length ? <g className="text-fg-muted" strokeOpacity={0.35} strokeWidth={1}>{gridLines}</g> : null}
          {(footprints ?? []).map((f) => {
            const b = rect(f.bounds);
            if (b.x > W || b.x + b.w < 0 || b.y > H || b.y + b.h < 0 || b.w < 6) return null;
            return (
              <g key={f.id} className="text-fg-secondary">
                <rect x={b.x} y={b.y} width={b.w} height={b.h} strokeWidth={1} strokeDasharray="4 4" />
                {b.w > 80 ? (
                  <text x={b.x + 4} y={b.y - 6} className="t-data-telemetry" stroke="none" fill="currentColor">
                    {f.name}
                  </text>
                ) : null}
              </g>
            );
          })}
          {trackPaths.map((t) =>
            t.d ? (
              <g key={t.id} className="text-brand">
                <path d={t.d} strokeWidth={2} strokeLinejoin="round" />
                {t.end ? (
                  <text x={t.end[0] + 8} y={t.end[1] + 4} className="t-data-telemetry" stroke="none" fill="currentColor">
                    {t.name}
                  </text>
                ) : null}
              </g>
            ) : null,
          )}
          {(labels ?? []).map((l) =>
            inView(l.lon, l.lat) ? (
              <g key={`${l.kind}${l.name}`} className={l.kind === "site" ? "text-fg" : "text-fg-secondary"}>
                <circle cx={P.x(l.lon)} cy={P.y(l.lat)} r={l.kind === "site" ? 3 : 2} fill="currentColor" stroke="none" />
                <text x={P.x(l.lon) + 6} y={P.y(l.lat) + 4} className="t-data-telemetry" stroke="none" fill="currentColor">
                  {l.name}
                </text>
              </g>
            ) : null,
          )}
          {siteRect && !siteShown && site && inView((site.bounds[0] + site.bounds[1]) / 2, (site.bounds[2] + site.bounds[3]) / 2) ? (
            <g className="text-brand">
              <rect x={siteRect.x + siteRect.w / 2 - 5} y={siteRect.y + siteRect.h / 2 - 5} width={10} height={10} strokeWidth={2} />
              <text x={siteRect.x + siteRect.w / 2 + 10} y={siteRect.y + siteRect.h / 2 + 4} className="t-data-telemetry" stroke="none" fill="currentColor">
                Marswalk patch
              </text>
            </g>
          ) : null}
          {siteShown && siteRect ? (
            <rect x={siteRect.x} y={siteRect.y} width={siteRect.w} height={siteRect.h} className="text-fg-muted" strokeWidth={1} />
          ) : null}
          {profile ? line(profile[0], profile[1], "text-brand", "profile") : null}
          {region ? box2(region, "region") : null}
          {drag?.kind === "profile" ? line(drag.a, drag.b, "text-fg", "drag") : null}
          {drag?.kind === "region"
            ? box2({ w: Math.min(drag.a[0], drag.b[0]), e: Math.max(drag.a[0], drag.b[0]), s: Math.min(drag.a[1], drag.b[1]), n: Math.max(drag.a[1], drag.b[1]) }, "drag")
            : null}
        </svg>
        {siteShown && site?.overlay ? site.overlay(siteAt) : null}
      </div>

      {children}

      <div className="pointer-events-none absolute right-[calc(var(--spacing-xl)+var(--size-glove)+var(--spacing-md))] bottom-xl z-10 flex flex-col items-end gap-xs">
        <StatusLine bind={status} />
        <div className="flex items-center gap-sm rounded-sm bg-scrim px-sm py-xs">
          <span className="t-data-telemetry text-fg-secondary">{bar.label}</span>
          <span aria-hidden="true" className="h-sm border-x-2 border-b-2 border-fg" style={{ width: bar.width }} />
        </div>
      </div>
      <div className="absolute right-xl bottom-xl z-10 flex flex-col gap-sm">
        <Button variant="map" size="icon" className="size-glove" aria-label="Center on the route" onClick={() => flyTo(home)}>
          <Icon name="locate" size={20} />
        </Button>
        <Button variant="map" size="icon" className="size-glove" aria-label="Whole planet" onClick={() => flyTo({ lon: 0, lat: 0, h: 190 })}>
          <Icon name="globe" size={20} />
        </Button>
        <Button
          variant="map"
          size="icon"
          className="size-glove"
          aria-label="Zoom in"
          disabled={view.h <= H_MIN * 1.01}
          onClick={() => zoomAt(0.5, W / 2, H / 2, true)}
        >
          <Icon name="plus" size={20} />
        </Button>
        <Button
          variant="map"
          size="icon"
          className="size-glove"
          aria-label="Zoom out"
          disabled={view.h >= H_MAX * 0.99}
          onClick={() => zoomAt(2, W / 2, H / 2, true)}
        >
          <Icon name="minus" size={20} />
        </Button>
      </div>
    </div>
  );
}

/** Cursor coordinates and elevation. Owns its state so moving the mouse never re-renders the map. */
function StatusLine({ bind }: { bind: { current: (t: string | null) => void } }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    bind.current = setText;
    return () => {
      bind.current = () => {};
    };
  }, [bind]);
  return text ? <p className="rounded-sm bg-scrim px-sm py-xs t-data-telemetry whitespace-nowrap text-fg">{text}</p> : null;
}
