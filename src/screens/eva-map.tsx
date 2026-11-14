import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchInput } from "@/components/ui/input";
import { PassRow } from "@/components/marswalk/comms";
import { Fit } from "@/components/marswalk/fit";
import { Icon } from "@/components/marswalk/icons";
import {
  CellLayer,
  EXTRA_LAYERS,
  LAYERS,
  LayerPanel,
  type ExtraLayerId,
  type PanelLayer,
  MapDim,
  MapFrame,
  OrthoBasemap,
  ProfileChart,
  ProfileLine,
  RouteLine,
  RouteOverlay,
  WaypointMarker,
} from "@/components/marswalk/map";
import {
  LogLine,
  MapTag,
  MetricTile,
  ScreenHeading,
  StatList,
  StatRow,
  StatusChip,
} from "@/components/marswalk/primitives";
import { EVA, PASSES_EVA, type LayerId } from "@/data/mission";
import { ORTHO } from "@/sim/load";
import { MissionGate } from "@/sim/controls";
import { useMission } from "@/sim/mission";
import { evaView, fmtHM, layerCells } from "@/sim/view";
import { headerDelay, motionMs, stagger } from "@/lib/motion";

const EVA_LAYERS: LayerId[] = ["slope", "dose", "link"];

/**
 * Simulated 1 Hz heart-rate feed so the readout ticker has something to show.
 * Placeholder for the suit telemetry stream; not a measurement.
 */
function useSimulatedHeartRate(start: number) {
  const [bpm, setBpm] = useState(start);
  useEffect(() => {
    const id = window.setInterval(() => {
      setBpm((v) => Math.max(88, Math.min(96, v + (Math.random() < 0.5 ? -1 : 1))));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  return bpm;
}

const DESIGN = { width: 710, height: 938 };
/** Route fitted between the search box and the profile card. */

const ROUTE_BOX = { x0: 30, y0: 200, x1: 450, y1: 680 };

/** 03 · EVA Map (During EVA): progress, live position, connectivity, telemetry. */
export function EvaMapScreen() {
  return (
    <MissionGate>
      <EvaMapLoaded />
    </MissionGate>
  );
}

function EvaMapLoaded() {
  /** Opacity per layer; 0 hides it. The pie in the layer panel steps it. */
  const [opacity, setOpacity] = useState<Record<string, number>>({ slope: 0.4, dose: 0, link: 0 });
  const [added, setAdded] = useState<ExtraLayerId[]>([]);
  const heartRate = useSimulatedHeartRate(92);
  const group = motionMs("stagger-group");
  const { data, result, ev, evaT, setEvaT, playing, setPlaying } = useMission();
  const view = useMemo(() => evaView(data!, result!, ev!, evaT, ROUTE_BOX), [data, result, ev, evaT]);
  // layer cells depend on the route only, not on the clock
  const routeKey = view ? `${view.walked.length + view.remaining.length}` : "";
  const cells = useMemo(
    () => (view ? layerCells(data!, result!, view.proj, [...view.walked, ...view.remaining], DESIGN, 60) : null),
    [data, result, ev, routeKey],
  );
  if (!view || !ev?.end) return <p role="alert" className="p-xl t-body-m text-danger">No route: {ev?.error ?? "plan first"}</p>;
  const panelLayers: PanelLayer[] = [
    ...EVA_LAYERS.map((id) => ({
      id,
      ...LAYERS[id],
      low: id === "dose" && cells ? cells.doseRange[0].toFixed(2) : LAYERS[id].low,
      high: id === "dose" && cells ? cells.doseRange[1].toFixed(2) : LAYERS[id].high,
      note: id === "link" ? "not modelled yet" : id === "dose" ? "modelled · GCR × sky view" : "calculated · HiRISE DTM",
      opacity: opacity[id] ?? 0,
    })),
    ...added.map((id) => ({ id, ...EXTRA_LAYERS[id], note: "no dataset yet · nothing drawn", opacity: opacity[id] ?? 0.35 })),
  ];
  const addable = (Object.keys(EXTRA_LAYERS) as ExtraLayerId[])
    .filter((id) => !added.includes(id))
    .map((id) => ({ id, name: EXTRA_LAYERS[id].name, unit: EXTRA_LAYERS[id].unit }));
  const end = ev.end;
  const profile = view.profile;
  const s = result!.s;

  return (
    <div className="flex min-h-full flex-col xl:h-full xl:flex-row">
      <ScrollArea className="shrink-0 bg-raised xl:w-rail" fill aria-label="EVA progress">
      <aside className="flex flex-1 flex-col gap-lg px-lg py-xl">
        <ScreenHeading title="EVA progress" sub={`T+${fmtHM(evaT)} of ${fmtHM(s.evaLimitMin)} cap · simulated walk on the plan`} />
        <div className="flex items-center gap-sm" role="group" aria-label="Simulated EVA clock">
          <Button variant="secondary" aria-label="Back 10 minutes" onClick={() => setEvaT(Math.max(0, evaT - 10))}>
            −10
          </Button>
          <Button className="min-w-0 flex-1" onClick={() => {
            if (!playing && evaT >= end.t) setEvaT(0);
            setPlaying(!playing);
          }}>
            {playing ? "Pause" : "Play walk"}
          </Button>
          <Button variant="secondary" aria-label="Forward 10 minutes" onClick={() => setEvaT(Math.min(end.t, evaT + 10))}>
            +10
          </Button>
        </div>
        {view.st.level !== "nominal" ? (
          <p role="alert" className={view.st.level === "return" ? "t-label-m text-danger" : "t-label-m text-caution"}>
            {view.st.level === "return" ? "Start your return now: O₂ or EVA time covers the walk home only." : "Reserve below plan margin."}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-2">
          {view.tiles.map((tile, i) => (
            <MetricTile key={tile.label} {...tile} className="min-w-0" style={stagger(i, group)} />
          ))}
        </div>
        <Card className="shrink-0 rounded-sm">
          <CardHeader title="Prediction" meta="modelled" delay={group * 2} />
          <StatList className="px-md py-sm">
            {view.prediction.map((row) => (
              <StatRow key={row.label} {...row} />
            ))}
          </StatList>
        </Card>
      </aside>
      </ScrollArea>

      <section className="relative flex flex-col gap-lg p-lg xl:block xl:min-w-0 xl:flex-1 xl:p-0">
      <MapFrame
        className="h-[60vh] min-h-[380px] rounded-md xl:absolute xl:inset-0 xl:h-auto xl:min-h-0 xl:rounded-none"
        design={DESIGN}
        origin={{ x: view.you[0], y: view.you[1] }}
        controlsClassName="right-lg top-1/2 -translate-y-1/2 xl:top-xl xl:right-[344px] xl:translate-y-0"
        world={
          <>
            <OrthoBasemap src={ORTHO} {...view.proj.basemap} />
            <MapDim opacity={0.3} />
            {cells && opacity.slope > 0 ? <CellLayer cells={cells.slope} opacity={opacity.slope} /> : null}
            {cells && opacity.dose > 0 ? <CellLayer cells={cells.dose} opacity={opacity.dose} /> : null}
            {cells ? <CellLayer cells={cells.noGo} opacity={0.45} /> : null}
            <div aria-hidden="true" className="absolute inset-0">
              {view.ring.map((c) => (
                <span key={`${c.x}-${c.y}`} className="absolute size-[6px] rounded-pill" style={{ left: c.x, top: c.y, background: c.color }} />
              ))}
            </div>
            <RouteOverlay width={710} height={938}>
              <RouteLine points={view.walked} variant="walked-dotted" />
              <RouteLine key={ev.end.dist} points={view.remaining} />
            </RouteOverlay>
            {view.markers.map((m) => (
              <WaypointMarker key={m.label} label={m.label} x={m.x} y={m.y} selected={m.next} />
            ))}
            <div
              role="img"
              aria-label="Your position"
              className="absolute flex size-control items-center justify-center rounded-pill border-3 border-brand bg-fg text-panel"
              style={{ left: view.you[0] - 18, top: view.you[1] - 18 }}
            >
              <Icon name="astronaut" size={20} />
            </div>
            <MapTag className="absolute" style={{ left: view.you[0] + 26, top: view.you[1] + 10 }}>
              {view.youTag}
            </MapTag>
          </>
        }
      >
        <SearchInput
          placeholder="Search in map"
          aria-label="Search in map"
          className="absolute top-lg left-lg z-10 w-[min(260px,calc(100%_-_32px))] xl:top-xl xl:left-xl"
        />
      </MapFrame>

        <LayerPanel
          layers={panelLayers}
          addable={addable}
          onOpacity={(id, v) => setOpacity((o) => ({ ...o, [id]: v }))}
          onAdd={(id) => {
            setAdded((a) => [...a, id as ExtraLayerId]);
            setOpacity((o) => ({ ...o, [id]: 0.35 }));
          }}
          className="xl:absolute xl:top-xl xl:right-xl xl:z-10 xl:max-h-[calc(100%_-_352px)] xl:w-[296px]"
          footer={
            <p className="py-sm t-data-telemetry text-fg-secondary">
              <span className="text-danger">■</span> over the {s.maxSlopeDeg}° limit · <span className="text-danger">●</span> no-return ring
              {view.ring.length ? "" : " (beyond this map)"}
            </p>
          }
        />

        <Card className="rounded-sm xl:absolute xl:inset-x-xl xl:bottom-xl xl:z-10">
          <CardHeader title="Route profile" meta={profile.meta} />
          <Fit width={660} height={148} className="aspect-[660/148] w-full" key={ev.end.dist}>
            <ProfileChart width={660} height={148} baseline={130} area={[...profile.walked, ...profile.ahead.slice(1)]}>
              <ProfileLine points={profile.walked} tone="secondary" />
              <ProfileLine points={profile.ahead} draw />
            </ProfileChart>
            {/* brand marks "now" */}
            <span
              aria-hidden="true"
              className="absolute top-[10px] h-[120px] w-(--stroke-default) bg-brand"
              style={{ left: profile.nowX }}
            />
            <span
              className="absolute top-sm whitespace-nowrap t-data-telemetry text-brand"
              style={{ left: profile.nowX + 8 }}
            >
              {profile.nowLabel}
            </span>
          </Fit>
        </Card>
      </section>

      <ScrollArea className="shrink-0 bg-raised xl:w-rail" fill aria-label="Connectivity">
      <aside className="flex flex-1 flex-col gap-lg px-lg py-xl">
        <ScreenHeading title="Connectivity" sub="Tablet · HUD · relay · habitat · simulated" />
        <ul className="flex flex-col gap-xs rounded-sm bg-panel px-md py-sm">
          {EVA.hops.map((hop, i) => (
            <li key={hop.name} className="mw-flash-in flex items-center gap-sm py-xs" style={stagger(i, group)}>
              <div className="flex min-w-px flex-1 flex-col whitespace-nowrap">
                <p className="t-label-m text-fg">{hop.name}</p>
                <p className="t-data-telemetry text-fg-secondary">{hop.detail}</p>
              </div>
              <StatusChip status={hop.status} />
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-lg">
          {PASSES_EVA.map((pass, i) => (
            <PassRow key={pass.id} pass={pass} signature style={stagger(i, group * 2)} />
          ))}
        </ul>
        <Card className="shrink-0 rounded-sm border-0">
          <CardHeader title="Live telemetry" meta="model · MEDA" delay={group * 3} />
          <StatList className="px-md py-sm">
            <StatRow label="Heart rate (simulated)" value={String(heartRate)} unit="bpm" />
            {view.telemetry.map((row) => (
              <StatRow key={row.label} {...row} />
            ))}
          </StatList>
        </Card>
        <section className="flex flex-col gap-xs xl:min-h-px xl:flex-1 xl:overflow-hidden">
          <h2 className="t-data-telemetry text-fg-muted">System log</h2>
          <ul className="flex flex-col gap-xs">
            {view.log.map((line, i) => (
              <LogLine key={`${line.time}-${line.message}`} {...line} style={stagger(i, group * 3 + headerDelay())} />
            ))}
          </ul>
        </section>
      </aside>
      </ScrollArea>
    </div>
  );
}
