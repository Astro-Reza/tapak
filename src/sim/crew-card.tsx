import { useMemo } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { activityTimeline, CREW, crewStatus, metabolicBudget, type Provenance, type Reading } from "@/engine";
import { cn } from "@/lib/utils";
import { useMission } from "./mission";

/** Provenance tag tone: only what is measured reads bright; unavailable reads muted. No status colours (not alarms). */
const TONE: Record<Provenance, string> = {
  MEASURED: "text-fg border-line-strong",
  DERIVED: "text-fg-secondary border-line",
  MODELLED: "text-fg-secondary border-line",
  ASSUMED: "text-fg-secondary border-line",
  SIMULATED: "text-fg-secondary border-line",
  UNAVAILABLE: "text-fg-muted border-line-subtle",
};

function Row({ r }: { r: Reading }) {
  return (
    <li className="flex flex-col gap-xs border-b border-line-subtle py-sm last:border-b-0">
      <div className="flex items-baseline gap-sm">
        <span className="min-w-px flex-1 t-body-s text-fg-secondary">{r.label}</span>
        <span className={cn("shrink-0 whitespace-nowrap t-data-coordinate", r.value == null ? "text-fg-muted" : "text-fg")}>
          {r.value ?? "—"}
        </span>
        <span className="w-[84px] shrink-0 t-label-unit text-fg-secondary">{r.unit}</span>
      </div>
      <span className={cn("self-start rounded-sm border px-xs t-data-telemetry", TONE[r.provenance])}>
        {r.provenance}
        {r.confidence === "experimental" ? " · EXPERIMENTAL" : ""}
      </span>
      {r.note ? <p className="t-data-telemetry text-fg-muted">{r.note}</p> : null}
    </li>
  );
}

/**
 * Crew physiology for EVA-1 at the EVA clock: NASA-grounded models on the simulated walk.
 * No live suit telemetry exists, so nothing is MEASURED; sources are in docs/PHASE3_NASA_RESEARCH.md.
 */
export function CrewPhysiologyCard({ delay = 0 }: { delay?: number }) {
  const { ev, result, evaT } = useMission();
  const crew = CREW[0];
  const budgets = useMemo(() => {
    if (!ev?.prof || !result) return null;
    const segs = activityTimeline(ev.prof, result.s);
    return { engine: metabolicBudget(segs, crew, "engine"), analog: metabolicBudget(segs, crew, "analog-stops") };
  }, [ev, result, crew]);
  if (!budgets || !result) return null;
  const { readings } = crewStatus({ budget: budgets.engine, T: evaT, crew, tankL: result.s.o2CapacityL, analog: budgets.analog });
  return (
    <Card className="shrink-0 rounded-sm border-0">
      <CardHeader title="Crew physiology" meta={`${crew.label} · no live suit sensors`} delay={delay} />
      <ul className="flex flex-col px-md py-xs" aria-label="Crew physiology readings with provenance">
        {readings.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </ul>
    </Card>
  );
}
