import { useMemo, useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/input";
import { HazardAlert, VerdictBanner } from "@/components/marswalk/alerts";
import { Fit } from "@/components/marswalk/fit";
import { HoldButton } from "@/components/marswalk/hold-button";
import {
  CellLayer,
  LAYERS,
  LayerRow,
  MapDim,
  MapFrame,
  OrthoBasemap,
  ProfileChart,
  ProfileLine,
  RouteLine,
  RouteOverlay,
  WaypointDot,
  WaypointMarker,
} from "@/components/marswalk/map";
import { ScreenHeading, StatList, StatRow, StatusChip } from "@/components/marswalk/primitives";
import { useToast } from "@/components/marswalk/toaster";
import { Trace, TraceContent, TraceLine, TraceStep } from "@/components/marswalk/trace";
import { LAYER_CELLS, type LayerId } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { ORTHO } from "@/sim/load";
import { MissionGate, PlanControls } from "@/sim/controls";
import { useMission } from "@/sim/mission";
import { arPackageFileName, buildArPackage } from "@/sim/ar-package";
import { layerCells, planView } from "@/sim/view";

type PlanLayer = Exclude<LayerId, "link">;
type LayerState = "on" | "off" | "leaving";
const PLAN_LAYERS: PlanLayer[] = ["slope", "minerals", "thermal", "dose"];
/** Layer opacity over the basemap (Figma: 40 %). Opacity changes stay instant. */
const LAYER_OPACITY = 0.4;

const DESIGN = { width: 1038, height: 938 };
/** Where the route is fitted on the map: clear of the verdict, hazard and layer panels and the profile card. */
const ROUTE_BOX = { x0: 90, y0: 360, x1: 700, y1: 680 };
/** Hydrated minerals and thermal inertia have no dataset in the app yet: the cells stay the synthetic Figma patches. */
const SYNTHETIC: PlanLayer[] = ["minerals", "thermal"];

/** 02 · Route Planner (Pre-EVA): stops, verdict, hazard, layers and profile, computed by the science engine. */
export function PlanScreen() {
  return (
    <MissionGate>
      <PlanScreenLoaded />
    </MissionGate>
  );
}

function PlanScreenLoaded() {
  const toast = useToast();
  const { routeCommitted, commitRoute } = useStore();
  const { data, result, ev, busy, link, settings } = useMission();
  const view = useMemo(() => planView(data!, result!, ev!, ROUTE_BOX), [data, result, ev]);
  const cells = useMemo(
    () => (view.ok ? layerCells(data!, result!, view.proj, view.route, DESIGN) : null),
    [data, result, view],
  );
  const PLAN = view;
  const WAYPOINTS = view.waypoints;
  const [selected, setSelected] = useState("WP1");
  const [query, setQuery] = useState("");
  const [layers, setLayers] = useState<Record<PlanLayer, LayerState>>({
    slope: "on",
    minerals: "off",
    thermal: "off",
    dose: "on",
  });
  const timers = useRef<Partial<Record<PlanLayer, number>>>({});
  const tick = motionMs("tick");

  const toggleLayer = (id: PlanLayer) => {
    window.clearTimeout(timers.current[id]);
    setLayers((state) => {
      if (state[id] !== "on") return { ...state, [id]: "on" };
      // Off: scan out bottom to top in 3 steps, then unmount
      timers.current[id] = window.setTimeout(
        () => setLayers((s) => (s[id] === "leaving" ? { ...s, [id]: "off" } : s)),
        tick * 3,
      );
      return { ...state, [id]: "leaving" };
    });
  };

  const visibleLayers = PLAN_LAYERS.filter((id) =>
    LAYERS[id].name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const routeIndex = (i: number) => Math.round((i / Math.max(1, WAYPOINTS.length - 1)) * 8);
  const cellsFor = (id: PlanLayer) => (id === "slope" ? cells?.slope : id === "dose" ? cells?.dose : LAYER_CELLS[id]) ?? [];

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-[800px] lg:flex-row">
      {/* Left rail (below the map on narrow screens) */}
      <aside className="order-last flex flex-col gap-lg bg-raised px-lg py-xl lg:order-none lg:w-rail lg:shrink-0 lg:overflow-y-auto">
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
                {open ? (
                  <TraceContent last={i === WAYPOINTS.length - 1}>
                    {wp.legNote}
                  </TraceContent>
                ) : null}
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
        <div className="hidden min-h-px flex-1 lg:block" />
        <HoldButton
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
        <Button variant="secondary" className="w-full" onClick={() => toast("Stop editing is not in this prototype")}>
          Edit stops
        </Button>
      </aside>

      {/* Map. Panels float over it on wide screens and stack around it on narrow ones. */}
      <section className="relative flex flex-col gap-lg p-lg lg:block lg:min-w-0 lg:flex-1 lg:p-0">
        {/* Safety information: readable on the first frame, never behind a build */}
        <div className="flex flex-col gap-lg lg:pointer-events-none lg:absolute lg:inset-x-xl lg:top-xl lg:z-10">
          <VerdictBanner verdict={PLAN.verdict} reasons={PLAN.reasons} className="lg:pointer-events-auto lg:max-w-[990px]" />
          <div className="flex flex-col gap-lg md:flex-row md:items-start md:justify-between">
            {PLAN.hazard ? (
              <HazardAlert {...PLAN.hazard} className="md:w-[360px] md:min-w-0 md:shrink lg:pointer-events-auto" />
            ) : (
              <span className="hidden md:block" />
            )}

            <div className="mw-flash-in flex flex-col gap-sm rounded-sm border border-line-subtle bg-canvas px-lg py-md md:w-[304px] md:shrink-0 lg:pointer-events-auto">
              <SearchInput
                placeholder="Search or add layer"
                aria-label="Search layers"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {visibleLayers.map((id) => (
                <LayerRow
                  key={id}
                  layer={id}
                  active={layers[id] === "on"}
                  onToggle={() => toggleLayer(id)}
                  low={id === "dose" && cells ? cells.doseRange[0].toFixed(2) : undefined}
                  high={id === "dose" && cells ? cells.doseRange[1].toFixed(2) : undefined}
                  note={SYNTHETIC.includes(id) ? "synthetic placeholder · no dataset yet" : id === "dose" ? "modelled · GCR × sky view" : "calculated · HiRISE DTM"}
                />
              ))}
              {visibleLayers.length === 0 ? (
                <p className="py-sm t-body-s text-fg-secondary">No layer matches “{query}”</p>
              ) : null}
            </div>
          </div>
        </div>

      <MapFrame
        className="h-[60vh] min-h-[360px] rounded-md lg:absolute lg:inset-0 lg:h-auto lg:min-h-0 lg:rounded-none"
        design={DESIGN}
        origin={{ x: 519, y: 469 }}
        world={
          <>
            <OrthoBasemap src={ORTHO} {...view.proj.basemap} />
            <MapDim opacity={0.35} />
            {PLAN_LAYERS.map((id) =>
              layers[id] === "off" ? null : (
                <CellLayer key={id} cells={cellsFor(id)} opacity={LAYER_OPACITY} leaving={layers[id] === "leaving"} />
              ),
            )}
            <RouteOverlay width={1038} height={938}>
              {PLAN.route.length > 1 ? <RouteLine key={PLAN.route.length} points={PLAN.route} /> : null}
              {PLAN.caution.map((seg, i) => (
                <RouteLine key={`c${i}`} points={seg} variant="blocked" />
              ))}
            </RouteOverlay>
            {WAYPOINTS.slice(0, -1).map((wp, i) => (
              <WaypointMarker
                key={wp.id}
                label={wp.id}
                x={wp.at[0]}
                y={wp.at[1]}
                selected={selected === wp.id}
                onSelect={() => setSelected(wp.id)}
                delay={routeIndex(i) * tick}
              />
            ))}
          </>
        }
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
