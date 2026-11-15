import { useMemo, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ChecklistCard } from "@/components/marswalk/checklist";
import { Fit } from "@/components/marswalk/fit";
import {
  MapDim,
  OrthoBasemap,
  RouteLine,
  RouteOverlay,
  WaypointDot,
  WaypointMarker,
} from "@/components/marswalk/map";
import { LogLine, MapTag, MetricTile, ScreenHeading, StatusChip, type LogLevel } from "@/components/marswalk/primitives";
import { DEBRIEF, POST_EVA } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { calibrateKSuit, simulatePlayback, SIM } from "@/engine";
import { ORTHO } from "@/sim/load";
import { MissionGate } from "@/sim/controls";
import { useMission } from "@/sim/mission";
import { arrivalIndices, debriefLegs, fmtHM, fmtLmst, MARS_HOUR_MIN, planView } from "@/sim/view";

/** 07 · Debrief (Post-EVA): planned vs walked, outcome, samples, events. */
export function DebriefScreen() {
  return (
    <MissionGate>
      <DebriefLoaded />
    </MissionGate>
  );
}

const MAP_BOX = { x0: 60, y0: 60, x1: 760, y1: 400 };

/** Tailwind `lg`: from here up the panels sit in one resizable frame; below it they stack as cards. */
const WIDE = "(min-width: 1024px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

/** A Card flattened into a resizable panel: no rounding or border of its own, the handles separate it. */
const PANEL = "size-full min-h-0 min-w-0 rounded-none border-0";

function DebriefLoaded() {
  const { done, toggle } = useStore();
  const group = motionMs("stagger-group");
  const tick = motionMs("tick");
  const { data, result, ev, settings, update } = useMission();
  const wide = useWide();
  const view = useMemo(() => planView(data!, result!, ev!, MAP_BOX), [data, result, ev]);
  const legs = useMemo(() => (ev?.prof ? debriefLegs(ev, result!.s) : []), [ev, result]);
  // No suit telemetry exists: "measured" is the engine's seeded playback (hidden k_suit, per-leg noise), labelled as such.
  const rows = useMemo(() => simulatePlayback(legs, SIM, settings.kSuit), [legs, settings.kSuit]);
  if (!ev?.prof || !ev.end || !rows.length) return <p role="alert" className="p-xl t-body-m text-danger">No route to debrief: {ev?.error}</p>;
  const s = result!.s, end = ev.end;
  const sum = (k: "walkO2L" | "measWalkO2L" | "stopO2L" | "measStopO2L" | "walkMin" | "measWalkMin") => rows.reduce((t, r) => t + r[k], 0);
  const measO2 = sum("measWalkO2L") + sum("measStopO2L");
  const measMin = sum("measWalkMin") + rows.reduce((t, r) => t + r.stopMin, 0);
  const kCal = calibrateKSuit(rows, settings.kSuit);
  const arrivals = arrivalIndices(ev);
  const clock = (t: number) => fmtLmst(result!.env.startLmst + t / MARS_HOUR_MIN);
  const events: { time: string; level: LogLevel; message: string }[] = [
    { time: clock(0), level: "info", message: `Egress · ${view.waypoints[0]?.name ?? "start"}` },
    ...arrivals.slice(1).map((pi, k) => ({
      time: clock(ev.prof![pi].t - (ev.prof![pi].dwell ?? 0)),
      level: "info" as LogLevel,
      message: `${k === arrivals.length - 2 ? "Ingress" : `Arrived WP${k + 2}`} · ${(ev.prof![pi].dist / 1000).toFixed(2)} km`,
    })),
    ...ev.cautions.map((c) => ({ time: "plan", level: "warn" as LogLevel, message: c })),
  ];

  const tiles = [
    { label: "Distance", value: (end.dist / 1000).toFixed(2), unit: "km", sub: "planned (DTM route)" },
    { label: "Duration", value: fmtHM(measMin), unit: "h", sub: `simulated · plan ${fmtHM(end.t)} · cap ${fmtHM(s.evaLimitMin)}` },
    {
      label: "Oxygen at return",
      value: ((100 * (s.o2CapacityL - measO2)) / s.o2CapacityL).toFixed(0),
      unit: "%",
      sub: `simulated · plan ${((100 * (s.o2CapacityL - end.o2)) / s.o2CapacityL).toFixed(0)} %`,
    },
  ];
  const tilesB = [
    { label: "EVA dose", value: end.dose.toFixed(3), unit: "mSv", sub: "modelled · GCR, quiet sun" },
    { label: "Calibrated k_suit", value: kCal.toFixed(3), unit: "", sub: `now ${settings.kSuit.toFixed(3)}` },
  ];

  const map = (className?: string, fitClassName?: string) => (
    <Card className={className}>
      <CardHeader title="Planned route" meta="no walked track recorded (no suit positioning)" />
      <Fit width={818} height={452} className={cn("w-full bg-canvas", fitClassName)}>
        <OrthoBasemap src={ORTHO} {...view.proj.basemap} />
        <MapDim opacity={0.35} />
        <RouteOverlay width={818} height={452}>
          <RouteLine points={view.route} variant="walked" delay={headerDelay()} />
          {view.caution.map((seg, i) => (
            <RouteLine key={i} points={seg} variant="blocked" />
          ))}
        </RouteOverlay>
        {view.waypoints.slice(0, -1).map((m, i) => (
          <WaypointMarker key={m.id} label={m.id} x={m.at[0]} y={m.at[1]} delay={headerDelay() + i * tick * 2} />
        ))}
        <MapTag className="absolute" style={{ left: 16, top: 16 }}>
          {`${settings.mode} route · ${result!.policy.label}`}
        </MapTag>
      </Fit>
    </Card>
  );

  const o2Body = (
    <>
      <table className="w-full t-data-telemetry">
        <thead className="text-fg-muted">
          <tr>
            <th className="px-md py-xs text-left font-normal">Leg</th>
            <th className="px-sm py-xs text-right font-normal">Pred L</th>
            <th className="px-sm py-xs text-right font-normal">Meas* L</th>
            <th className="px-md py-xs text-right font-normal">Min</th>
          </tr>
        </thead>
        <tbody className="text-fg">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line-subtle">
              <td className="px-md py-xs">{`WP${i + 1}→${i === rows.length - 1 ? "WP1" : `WP${i + 2}`}`}</td>
              <td className="px-sm py-xs text-right">{r.walkO2L.toFixed(1)}</td>
              <td className="px-sm py-xs text-right">{r.measWalkO2L.toFixed(1)}</td>
              <td className="px-md py-xs text-right">{r.walkMin.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-md py-sm t-body-s text-fg-secondary">
        *Simulated playback: no suit telemetry exists. Seeded generator, hidden k_suit {SIM.trueKSuit}, ±{SIM.walkNoise * 100} % per leg.
      </p>
      <div className="px-md pb-md">
        <Button className="w-full" onClick={() => update({ kSuit: Number(kCal.toFixed(3)) })}>
          Apply k_suit {kCal.toFixed(3)} to the next plan
        </Button>
      </div>
    </>
  );
  const o2 = (className?: string, scroll = false) => (
    <Card className={className}>
      <CardHeader title="Walking O₂ per leg" meta="predicted vs simulated*" />
      {scroll ? <div className="min-h-0 flex-1 overflow-y-auto">{o2Body}</div> : o2Body}
    </Card>
  );

  const samples = (className?: string) => (
    <Card className={className}>
      <CardHeader title="Samples" meta={`${DEBRIEF.samples.length} bagged · synthetic`} delay={group * 2} />
      <ul className="flex min-h-0 flex-col gap-xs overflow-y-auto p-sm">
        {DEBRIEF.samples.map((sample, i) => (
          <li
            key={sample.id}
            className="mw-flash-in flex items-center gap-md border-b border-line-subtle px-md py-sm"
            style={stagger(i, group * 2 + headerDelay())}
          >
            <WaypointDot size={14} />
            <div className="flex min-w-px flex-1 flex-col gap-xs">
              <p className="truncate t-label-m text-fg">
                {sample.id} · {sample.name}
              </p>
              <p className="truncate t-data-telemetry text-fg-secondary">{sample.detail}</p>
            </div>
            <StatusChip status={sample.status} />
          </li>
        ))}
      </ul>
    </Card>
  );

  const eventLog = (className?: string) => (
    <Card className={className}>
      <CardHeader title="Events" meta={`${events.length} from the plan`} delay={group * 3} />
      <ul className="flex min-h-0 flex-col gap-xs overflow-y-auto p-sm">
        {events.map((event, i) => (
          <LogLine key={`${event.time}-${i}`} {...event} style={stagger(i, group * 3 + headerDelay())} />
        ))}
      </ul>
    </Card>
  );

  const checklist = (className?: string) => (
    <ChecklistCard
      title="Post-EVA checklist"
      entries={POST_EVA.slice(0, 4)}
      done={done["post-debrief"]}
      current
      signature
      showProgress={false}
      onToggle={(id) => toggle("post-debrief", id)}
      className={className}
      listClassName="p-sm"
      delay={group * 4}
    />
  );

  const heading = (
    <ScreenHeading
      inline
      title="EVA debrief · simulated playback"
      sub={`${clock(0)} → ${clock(end.t)} LMST · terrain real (HiRISE) · O₂ and dose modelled · "measured" values simulated`}
    />
  );

  if (wide) {
    // shadcn Resizable: one bordered frame, flat panels, hairline handles. Default sizes keep the old card proportions.
    return (
      <div className="flex h-full min-h-[760px] flex-col gap-xl p-xl">
        {heading}
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-line-subtle bg-panel">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel id="debrief-top" defaultSize="59%" minSize={240}>
              <ResizablePanelGroup orientation="horizontal">
                <ResizablePanel id="debrief-map" defaultSize="62%" minSize="35%">
                  {map(PANEL, "min-h-0 flex-1")}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="debrief-outcome" defaultSize="38%" minSize="24%">
                  <ResizablePanelGroup orientation="vertical">
                    <ResizablePanel id="debrief-metrics" defaultSize="38%" minSize={96}>
                      <section aria-label="Outcome" className="size-full overflow-y-auto">
                        <div className="grid grid-cols-6 gap-px border-b border-line-subtle bg-line-subtle">
                          {tiles.map((tile, i) => (
                            <MetricTile key={tile.label} {...tile} size="l" variant="grid" className="col-span-2 min-w-0" style={stagger(i, group)} />
                          ))}
                          {tilesB.map((tile, i) => (
                            <MetricTile key={tile.label} {...tile} variant="grid" className="col-span-3 min-w-0" style={stagger(i + 3, group)} />
                          ))}
                        </div>
                      </section>
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel id="debrief-o2" defaultSize="62%" minSize={120}>
                      {o2(PANEL, true)}
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="debrief-bottom" defaultSize="41%" minSize={160}>
              <ResizablePanelGroup orientation="horizontal">
                <ResizablePanel id="debrief-samples" defaultSize="33%" minSize="18%">
                  {samples(PANEL)}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="debrief-events" defaultSize="36%" minSize="18%">
                  {eventLog(PANEL)}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="debrief-checklist" defaultSize="31%" minSize="18%">
                  {checklist(PANEL)}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    );
  }

  // Below lg the panels stack as cards in a scrolling column.
  return (
    <div className="flex min-h-full flex-col gap-lg p-lg md:gap-xl md:p-xl">
      {heading}
      <div className="flex flex-col gap-lg md:gap-xl">
        {map(undefined, "aspect-[818/452]")}
        <div className="grid gap-md sm:grid-cols-3">
          {tiles.map((tile, i) => (
            <MetricTile key={tile.label} {...tile} size="l" className="w-full" style={stagger(i, group)} />
          ))}
          <div className="flex w-full items-stretch gap-md sm:col-span-3">
            {tilesB.map((tile, i) => (
              <MetricTile key={tile.label} {...tile} className="min-w-px flex-1" style={stagger(i + 3, group)} />
            ))}
          </div>
          {o2("w-full shrink-0 sm:col-span-3")}
        </div>
      </div>
      <div className="grid gap-lg md:grid-cols-2 md:gap-xl">
        {samples("max-h-[420px] min-h-0")}
        {eventLog("max-h-[420px] min-h-0")}
        {checklist("min-h-0 md:col-span-2")}
      </div>
    </div>
  );
}
