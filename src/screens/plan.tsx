import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Fit } from "@/components/marswalk/fit";
import { HoldButton } from "@/components/marswalk/hold-button";
import { Icon } from "@/components/marswalk/icons";
import {
  EXTRA_LAYERS,
  LAYERS,
  LayerPanel,
  type ExtraLayerId,
  type PanelLayer,
  type PanelOption,
  OrthoBasemap,
  ProfileChart,
  ProfileLine,
  RouteLine,
  RasterLayer,
  RouteOverlay,
  ShadeLayer,
  WaypointDot,
  WaypointMarker,
} from "@/components/marswalk/map";
import {
  PlanetMap,
  type GeoView,
  type LonLat,
  type MapFootprint,
  type MapLabel,
  type MapLayer,
  type MapSite,
  type MapTool,
  type MapTrack,
  type PlanetMapHandle,
} from "@/components/marswalk/planet-map";
import { LogLine, MapTag, MetricTile, ScreenHeading, StatList, StatRow, StatusChip } from "@/components/marswalk/primitives";
import { useToast } from "@/components/marswalk/toaster";
import { Trace, TraceContent, TraceLine, TraceStep } from "@/components/marswalk/trace";
import type { LayerId } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { loadHires, loadOrbitalLayers, ORTHO, type Hires, type OrbitalLayers } from "@/sim/load";
import { MissionGate, PlanControls } from "@/sim/controls";
import { useMission } from "@/sim/mission";
import { arPackageFileName, buildArPackage } from "@/sim/ar-package";
import {
  ELEVATION_LABEL,
  bestElevation,
  colorize,
  fmtValue,
  loadCatalog,
  loadRaster,
  parseLatLon,
  profile as lineProfile,
  rampGradient,
  siteGeo,
  siteMetas,
  viewRange,
  type Bounds,
  type Catalog,
  type Profile,
  type Raster,
  type RasterMeta,
  type Region,
} from "@/sim/context";
import { doseValues, gridFrame, paintGrid, paintSlope, routeMask, valueRange, type Paint } from "@/sim/raster";
import { fmtHM, planView, planWalkView, pointReadout, type Box, type PointReadout } from "@/sim/view";
import { ComparePanel, NativeSelect, ProbePanel, ProfilePanel, RoversPanel, SearchPanel, WeatherPanel } from "./plan-context";

type PlanLayer = Exclude<LayerId, "link">;
const PLAN_LAYERS: PlanLayer[] = ["slope", "minerals", "thermal", "dose"];
/** Layer opacity over the basemap (Figma: 40 %). Opacity changes stay instant. */
const LAYER_OPACITY = 0.4;
/** Hillshade multiplied over the map, as the dataset GUI shades its layers */
const SHADE_OPACITY = 0.55;


const DESIGN = { width: 1038, height: 938 };
/** Where the route is fitted on the map: clear of the verdict, hazard and layer panels and the profile card. */
const ROUTE_BOX = { x0: 90, y0: 360, x1: 700, y1: 680 };
/** Orbital layers from marswalk-dataset; minerals and thermal start in the panel, the rest are in the "+" list. */
const ORBITAL_BASE: string[] = ["minerals", "thermal"];
const NEAR_PX = 80;
const RAMP_CLASS: Record<string, string> = { minerals: "ramp-minerals", thermal: "ramp-thermal" };
const fmtRange = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
const DATA_CREDITS = "CRISM: NASA/JPL-Caltech/JHUAPL · THEMIS TI: Edwards & Buz 2021, CC BY 4.0 · HiRISE: NASA/JPL/UArizona, USGS";

/** 02 · Route Planner (Pre-EVA): stops, verdict, hazard, layers and profile, computed by the science engine. */
export function PlanScreen() {
  return (
    <MissionGate>
      <PlanScreenLoaded />
    </MissionGate>
  );
}

/** The map shows the 4x MOLA overview until about this many screen pixels per degree, then the full 3.7 km grid */
const MOLA_FULL_PPD = 6;
/** Catalog layers on at start: the global MOLA relief and the CTX orthoimage around Jezero */
const CTX_START: Record<string, number> = { mola: 1, ctx_ortho: 1 };
const DEM_KEYS = ["site_dtm", "ctx_dtm", "mola", "mola:ov"];
const overlaps = (b: Bounds, r: Region) => b[0] <= r.e && b[1] >= r.w && b[2] <= r.n && b[3] >= r.s;
const isGlobal = (b: Bounds) => b[1] - b[0] >= 359;
const fmtRes = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km/px` : `${m >= 10 ? m.toFixed(0) : m.toFixed(1)} m/px`);
const GREY_RAMP = "linear-gradient(to right, #000, #fff)";
const SIDE_TABS = [
  ["route", "Route"],
  ["walk", "Walk"],
  ["probe", "Probe"],
  ["profile", "Profile"],
  ["compare", "Compare"],
  ["rovers", "Rovers"],
  ["weather", "Weather"],
  ["search", "Search"],
] as const;

function PlanScreenLoaded() {
  const toast = useToast();
  const { routeCommitted, commitRoute } = useStore();
  const { data, result, ev, busy, link, settings, evaT, setEvaT, playing, setPlaying } = useMission();
  const view = useMemo(() => planView(data!, result!, ev!, ROUTE_BOX), [data, result, ev]);
  /** Orbital layers load after the map shows; until then their rows say "loading" */
  const [orbital, setOrbital] = useState<OrbitalLayers | null>(null);
  const [orbitalError, setOrbitalError] = useState<string | null>(null);
  /** 1 m HiRISE slope and hillshade; until loaded the slope layer is not drawn */
  const [hires, setHires] = useState<Hires | null>(null);
  const [hiresError, setHiresError] = useState<string | null>(null);
  /** The dataset catalog: global to 20 m rasters, rover tracks, weather and the glossary */
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadOrbitalLayers().then(
      (o) => live && setOrbital(o),
      (e: Error) => live && setOrbitalError(e.message),
    );
    loadHires().then(
      (h) => live && setHires(h),
      (e: Error) => live && setHiresError(e.message),
    );
    loadCatalog().then(
      (c) => live && setCatalog(c),
      (e: Error) => live && setCatalogError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);
  /** Dataset GUI map switches: whole patch (default) or only near the route, no-go pixels over the slope limit, hillshade */
  const [nearOnly, setNearOnly] = useState(false);
  const [showNoGo, setShowNoGo] = useState(false);
  const [showShade, setShowShade] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showRovers, setShowRovers] = useState(true);
  const [showFootprints, setShowFootprints] = useState(false);
  /** Ramps from the data in view: dose, orbital and catalog colours span only what the map shows */
  const [inViewOnly, setInViewOnly] = useState(false);
  const [mapView, setMapView] = useState<Box | null>(null);
  const onMapView = useCallback((b: Box) => {
    const r = (v: number) => Math.round(v); // sub-pixel jitter never re-colours the map
    setMapView((prev) => (prev && r(prev.x0) === r(b.x0) && r(prev.y0) === r(b.y0) && r(prev.x1) === r(b.x1) && r(prev.y1) === r(b.y1) ? prev : b));
  }, []);
  const grid = data!.grid;
  const gridBox = useMemo(() => gridFrame(grid, view.proj), [grid, view.proj]);
  const hiresBox = useMemo(() => (hires ? gridFrame(hires, view.proj) : null), [hires, view.proj]);
  const mask = useMemo(() => (nearOnly && view.ok ? routeMask(grid, view.proj, view.route, NEAR_PX) : null), [nearOnly, view, grid]);
  const dose = useMemo(() => doseValues(data!, result!), [data, result]);
  /** Ramp ranges: the whole dataset, or only what the map frame shows */
  const stretch = inViewOnly ? mapView : null;
  const ranges = useMemo(() => {
    const r: Record<string, [number, number]> = { dose: valueRange(dose, grid, view.proj, stretch) ?? [0, 1] };
    for (const l of orbital?.layers ?? []) r[l.id] = (stretch && valueRange(l.values, grid, view.proj, stretch)) || l.range;
    return r;
  }, [dose, grid, view.proj, stretch, orbital]);
  const [tab, setTab] = useState("route");
  const walk = useMemo(
    () => (tab === "walk" ? planWalkView(data!, result!, ev!, view.proj, orbital, evaT) : null),
    [tab, data, result, ev, view, orbital, evaT],
  );
  /** Hover readout: the map pushes world metres to the panel without re-rendering the map */
  const probe = useRef<(p: [number, number] | null) => void>(() => {});
  const PLAN = view;
  const WAYPOINTS = view.waypoints;
  const [selected, setSelected] = useState("WP1");
  /** Opacity per layer; 0 hides it. Opacity changes stay instant. */
  const [opacity, setOpacity] = useState<Record<string, number>>({
    slope: LAYER_OPACITY,
    minerals: 0,
    thermal: 0,
    dose: LAYER_OPACITY,
  });
  /** Layers the user added from the "+" list: orbital ids, or extras with no dataset yet */
  const [added, setAdded] = useState<string[]>([]);
  const tick = motionMs("tick");

  /* ---------- the planet map: catalog rasters, loaded as the view needs them ---------- */
  const geo = useMemo(() => siteGeo(data!), [data]);
  const metas = useMemo(() => catalog?.rasters ?? [], [catalog]);
  const sMetas = useMemo(() => (catalog ? siteMetas(data!, catalog.site) : []), [catalog, data]);
  const metaById = useMemo(() => new Map([...metas, ...sMetas].map((m) => [m.id, m])), [metas, sMetas]);
  const [loaded, setLoaded] = useState<Record<string, Raster>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const fetchRaster = useCallback((meta: RasterMeta, overview = false) => {
    const key = overview && meta.overview ? `${meta.id}:ov` : meta.id;
    return loadRaster(meta, overview).then(
      (r) => {
        setLoaded((l) => (l[key] === r ? l : { ...l, [key]: r }));
        return r;
      },
      (e: Error) => {
        setFailed((f) => ({ ...f, [key]: e.message }));
        throw e;
      },
    );
  }, []);
  const getRaster = useCallback((meta: RasterMeta) => fetchRaster(meta), [fetchRaster]);
  const [ctxOpacity, setCtxOpacity] = useState<Record<string, number>>(CTX_START);
  const [planet, setPlanet] = useState<{ region: Region; ppd: number } | null>(null);
  const onPlanetView = useCallback(
    (region: Region, ppd: number) => {
      setPlanet({ region, ppd });
      // the planning-grid ramps read "in view" as a design-pixel box
      const [x0, z0] = geo.toWorld(region.w, region.n);
      const [x1, z1] = geo.toWorld(region.e, region.s);
      const [px0, py0] = view.proj.px(x0, z0);
      const [px1, py1] = view.proj.px(x1, z1);
      onMapView({ x0: px0, y0: py0, x1: px1, y1: py1 });
    },
    [geo, view.proj, onMapView],
  );
  const region = planet?.region ?? null;
  const ppd = planet?.ppd ?? 0;
  const fullMola = ppd > MOLA_FULL_PPD;
  useEffect(() => {
    if (!catalog) return;
    const quiet = () => {};
    for (const m of catalog.rasters) {
      const on = (ctxOpacity[m.id] ?? 0) > 0;
      if (m.overview) {
        // the elevation readout always has the overview; the full grid waits for a closer view
        fetchRaster(m, true).catch(quiet);
        if (on && fullMola) fetchRaster(m).catch(quiet);
      } else if (on && (isGlobal(m.bounds) || (region && overlaps(m.bounds, region)))) fetchRaster(m).catch(quiet);
      else if (m.id === "ctx_dtm" && region && ppd > 200 && overlaps(m.bounds, region)) fetchRaster(m).catch(quiet);
    }
    const site = sMetas[0];
    if (site && region && ppd > 2000 && overlaps(site.bounds, region)) fetchRaster(site).catch(quiet);
  }, [catalog, sMetas, ctxOpacity, region, ppd, fullMola, fetchRaster]);

  const ctxDrawn = useMemo(() => {
    const layers: MapLayer[] = [];
    const range: Record<string, [number, number] | null> = {};
    const shown = metas.filter((m) => (ctxOpacity[m.id] ?? 0) > 0).sort((a, b) => b.res_m - a.res_m);
    for (const m of shown) {
      const r = loaded[m.id] ?? loaded[`${m.id}:ov`];
      if (!r) continue;
      const rg = r.values && inViewOnly && region && r.rows * r.cols <= 4.5e6 ? viewRange(r, region) : null;
      range[m.id] = rg;
      layers.push({ id: m.id, image: colorize(r, rg, showShade && m.hillshade), bounds: r.bounds, cols: r.cols, rows: r.rows, opacity: ctxOpacity[m.id] });
    }
    return { layers, range };
  }, [metas, ctxOpacity, loaded, inViewOnly, region, showShade]);

  const ctxRows: PanelLayer[] = Object.keys(ctxOpacity).flatMap((id) => {
    const m = metaById.get(id);
    if (!m) return [];
    const r = loaded[id] ?? loaded[`${id}:ov`];
    const err = failed[id] ?? failed[`${id}:ov`];
    const rg = ctxDrawn.range[id] ?? (m.p ? ([m.p[1], m.p[3]] as [number, number]) : null);
    const where = isGlobal(m.bounds) ? "global" : m.group;
    const res = r && r.cols < m.shape[1] ? `${fmtRes(r.pxM)} overview` : fmtRes(m.res_m);
    return [
      {
        id: `ctx:${id}`,
        name: m.name,
        unit: m.units,
        low: m.kind === "scalar" && rg ? fmtValue(rg[0]) : "dark",
        high: m.kind === "scalar" && rg ? fmtValue(rg[1]) : "bright",
        gradient: m.kind === "scalar" ? rampGradient(m.ramp) : GREY_RAMP,
        note: err ? `Failed to load · ${err}` : r ? `${where} · ${res}` : (ctxOpacity[id] ?? 0) > 0 ? `${where} · loading` : `${where} · ${fmtRes(m.res_m)}`,
        opacity: ctxOpacity[id] ?? 0,
      },
    ];
  });
  /** Turn a catalog layer on; fly to it when it is nowhere in view */
  const showCtx = (id: string) => {
    const m = metaById.get(id);
    if (!m) return false;
    setCtxOpacity((o) => ({ ...o, [id]: o[id] || (m.kind === "scalar" ? 0.7 : 1) }));
    if (region && !overlaps(m.bounds, region)) mapRef.current?.fit({ w: m.bounds[0], e: m.bounds[1], s: m.bounds[2], n: m.bounds[3] });
    return true;
  };

  /* ---------- elevation, probe, profile and region (the GUI tools) ---------- */
  const dems = useMemo(() => DEM_KEYS.flatMap((k) => (loaded[k] ? [loaded[k]] : [])), [loaded]);
  const readout = useCallback(
    (lon: number, lat: number) => {
      const b = bestElevation(dems, lon, lat);
      if (!b) return "";
      const ov = b.source.cols < b.source.meta.shape[1];
      return `${fmtValue(b.value)} m · ${ov ? "MOLA overview" : ELEVATION_LABEL[b.source.meta.id] ?? b.source.meta.name}`;
    },
    [dems],
  );
  const mapRef = useRef<PlanetMapHandle>(null);
  const [tool, setTool] = useState<MapTool>("pan");
  const [point, setPoint] = useState<LonLat | null>(null);
  const [ends, setEnds] = useState<[LonLat, LonLat] | null>(null);
  const [prof, setProf] = useState<Profile | null>(null);
  const profRun = useRef(0);
  const [cmpRegion, setCmpRegion] = useState<Region | null>(null);
  const onPick = useCallback((p: LonLat) => {
    setPoint(p);
    setTab("probe");
  }, []);
  const onProfile = useCallback(
    (a: LonLat, b: LonLat) => {
      setEnds([a, b]);
      setProf(null);
      setTab("profile");
      const run = ++profRun.current;
      const box: Region = { w: Math.min(a[0], b[0]), e: Math.max(a[0], b[0]), s: Math.min(a[1], b[1]), n: Math.max(a[1], b[1]) };
      // finest first, as bestElevation reads them; the full MOLA grid only when no finer DEM covers the line
      const want = ["site_dtm", "ctx_dtm", "mola"].flatMap((id) => {
        const m = metaById.get(id);
        return m && overlaps(m.bounds, box) ? [m] : [];
      });
      Promise.allSettled(want.map((m) => fetchRaster(m))).then((rs) => {
        if (run !== profRun.current) return;
        const got = rs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
        if (!got.some((r) => r.meta.id === "mola") && loaded["mola:ov"]) got.push(loaded["mola:ov"]);
        setProf(lineProfile(got, a, b));
      });
    },
    [metaById, fetchRaster, loaded],
  );
  const onRegion = useCallback((r: Region) => {
    setCmpRegion(r);
    setTab("compare");
  }, []);
  const siteRows = useMemo(() => {
    if (!point) return null;
    const [x, z] = geo.toWorld(point[0], point[1]);
    return pointReadout(data!, result!, orbital, x, z)?.rows ?? null;
  }, [point, geo, data, result, orbital]);
  const onHover = useCallback((p: LonLat | null) => probe.current(p ? geo.toWorld(p[0], p[1]) : null), [geo]);

  const labels = useMemo<MapLabel[]>(
    () =>
      catalog
        ? [
            ...catalog.vectors.sites.map((s) => ({ ...s, kind: "site" as const })),
            ...catalog.vectors.features.map((s) => ({ ...s, kind: "feature" as const })),
          ]
        : [],
    [catalog],
  );
  const tracks = useMemo<MapTrack[]>(
    () => catalog?.vectors.rovers.map((r) => ({ id: r.id, name: r.name, points: r.lon.map((lon, i): LonLat => [lon, r.lat[i]]) })) ?? [],
    [catalog],
  );
  const footprints = useMemo<MapFootprint[]>(() => {
    const seen = new Set<string>();
    return metas.flatMap((m) => {
      const k = m.bounds.join();
      if (isGlobal(m.bounds) || seen.has(k)) return [];
      seen.add(k);
      return [{ id: m.id, name: m.group, bounds: m.bounds }];
    });
  }, [metas]);

  /* ---------- the planning patch, placed on the planet ---------- */
  const siteBounds = useMemo<Bounds>(() => {
    const [x0, z0] = view.proj.world(0, 0);
    const [x1, z1] = view.proj.world(DESIGN.width, DESIGN.height);
    const [w, n] = geo.toLonLat(x0, z0);
    const [e, s] = geo.toLonLat(x1, z1);
    return [w, e, s, n];
  }, [view.proj, geo]);
  const routeView = useMemo<GeoView>(
    () => ({ lon: (siteBounds[0] + siteBounds[1]) / 2, lat: (siteBounds[2] + siteBounds[3]) / 2, h: (siteBounds[3] - siteBounds[2]) * 1.1 }),
    [siteBounds],
  );

  const orbitalRow = (id: string, fallback?: { name: string; unit: string; ramp: string }): PanelLayer => {
    const m = orbital?.layers.find((l) => l.id === id);
    return m
      ? {
          id,
          name: m.name,
          unit: m.unit,
          low: fmtRange((ranges[id] ?? m.range)[0]),
          high: fmtRange((ranges[id] ?? m.range)[1]),
          ramp: RAMP_CLASS[m.ramp] ?? "ramp-minerals",
          note: `${m.source} · ${m.nativeM} m/px`,
          opacity: opacity[id] ?? 0,
        }
      : {
          id,
          name: fallback?.name ?? id,
          unit: fallback?.unit ?? "",
          low: "—",
          high: "—",
          ramp: fallback?.ramp ?? "ramp-minerals",
          note: orbitalError ? `Dataset failed to load · ${orbitalError}` : "Loading orbital layers",
          opacity: opacity[id] ?? 0,
        };
  };
  const isExtra = (id: string): id is ExtraLayerId => id in EXTRA_LAYERS;
  const panelLayers: PanelLayer[] = [
    ...PLAN_LAYERS.map((id) =>
      ORBITAL_BASE.includes(id)
        ? orbitalRow(id, LAYERS[id])
        : {
            id,
            ...LAYERS[id],
            low: id === "dose" ? ranges.dose[0].toFixed(2) : LAYERS[id].low,
            high: id === "dose" ? ranges.dose[1].toFixed(2) : LAYERS[id].high,
            note:
              id === "dose"
                ? "modelled · GCR × sky view · 4 m/px"
                : hiresError
                  ? `1 m slope failed to load · ${hiresError}`
                  : hires
                    ? "calculated · HiRISE DTM · 1 m/px"
                    : "Loading 1 m slope",
            opacity: opacity[id] ?? 0,
          },
    ),
    ...added.map((id) =>
      isExtra(id)
        ? { id, ...EXTRA_LAYERS[id], note: "no dataset yet · nothing drawn", opacity: opacity[id] ?? LAYER_OPACITY }
        : orbitalRow(id),
    ),
    ...ctxRows,
  ];
  const addable = [
    ...metas.filter((m) => !(m.id in ctxOpacity)).map((m) => ({ id: `ctx:${m.id}`, name: m.name, unit: m.units })),
    ...(orbital?.layers ?? []).filter((l) => !ORBITAL_BASE.includes(l.id)).map((l) => ({ id: l.id, name: l.name, unit: l.unit })),
    ...(Object.keys(EXTRA_LAYERS) as ExtraLayerId[]).map((id) => ({ id, name: EXTRA_LAYERS[id].name, unit: EXTRA_LAYERS[id].unit })),
  ].filter((l) => !added.includes(l.id));
  const panelOptions: PanelOption[] = [
    {
      id: "inview",
      label: "Only data in current view",
      hint: inViewOnly ? "ramps follow the map as you pan or zoom" : "ramps span the whole dataset",
      checked: inViewOnly,
      onChange: setInViewOnly,
    },
    {
      id: "near",
      label: "Near the route only",
      hint: nearOnly ? `within ${NEAR_PX} px of the route` : "whole terrain patch",
      checked: nearOnly,
      onChange: setNearOnly,
    },
    { id: "nogo", label: `Show no-go terrain (>${result!.s.maxSlopeDeg}°)`, hint: "1 m pixels over the slope limit", checked: showNoGo, onChange: setShowNoGo },
    { id: "shade", label: "Hillshade", hint: "sun from the north-west at 45°", checked: showShade, onChange: setShowShade },
    { id: "labels", label: "Landing sites and features", checked: showLabels, onChange: setShowLabels },
    { id: "rovers", label: "Rover traverses", checked: showRovers, onChange: setShowRovers },
    { id: "footprints", label: "Dataset footprints", hint: "outlines of the regional rasters", checked: showFootprints, onChange: setShowFootprints },
    { id: "grid", label: "Lat/lon grid", checked: showGrid, onChange: setShowGrid },
  ];
  const routeIndex = (i: number) => Math.round((i / Math.max(1, WAYPOINTS.length - 1)) * 8);
  // painted rasters change with the data, ranges and switches; opacity and hover never repaint them
  const drawn = [...PLAN_LAYERS, ...added.filter((id) => !(id in EXTRA_LAYERS))].filter((id) => (opacity[id] ?? 0) > 0);
  const drawnKey = drawn.join(",");
  const paints = useMemo(() => {
    const out: Record<string, { paint: Paint; frame: typeof gridBox }> = {};
    for (const id of drawnKey ? drawnKey.split(",") : []) {
      if (id === "slope") {
        if (hires && hiresBox) out[id] = { paint: paintSlope(hires, { mask, grid }), frame: hiresBox };
      } else if (id === "dose") out[id] = { paint: paintGrid(dose, grid, "dose", ranges.dose, mask), frame: gridBox };
      else {
        const l = orbital?.layers.find((o) => o.id === id);
        if (l) out[id] = { paint: paintGrid(l.values, grid, l.ramp, ranges[id] ?? l.range, mask), frame: gridBox };
      }
    }
    return out;
  }, [drawnKey, hires, hiresBox, mask, grid, dose, ranges, gridBox, orbital]);
  const noGo = useMemo(
    () => (showNoGo && hires ? paintSlope(hires, { noGoDeg: result!.s.maxSlopeDeg, mask, grid }) : null),
    [showNoGo, hires, result, mask, grid],
  );
  const basemap = view.proj.basemap;

  const site: MapSite = {
    bounds: siteBounds,
    size: DESIGN,
    content: (
      <>
        <OrthoBasemap src={ORTHO} {...basemap} />
        {/* dims the patch photo under the planning layers (the planet around it stays as drawn) */}
        <div aria-hidden="true" className="absolute bg-canvas opacity-35" style={{ ...basemap }} />
        {drawn.map((id) => (paints[id] ? <RasterLayer key={id} paint={paints[id].paint} frame={paints[id].frame} opacity={opacity[id]} /> : null))}
        {showShade && hires && hiresBox ? <ShadeLayer src={hires.shadeUrl} frame={hiresBox} opacity={SHADE_OPACITY} /> : null}
        {noGo && hiresBox ? <RasterLayer paint={noGo} frame={hiresBox} opacity={0.55} /> : null}
        <RouteOverlay width={DESIGN.width} height={DESIGN.height}>
          {walk ? (
            <>
              <RouteLine points={walk.walked} variant="walked-dotted" />
              <RouteLine points={walk.remaining} />
            </>
          ) : PLAN.route.length > 1 ? (
            <RouteLine key={PLAN.route.length} points={PLAN.route} />
          ) : null}
          {PLAN.caution.map((seg, i) => (
            <RouteLine key={`c${i}`} points={seg} variant="blocked" />
          ))}
        </RouteOverlay>
      </>
    ),
    overlay: (at) => (
      <>
        {WAYPOINTS.slice(0, -1).map((wp, i) => {
          const [x, y] = at(wp.at[0], wp.at[1]);
          return (
            <WaypointMarker
              key={wp.id}
              label={wp.id}
              x={x}
              y={y}
              selected={selected === wp.id}
              onSelect={() => setSelected(wp.id)}
              delay={routeIndex(i) * tick}
            />
          );
        })}
        {walk
          ? (() => {
              const [x, y] = at(walk.you[0], walk.you[1]);
              return (
                <>
                  <div
                    role="img"
                    aria-label="Your position (simulated)"
                    className="absolute flex size-control items-center justify-center rounded-pill border-3 border-brand bg-fg text-panel"
                    style={{ left: x - 18, top: y - 18 }}
                  >
                    <Icon name="astronaut" size={20} />
                  </div>
                  <MapTag className="absolute" style={{ left: x + 26, top: y + 10 }}>
                    {walk.youTag}
                  </MapTag>
                </>
              );
            })()
          : null}
      </>
    ),
  };

  const credits = [
    DATA_CREDITS,
    ...new Set(metas.filter((m) => (ctxOpacity[m.id] ?? 0) > 0 && m.credit).map((m) => m.credit!)),
  ].join(" · ");

  const warning = useMemo<{ level: "warn" | "alert"; message: string } | null>(() => {
    if (catalogError) return { level: "warn", message: `Map catalog failed to load · ${catalogError}` };
    if (!result || !view.ok) return null;
    if (ev?.reasons && ev.reasons.length > 0) {
      return { level: "alert", message: ev.reasons[0] };
    }
    if (PLAN.hazard) {
      return {
        level: "warn",
        message: `${PLAN.hazard.title} · caution ${result.s.cautionSlopeDeg}°, limit ${result.s.maxSlopeDeg}°`,
      };
    }
    if (ev?.cautions && ev.cautions.length > 0) {
      return { level: "warn", message: ev.cautions[0] };
    }
    return null;
  }, [catalogError, result, view.ok, ev, PLAN]);

  const [goto, setGoto] = useState("");
  const onGoto = (e: FormEvent) => {
    e.preventDefault();
    const ll = parseLatLon(goto);
    if (!ll) return toast("Type a latitude and longitude, e.g. 18.45, 77.45");
    mapRef.current?.flyTo({ lon: ll[1], lat: ll[0], h: 1 });
    setPoint([ll[1], ll[0]]);
    setTab("probe");
  };
  const waiting = <p className="px-lg py-xl t-body-s text-fg-muted">{catalogError ? `Catalog failed to load · ${catalogError}` : "Loading the map catalog"}</p>;

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
      {/* Left rail (below the map on narrow screens): the route plan, a walk along it, and the dataset GUI's tools */}
      <aside className="order-last flex shrink-0 flex-col bg-raised lg:order-none lg:h-full lg:w-rail">
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
          <TabsList className="shrink-0 grid-flow-row grid-cols-4" aria-label="Plan views">
            {SIDE_TABS.map(([v, label]) => (
              <TabsTrigger key={v} value={v}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="route" className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="flex-1 min-h-0" fill aria-label="Route plan">
              <div className="flex flex-1 flex-col gap-lg px-lg py-xl">
                <ScreenHeading title="Route plan" sub={PLAN.subtitle} />
                <Trace>
                  {WAYPOINTS.map((wp, i) => {
                    const open = selected === wp.id;
                    return (
                      <TraceStep key={wp.id} index={i} stagger={motionMs("stagger-group")}>
                        <TraceLine
                          first={i === 0}
                          last={i === WAYPOINTS.length - 1}
                          icon={<WaypointDot size={14} />}
                          title={`${wp.id} · ${wp.name}`}
                          description={wp.detail}
                          trailing={<StatusChip status={wp.status} />}
                          expanded={open}
                          pressed={open}
                          onClick={() => setSelected(wp.id)}
                        />
                        {open ? <TraceContent last={i === WAYPOINTS.length - 1}>{wp.legNote}</TraceContent> : null}
                      </TraceStep>
                    );
                  })}
                </Trace>
                {!view.ok ? <p role="alert" className="t-body-s text-danger">{view.error}</p> : null}
                <PlanControls />
                <StatList className="rounded-sm bg-panel px-md py-sm">
                  {PLAN.summary.map((row) => (
                    <StatRow key={row.label} {...row} />
                  ))}
                </StatList>
              </div>
            </ScrollArea>
            <div className="flex shrink-0 flex-col gap-sm border-t border-line-subtle bg-raised p-lg">
              <HoldButton
                size="control"
                label={routeCommitted ? "Route committed" : "Commit route"}
                confirmTitle="Commit this route?"
                confirmDescription={`The planned route and its ${PLAN.verdict} verdict will be sent to the suit device over the light-time link. A planned route is a planning aid, not a guarantee.`}
                onConfirm={() => {
                  if (!view.ok || busy) return toast("No route to commit", { safety: true });
                  commitRoute();
                  link.sendPlan();
                  toast(`Route committed · arrives at the suit in ${link.delayS} s`);
                }}
                onShortPress={() => toast("Hold to commit route")}
                className="w-full"
              />
              <Button
                size="control"
                variant="secondary"
                className="w-full"
                disabled={!view.ok || busy}
                onClick={() => {
                  // the phone AR app follows this file; it never re-plans (docs/AR_MISSION_PACKAGE.md)
                  const pkg = buildArPackage({ data: data!, result: result!, mode: settings.mode, settings });
                  const url = URL.createObjectURL(new Blob([JSON.stringify(pkg)], { type: "application/json" }));
                  const a = Object.assign(document.createElement("a"), { href: url, download: arPackageFileName(settings.mode, settings.startLmst) });
                  a.click();
                  URL.revokeObjectURL(url);
                  toast(`AR mission package saved · ${pkg.waypoints.length} waypoints · ${(pkg.route.distanceM / 1000).toFixed(2)} km`);
                }}
              >
                Export AR package
              </Button>
              <Button size="control" variant="secondary" className="w-full" onClick={() => toast("Stop editing is not in this prototype")}>
                Edit stops
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="walk" className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="flex-1 min-h-0" fill aria-label="Simulated walk">
              <div className="flex flex-1 flex-col gap-lg px-lg py-xl">
                <ScreenHeading
                  title="Walk the plan"
                  sub={ev?.end ? `T+${fmtHM(evaT)} of ${fmtHM(ev.end.t)} · simulated walk on the plan` : "No route to walk"}
                />
                {ev?.end && walk ? (
                  <>
                    <div className="grid grid-cols-2 gap-sm" role="group" aria-label="Simulated EVA clock">
                      <Button
                        className="col-span-2"
                        onClick={() => {
                          if (!playing && evaT >= ev.end!.t) setEvaT(0);
                          setPlaying(!playing);
                        }}
                      >
                        {playing ? "Pause" : "Play walk"}
                      </Button>
                      <Button variant="secondary" aria-label="Back 10 minutes" onClick={() => setEvaT(Math.max(0, evaT - 10))}>
                        −10 min
                      </Button>
                      <Button variant="secondary" aria-label="Forward 10 minutes" onClick={() => setEvaT(Math.min(ev.end!.t, evaT + 10))}>
                        +10 min
                      </Button>
                    </div>
                    <WalkScrubber
                      value={evaT}
                      end={ev.end.t}
                      onChange={(t) => {
                        setPlaying(false);
                        setEvaT(t);
                      }}
                    />
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line-subtle bg-line-subtle">
                      {walk.tiles.map((tile) => (
                        <MetricTile key={tile.label} {...tile} variant="grid" className="min-w-0" />
                      ))}
                    </div>
                    <p className="t-body-s text-fg-secondary">
                      The position moves along the planned route; the clock is shared with the EVA Map. Tiles read the layers at
                      that point.
                    </p>
                  </>
                ) : null}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="probe" className="flex min-h-0 flex-1 flex-col">
            {catalog ? <ProbePanel point={point} metas={[...metas, ...sMetas]} getRaster={getRaster} siteRows={siteRows} /> : waiting}
          </TabsContent>
          <TabsContent value="profile" className="flex min-h-0 flex-1 flex-col">
            <ProfilePanel ends={ends} prof={prof} />
          </TabsContent>
          <TabsContent value="compare" className="flex min-h-0 flex-1 flex-col">
            {catalog ? <ComparePanel region={cmpRegion} metas={[...metas, ...sMetas]} getRaster={getRaster} /> : waiting}
          </TabsContent>
          <TabsContent value="rovers" className="flex min-h-0 flex-1 flex-col">
            {catalog ? (
              <RoversPanel
                rovers={catalog.vectors.rovers}
                onShow={(r) => {
                  setShowRovers(true);
                  const lons = r.lon.filter(Number.isFinite), lats = r.lat.filter(Number.isFinite);
                  mapRef.current?.fit({ w: Math.min(...lons), e: Math.max(...lons), s: Math.min(...lats), n: Math.max(...lats) });
                }}
              />
            ) : (
              waiting
            )}
          </TabsContent>
          <TabsContent value="weather" className="flex min-h-0 flex-1 flex-col">
            {catalog ? <WeatherPanel weather={catalog.weather} startLmst={settings.startLmst} /> : waiting}
          </TabsContent>
          <TabsContent value="search" className="flex min-h-0 flex-1 flex-col">
            {catalog ? (
              <SearchPanel
                entries={catalog.glossary.entries}
                kinds={catalog.glossary.kinds}
                onGoto={(g) => mapRef.current?.flyTo({ lon: g[0], lat: g[1], h: g[2] })}
                onLayer={showCtx}
              />
            ) : (
              waiting
            )}
          </TabsContent>
        </Tabs>
      </aside>

      {/* Map. Panels float over it on wide screens and stack around it on narrow ones. */}
      <section className="relative flex flex-col gap-lg p-lg lg:block lg:min-w-0 lg:flex-1 lg:p-0">
        {/* Map tools (dataset GUI toolbar): pan, profile line, region box; bookmarks; go to a coordinate */}
        <div className="z-10 flex flex-col items-start gap-sm lg:absolute lg:top-xl lg:left-xl lg:max-w-[calc(100%_-_360px)]">
          <div className="flex flex-wrap items-center gap-sm rounded-sm border border-line-subtle bg-scrim p-xs backdrop-blur-sm">
            <ToggleGroup type="single" value={tool} onValueChange={(v) => v && setTool(v as MapTool)} aria-label="Map tool" className="flex">
              <ToggleGroupItem value="pan" className="h-control px-md">Pan</ToggleGroupItem>
              <ToggleGroupItem value="profile" className="h-control px-md">Profile</ToggleGroupItem>
              <ToggleGroupItem value="region" className="h-control px-md">Region</ToggleGroupItem>
            </ToggleGroup>
            <NativeSelect
              aria-label="Go to a bookmark"
              value=""
              onChange={(e) => {
                const b = catalog?.bookmarks.find((x) => x.name === e.target.value);
                if (b) mapRef.current?.flyTo({ lon: b.lon, lat: b.lat, h: b.height });
              }}
            >
              <option value="" disabled>
                Bookmarks
              </option>
              {catalog?.bookmarks.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
            <form onSubmit={onGoto} className="flex">
              <SearchInput
                aria-label="Go to latitude, longitude"
                placeholder="Lat, lon"
                value={goto}
                onChange={(e) => setGoto(e.target.value)}
                className="w-[168px] px-md"
              />
            </form>
          </div>
          {tool !== "pan" ? (
            <p className="rounded-sm bg-scrim px-md py-xs t-body-s text-fg-secondary backdrop-blur-sm">
              {tool === "profile" ? "Drag from A to B for an elevation profile" : "Drag a box to compare two layers inside it"}
            </p>
          ) : null}
          {warning ? (
            <div className="mw-flash-in flex items-center rounded-sm border border-line-subtle bg-scrim px-md py-sm backdrop-blur-sm">
              <ul className="m-0 list-none p-0">
                <LogLine time="plan" level={warning.level} message={warning.message} />
              </ul>
            </div>
          ) : null}
        </div>

        {/* Overlay control: snapped to the map's top-right */}
        <LayerPanel
          layers={panelLayers}
          addable={addable}
          onOpacity={(id, v) =>
            id.startsWith("ctx:") ? setCtxOpacity((o) => ({ ...o, [id.slice(4)]: v })) : setOpacity((o) => ({ ...o, [id]: v }))
          }
          onAdd={(id) => {
            if (id.startsWith("ctx:")) return void showCtx(id.slice(4));
            setAdded((a) => [...a, id]);
            setOpacity((o) => ({ ...o, [id]: LAYER_OPACITY }));
          }}
          options={panelOptions}
          footer={
            <div className="flex flex-col gap-xs border-t border-line-subtle pt-sm">
              <PointProbe bind={probe} read={(x, z) => pointReadout(data!, result!, orbital, x, z)} />
              <p className="t-caption text-fg-muted">{credits}</p>
            </div>
          }
          className="lg:absolute lg:top-0 lg:right-0 lg:z-10 lg:w-[304px] lg:max-h-[calc(100%_-_220px)] lg:rounded-none lg:rounded-bl-sm lg:border-t-0 lg:border-r-0"
        />

        <PlanetMap
          className="h-[60vh] min-h-[360px] rounded-md lg:absolute lg:inset-0 lg:h-auto lg:min-h-0 lg:rounded-none"
          initial={routeView}
          home={routeView}
          layers={ctxDrawn.layers}
          site={site}
          tool={tool}
          labels={showLabels ? labels : undefined}
          tracks={showRovers ? tracks : undefined}
          footprints={showFootprints ? footprints : undefined}
          grid={showGrid}
          profile={ends}
          region={cmpRegion}
          readout={readout}
          onPick={onPick}
          onProfile={onProfile}
          onRegion={onRegion}
          onHover={onHover}
          onView={onPlanetView}
          handle={mapRef}
        />

        {PLAN.profile ? (
          <Card className="rounded-sm lg:absolute lg:bottom-xl lg:left-xl lg:z-10 lg:w-[min(640px,calc(100%_-_120px))]">
            <CardHeader title="Route profile" meta={PLAN.profile.meta} />
            <Fit width={638} height={184} className="aspect-[638/184] w-full">
              <ProfileChart width={638} height={184} baseline={160} area={PLAN.profile.line}>
                <ProfileLine key={PLAN.profile.line.length} points={PLAN.profile.line} draw />
                {PLAN.profile.caution.map((seg, i) => (
                  <ProfileLine key={i} points={seg} tone="hazard" />
                ))}
              </ProfileChart>
              {PLAN.profile.stops.map((stop, i) => (
                <span key={`${stop.label}-${i}`} className="mw-reveal" style={stagger(i, headerDelay()) as CSSProperties}>
                  <WaypointDot size={10} className="absolute border" style={{ left: stop.x - 5, top: stop.y - 5 }} />
                  <span
                    className="absolute whitespace-nowrap t-data-telemetry text-fg-secondary"
                    style={{ left: stop.x - 12, top: stop.y - 26 }}
                  >
                    {stop.label}
                  </span>
                </span>
              ))}
              {PLAN.profile.axis.map((tick) => (
                <span
                  key={tick.label}
                  className="absolute top-[166px] whitespace-nowrap t-data-telemetry text-fg-muted"
                  style={{ left: tick.x }}
                >
                  {tick.label}
                </span>
              ))}
              {walk ? (
                <>
                  <span aria-hidden="true" className="absolute top-[30px] h-[130px] w-(--stroke-default) bg-brand" style={{ left: walk.nowX }} />
                  <span className="absolute top-[30px] whitespace-nowrap t-data-telemetry text-brand" style={{ left: walk.nowX + 8 }}>
                    {walk.nowLabel}
                  </span>
                </>
              ) : null}
              <span className="absolute top-sm left-[540px] whitespace-nowrap t-data-telemetry text-fg-muted">
                {PLAN.profile.datum}
              </span>
              <span className="absolute top-sm left-lg whitespace-nowrap t-body-s text-fg-secondary">
                Red dashes: above the {result!.s.cautionSlopeDeg}° caution slope
              </span>
            </Fit>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

/** Values of every layer under the cursor (Python GUI hover readout). Owns its state so hovering never re-renders the map. */
function PointProbe({
  bind,
  read,
}: {
  bind: { current: (p: [number, number] | null) => void };
  read: (x: number, z: number) => PointReadout;
}) {
  const [point, setPoint] = useState<PointReadout>(null);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    bind.current = (p) => setPoint(p ? readRef.current(p[0], p[1]) : null);
    return () => {
      bind.current = () => {};
    };
  }, [bind]);
  return (
    <section aria-label="Point readout" aria-live="off" className="flex flex-col gap-xs">
      {point ? (
        <h3 className="t-data-telemetry text-fg-secondary">{`Point · ${point.lat} ${point.lon}`}</h3>
      ) : (
        <p className="t-body-s text-fg-muted">Hover the map to read each layer at that point</p>
      )}
      {point ? (
        <StatList>
          {point.rows.map((row) => (
            <StatRow key={row.label} {...row} />
          ))}
        </StatList>
      ) : null}
    </section>
  );
}

/**
 * EVA clock scrubber. Neutral track and walked fill (no accent on progress, per DESIGN.md);
 * the brand tick is the same "now" marker as the profile. A transparent native range on top
 * keeps keyboard and screen reader control.
 */
function WalkScrubber({ value, end, onChange }: { value: number; end: number; onChange: (t: number) => void }) {
  const pct = end > 0 ? Math.min(100, Math.max(0, (value / end) * 100)) : 0;
  return (
    <div className="flex flex-col gap-xs">
      <div className="relative flex h-control items-center rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fg">
        <div aria-hidden="true" className="relative h-xs w-full overflow-hidden rounded-pill bg-inset">
          <div className="absolute inset-y-0 left-0 bg-fg-secondary" style={{ width: `${pct}%` }} />
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-sm bottom-sm w-(--stroke-default) -translate-x-1/2 bg-brand"
          style={{ left: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={Math.ceil(end)}
          step={1}
          value={Math.round(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="EVA time"
          aria-valuetext={`T+${fmtHM(value)}`}
          className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
        />
      </div>
      <div className="flex justify-between t-data-telemetry text-fg-muted">
        <span>T+0:00</span>
        <span>T+{fmtHM(end)}</span>
      </div>
    </div>
  );
}
