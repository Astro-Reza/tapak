import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HazardAlert } from "@/components/marswalk/alerts";
import { LogLine, MetricTile, ScreenHeading, StatList, StatRow, type LogLevel } from "@/components/marswalk/primitives";
import { PLAN } from "@/data/mission";
import { MissionGate } from "@/sim/controls";
import { useMission } from "@/sim/mission";
import { evaView, fmtHM, planView } from "@/sim/view";
import { motionMs, stagger } from "@/lib/motion";
import { PlanScreenLoaded, ROUTE_BOX } from "./plan";

/** Four bars that drift on their own: 4 and 3 green, 2 yellow, 1 red. Simulated, not a measurement. */
function SignalBars({ seed }: { seed: number }) {
  const [level, setLevel] = useState(4 - (seed % 2));
  useEffect(() => {
    const id = window.setInterval(() => setLevel((v) => Math.max(1, Math.min(4, v + Math.floor(Math.random() * 3) - 1))), 1500 + seed * 400);
    return () => window.clearInterval(id);
  }, [seed]);
  const tone = level >= 3 ? "bg-safe" : level === 2 ? "bg-caution" : "bg-danger";
  return (
    <span role="img" aria-label={`Signal ${level} of 4`} className="flex h-[18px] shrink-0 items-end gap-[3px]">
      {[1, 2, 3, 4].map((b) => (
        <span key={b} className={`w-[4px] rounded-[1px] transition-colors ${b <= level ? tone : "bg-line-subtle"}`} style={{ height: 4 + b * 3.5 }} />
      ))}
    </span>
  );
}

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

const FEED: { level: LogLevel; message: string }[] = [
  { level: "info", message: "Tablet–HUD mesh heartbeat ok" },
  { level: "info", message: "Suit telemetry frame received" },
  { level: "info", message: "Pressure and temperature sampled" },
  { level: "warn", message: "Uplink margin dipped, retrying" },
  { level: "info", message: "Dose rate logged" },
  { level: "info", message: "Position fix updated" },
];

/** Simulated system log: a new line every 3 s, newest first. Not real events. */
function useSimulatedLog() {
  const [lines, setLines] = useState<{ time: string; level: LogLevel; message: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      const time = new Date().toLocaleTimeString("en-GB");
      setLines((v) => [{ time, ...FEED[n++ % FEED.length] }, ...v].slice(0, 8));
    }, 3000);
    return () => window.clearInterval(id);
  }, []);
  return lines;
}

export function EvaMapScreen() {
  return (
    <MissionGate>
      <EvaMapLoaded />
    </MissionGate>
  );
}

function EvaMapLoaded() {
  const heartRate = useSimulatedHeartRate(92);
  const live = useSimulatedLog();
  const group = motionMs("stagger-group");
  const { data, result, ev, evaT, setEvaT, playing, setPlaying } = useMission();
  // Plan's own fit, so the walk is drawn on the Plan map's projection
  const view = useMemo(() => {
    const proj = planView(data!, result!, ev!, ROUTE_BOX).proj;
    return evaView(data!, result!, ev!, evaT, ROUTE_BOX, proj);
  }, [data, result, ev, evaT]);
  if (!view || !ev?.end) return <p role="alert" className="p-xl t-body-m text-danger">No route: {ev?.error ?? "plan first"}</p>;
  const end = ev.end;
  const s = result!.s;

  return (
    <PlanScreenLoaded
      eva={{
        left: (
      <ScrollArea data-tour="eva-progress" className="shrink-0 bg-raised xl:w-rail" fill aria-label="EVA progress">
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
        <div className="-mx-lg grid grid-cols-2 gap-px border-y border-line-subtle bg-line-subtle sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-2">
          {view.tiles.map((tile, i) => (
            <MetricTile
              key={tile.label}
              {...tile}
              variant="grid"
              className="min-w-0 bg-raised"
              style={stagger(i, group)}
            />
          ))}
        </div>
        <Card className="-mx-lg shrink-0 rounded-none border-x-0 bg-raised">
          <CardHeader title="Prediction" meta="modelled" delay={group * 2} />
          <StatList className="px-md py-sm">
            {view.prediction.map((row) => (
              <StatRow key={row.label} {...row} />
            ))}
          </StatList>
        </Card>
      </aside>
      </ScrollArea>
        ),
        right: (
      <ScrollArea data-tour="eva-device" className="shrink-0 bg-raised xl:w-rail" fill aria-label="Connectivity">
      <aside className="flex flex-1 flex-col gap-lg px-lg py-xl">
        <div className="flex flex-col gap-xs">
          <div className="flex items-center gap-sm">
            <p className="min-w-px flex-1 t-label-m text-fg">Tablet — HUD</p>
            <SignalBars seed={0} />
          </div>
          {view.position ? <p className="t-data-telemetry text-fg-secondary">{`${view.position.lat} · ${view.position.lon}`}</p> : null}
        </div>
        <Card className="-mx-lg shrink-0 rounded-none border-x-0 bg-raised">
          <CardHeader title="Live telemetry" delay={group} />
          <StatList className="px-md py-sm">
            <StatRow label="Heart rate" value={String(heartRate)} unit="bpm" />
            {view.telemetry.map((row) => (
              <StatRow key={row.label} {...row} />
            ))}
          </StatList>
        </Card>
        <section className="flex flex-col gap-xs xl:min-h-px xl:flex-1 xl:overflow-hidden">
          <h2 className="t-data-telemetry text-fg-muted">System log</h2>
          <ul className="flex flex-col gap-xs">
            {[...live, ...view.log].slice(0, 8).map((line) => (
              <LogLine key={`${line.time}-${line.message}`} {...line} />
            ))}
          </ul>
        </section>
      </aside>
      </ScrollArea>
        ),
        overlay: (
          <div
            data-tour="hazard-card"
            className="xl:absolute xl:top-xl xl:left-xl xl:z-20 xl:w-[min(420px,calc(100%_-_32px))] pointer-events-auto"
          >
            <HazardAlert title={PLAN.hazard.title} body={PLAN.hazard.body} action={PLAN.hazard.action} />
          </div>
        ),
      }}
    />
  );
}
