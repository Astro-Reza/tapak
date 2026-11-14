import { useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/input";
import { HazardAlert, VerdictBanner } from "@/components/marswalk/alerts";
import { HoldButton } from "@/components/marswalk/hold-button";
import {
  Basemap,
  CellLayer,
  LAYERS,
  LayerRow,
  MapFrame,
  ProfileChart,
  ProfileLine,
  RouteLine,
  RouteOverlay,
  WaypointDot,
  WaypointMarker,
} from "@/components/marswalk/map";
import { ScreenHeading, StatList, StatRow, StatusChip } from "@/components/marswalk/primitives";
import { useToast } from "@/components/marswalk/toaster";
import { LAYER_CELLS, PLAN, WAYPOINTS, type LayerId } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { useStore } from "@/lib/store";

type PlanLayer = Exclude<LayerId, "link">;
type LayerState = "on" | "off" | "leaving";
const PLAN_LAYERS: PlanLayer[] = ["slope", "minerals", "thermal", "dose"];
/** Layer opacity over the basemap (Figma: 40 %). Opacity changes stay instant. */
const LAYER_OPACITY = 0.4;

/** 02 · Route Planner (Pre-EVA): stops, verdict, hazard, layers and profile. */
export function PlanScreen() {
  const toast = useToast();
  const { routeCommitted, commitRoute } = useStore();
  const [selected, setSelected] = useState("WP3");
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
  const routeIndex = (id: string) => {
    const wp = WAYPOINTS.find((w) => w.id === id)?.plan;
    return wp ? PLAN.route.findIndex(([x, y]) => x === wp[0] && y === wp[1]) : 0;
  };

  return (
    <>
      {/* Left rail */}
      <aside className="absolute top-top-bar bottom-0 left-0 flex w-rail flex-col gap-lg bg-raised px-lg py-xl">
        <ScreenHeading title="Route plan" sub={PLAN.subtitle} />
        <ul className="flex flex-col">
          {WAYPOINTS.map((wp, i) => (
            <li key={wp.id} className="mw-flash-in" style={stagger(i, motionMs("stagger-group"))}>
              <button
                type="button"
                aria-pressed={selected === wp.id}
                disabled={!wp.plan}
                onClick={() => setSelected(wp.id)}
                className="flex w-full items-center gap-md border-b border-line-subtle px-md py-sm text-left"
              >
                <WaypointDot size={14} />
                <span className="flex min-w-px flex-1 flex-col gap-xs">
                  <span className="truncate t-label-m text-fg">
                    {wp.id} · {wp.name}
                  </span>
                  <span className="truncate t-data-telemetry text-fg-secondary">{wp.detail}</span>
                </span>
                <StatusChip status={wp.status} />
              </button>
            </li>
          ))}
        </ul>
        <StatList className="rounded-sm bg-panel px-md py-sm">
          {PLAN.summary.map((row) => (
            <StatRow key={row.label} {...row} />
          ))}
        </StatList>
        <div className="min-h-px flex-1" />
        <HoldButton
          label={routeCommitted ? "Route committed" : "Commit route"}
          confirmTitle="Commit this route?"
          confirmDescription="The planned route and its CAUTION verdict will be synced to the HUD. A planned route is a planning aid, not a guarantee."
          onConfirm={() => {
            commitRoute();
            toast("Route committed · synced to HUD");
          }}
          onShortPress={() => toast("Hold to commit route")}
          className="w-full"
        />
        <Button variant="secondary" className="w-full" onClick={() => toast("Stop editing is not in this prototype")}>
          Edit stops
        </Button>
      </aside>

      {/* Map */}
      <MapFrame
        className="top-top-bar bottom-0 left-rail right-0"
        origin={{ x: 519, y: 469 }}
        controls={{ left: 978, top: 746 }}
        world={
          <>
            <Basemap {...PLAN.basemap} />
            <div className="absolute inset-0 bg-canvas opacity-35" />
            {PLAN_LAYERS.map((id) =>
              layers[id] === "off" ? null : (
                <CellLayer key={id} cells={LAYER_CELLS[id]} opacity={LAYER_OPACITY} leaving={layers[id] === "leaving"} />
              ),
            )}
            <RouteOverlay width={1038} height={938}>
              <RouteLine points={PLAN.blocked} variant="blocked" />
              <RouteLine points={PLAN.route} />
            </RouteOverlay>
            {WAYPOINTS.map((wp) =>
              wp.plan ? (
                <WaypointMarker
                  key={wp.id}
                  label={wp.id}
                  x={wp.plan[0]}
                  y={wp.plan[1]}
                  selected={selected === wp.id}
                  onSelect={() => setSelected(wp.id)}
                  delay={routeIndex(wp.id) * tick}
                />
              ) : null,
            )}
          </>
        }
      >
        {/* Safety information: readable on the first frame, never behind a build */}
        <VerdictBanner verdict={PLAN.verdict} reasons={PLAN.reasons} className="absolute top-xl left-xl w-[990px]" />
        <HazardAlert {...PLAN.hazard} className="absolute top-[128px] left-xl w-[360px]" />

        <div className="mw-flash-in absolute top-[128px] left-[710px] flex w-[304px] flex-col gap-sm rounded-sm border border-line-subtle bg-canvas px-lg py-md">
          <SearchInput
            placeholder="Search or add layer"
            aria-label="Search layers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {visibleLayers.map((id) => (
            <LayerRow key={id} layer={id} active={layers[id] === "on"} onToggle={() => toggleLayer(id)} />
          ))}
          {visibleLayers.length === 0 ? (
            <p className="py-sm t-body-s text-fg-secondary">No layer matches “{query}”</p>
          ) : null}
        </div>

        <Card className="absolute top-[682px] left-xl h-[232px] w-[640px] rounded-sm">
          <CardHeader title="Route profile" meta={PLAN.profile.meta} />
          <div className="relative min-h-px flex-1 overflow-hidden">
            <ProfileChart width={638} height={184} baseline={160} area={PLAN.profile.line}>
              <ProfileLine points={PLAN.profile.line} draw />
              <ProfileLine points={PLAN.profile.blocked} tone="hazard" />
            </ProfileChart>
            {PLAN.profile.stops.map((stop, i) => (
              <span key={stop.label} className="mw-reveal" style={stagger(i, headerDelay()) as CSSProperties}>
                <WaypointDot
                  size={10}
                  className="absolute border"
                  style={{ left: stop.x - 5, top: stop.y - 5 }}
                />
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
            <span className="absolute top-sm left-[560px] whitespace-nowrap t-data-telemetry text-fg-muted">
              {PLAN.profile.datum}
            </span>
            <span className="absolute top-sm left-lg whitespace-nowrap t-body-s text-fg-secondary">
              {PLAN.profile.note}
            </span>
          </div>
        </Card>
      </MapFrame>
    </>
  );
}
