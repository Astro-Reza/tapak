import { useMemo, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChecklistItem } from "@/components/marswalk/checklist";
import { Fit } from "@/components/marswalk/fit";
import {
  MapDim,
  OrthoBasemap,
  RouteLine,
  RouteOverlay,
  WaypointDot,
  WaypointMarker,
} from "@/components/marswalk/map";
import { LogLine, MapTag, MetricTile, StatusChip, type LogLevel } from "@/components/marswalk/primitives";
import { DEBRIEF, POST_EVA } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { calibrateKSuit, simulatePlayback, SIM } from "@/engine";
import { ORTHO } from "@/sim/load";
import { MissionGate } from "@/sim/controls";
import { useMission } from "@/sim/mission";
import { arrivalIndices, debriefLegs, fmtHM, fmtLmst, MARS_HOUR_MIN, planView } from "@/sim/view";

/** Panels stand clean on the page; only the resizable handles separate them. */
const CARD = "text-fg";

/** Tailwind `md`: below it the panels stack instead of sitting side by side. */
const WIDE = "(min-width: 768px)";
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

/** 07 · Debrief (Post-EVA): planned vs walked, outcome, samples, events. */
export function DebriefScreen() {
  return (
    <MissionGate>
      <DebriefLoaded />
    </MissionGate>
  );
}

const MAP_BOX = { x0: 60, y0: 60, x1: 760, y1: 400 };

function DebriefLoaded() {
  const wide = useWide();
  const { done, toggle } = useStore();
  const group = motionMs("stagger-group");
  const tick = motionMs("tick");
  const { data, result, ev, settings, update } = useMission();
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

  const postEvaEntries = POST_EVA.slice(0, 4);
  const postEvaDone = done["post-debrief"];
  const postEvaCount = postEvaEntries.filter((e) => postEvaDone.has(e.id)).length;
  const postEvaActiveId = postEvaEntries.find((e) => !postEvaDone.has(e.id))?.id;
  const postEvaMeta = `${postEvaCount}/${postEvaEntries.length}${postEvaCount > 0 ? " done" : ""}`;

  return (
    <div className="flex size-full min-h-0 overflow-hidden">
      <ResizablePanelGroup orientation="vertical" className="size-full min-h-0">
        <ResizablePanel id="debrief-top" defaultSize="58%" minSize={wide ? 200 : 260}>
          <ResizablePanelGroup key={wide ? "top-row" : "top-stack"} orientation={wide ? "horizontal" : "vertical"}>
            {/* Planned route panel */}
            <ResizablePanel id="debrief-map" defaultSize="62%" minSize="30%">
              <section className={cn("flex size-full min-h-0 flex-col", CARD)}>
                <CardHeader
                  title="Planned route"
                  meta="no walked track recorded (no suit positioning)"
                  delay={group}
                />
                <div className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
                  <Fit
                    width={818}
                    height={452}
                    className="size-full bg-canvas"
                  >
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
                </div>
              </section>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Walking O2 & Telemetry panel */}
            <ResizablePanel id="debrief-telemetry" defaultSize="38%" minSize="25%">
              <section className={cn("flex size-full min-h-0 flex-col", CARD)}>
                <CardHeader
                  title="Walking O₂ & telemetry"
                  meta="predicted vs simulated*"
                  delay={group}
                />
                <ScrollArea className="min-h-0 flex-1" aria-label="Walking O₂ and telemetry">
                  <div className="flex flex-col gap-md p-md">
                    <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
                      {[
                        { label: "Distance", value: (end.dist / 1000).toFixed(2), unit: "km", sub: "planned (DTM route)" },
                        { label: "Duration", value: fmtHM(measMin), unit: "h", sub: `simulated · plan ${fmtHM(end.t)} · cap ${fmtHM(s.evaLimitMin)}` },
                        {
                          label: "Oxygen at return",
                          value: ((100 * (s.o2CapacityL - measO2)) / s.o2CapacityL).toFixed(0),
                          unit: "%",
                          sub: `simulated · plan ${((100 * (s.o2CapacityL - end.o2)) / s.o2CapacityL).toFixed(0)} %`,
                        },
                      ].map((tile, i) => (
                        <MetricTile key={tile.label} {...tile} size="l" className="w-full" style={stagger(i, group)} />
                      ))}
                    </div>
                    <div className="flex w-full items-stretch gap-md">
                      <MetricTile label="EVA dose" value={end.dose.toFixed(3)} unit="mSv" sub="modelled · GCR, quiet sun" className="min-w-px flex-1" style={stagger(3, group)} />
                      <MetricTile label="Calibrated k_suit" value={kCal.toFixed(3)} unit="" sub={`now ${settings.kSuit.toFixed(3)}`} className="min-w-px flex-1" style={stagger(4, group)} />
                    </div>

                    <div className="flex flex-col rounded-sm border border-line-subtle bg-inset/20 overflow-hidden">
                      <div className="flex items-center justify-between border-b border-line-subtle px-md py-sm">
                        <span className="t-label-s text-fg">Walking O₂ per leg</span>
                        <span className="t-data-telemetry text-fg-muted">predicted vs simulated*</span>
                      </div>
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
                    </div>
                  </div>
                </ScrollArea>
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel id="debrief-bottom" defaultSize="42%" minSize={wide ? 160 : 200}>
          <ResizablePanelGroup key={wide ? "bottom-row" : "bottom-stack"} orientation={wide ? "horizontal" : "vertical"}>
            {/* Samples panel */}
            <ResizablePanel id="debrief-samples" defaultSize="33%" minSize="15%">
              <section className={cn("flex size-full min-h-0 flex-col", CARD)}>
                <CardHeader title="Samples" meta={`${DEBRIEF.samples.length} bagged · synthetic`} delay={group * 2} />
                <ScrollArea className="min-h-0 flex-1" aria-label="Samples">
                  <ul className="flex flex-col gap-xs p-sm">
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
                </ScrollArea>
              </section>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Events panel */}
            <ResizablePanel id="debrief-events" defaultSize="34%" minSize="15%">
              <section className={cn("flex size-full min-h-0 flex-col", CARD)}>
                <CardHeader title="Events" meta={`${events.length} from the plan`} delay={group * 3} />
                <ScrollArea className="min-h-0 flex-1" aria-label="Events">
                  <ul className="flex flex-col gap-xs p-sm">
                    {events.map((event, i) => (
                      <LogLine key={`${event.time}-${i}`} {...event} style={stagger(i, group * 3 + headerDelay())} />
                    ))}
                  </ul>
                </ScrollArea>
              </section>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Post-EVA checklist panel */}
            <ResizablePanel id="debrief-checklist" defaultSize="33%" minSize="15%">
              <section className={cn("flex size-full min-h-0 flex-col", CARD)}>
                <CardHeader title="Post-EVA checklist" meta={postEvaMeta} delay={group * 4} />
                <ScrollArea className="min-h-0 flex-1" aria-label="Post-EVA checklist">
                  <ul className="flex flex-col gap-xs p-sm">
                    {postEvaEntries.map((entry, i) => (
                      <ChecklistItem
                        key={entry.id}
                        entry={entry}
                        done={postEvaDone.has(entry.id)}
                        active={entry.id === postEvaActiveId}
                        signature
                        onToggle={() => toggle("post-debrief", entry.id)}
                        style={stagger(i, group * 4 + headerDelay())}
                      />
                    ))}
                  </ul>
                </ScrollArea>
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
