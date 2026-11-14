import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMission } from "./mission";
import { fmtHM, fmtLmst, MARS_HOUR_MIN } from "./view";

const tone = { GO: "text-safe border-safe", CAUTION: "text-caution border-caution", "NO-GO": "text-danger border-danger" } as const;

/** Hub mission status from the engine: verdict, window, consumables, rules in force. */
export function MissionStatusStrip({ className }: { className?: string }) {
  const { ev, result, settings, busy, error } = useMission();
  if (error) return <p role="alert" className={cn("t-body-s text-danger", className)}>{error}</p>;
  if (!ev || !result) return <p role="status" className={cn("t-body-s text-fg-secondary", className)}>Planning the EVA…</p>;
  const s = result.s, end = ev.end;
  const items = end
    ? [
        ["Window", `${fmtLmst(settings.startLmst)} → ${fmtLmst(settings.startLmst + end.t / MARS_HOUR_MIN)} LMST`],
        ["Duration", `${fmtHM(end.t)} of ${fmtHM(s.evaLimitMin)}`],
        ["Distance", `${(end.dist / 1000).toFixed(2)} km`],
        ["O₂ at return (model)", `${((100 * (s.o2CapacityL - end.o2)) / s.o2CapacityL).toFixed(0)} %`],
        ["Walk-back", `${ev.wb && ev.wb.minMarginL >= 0 ? "+" : ""}${ev.wb?.minMarginL.toFixed(0)} L`],
        ["Rules", result.policy.label],
      ]
    : [["Route", ev.error ?? "none"]];
  return (
    <div
      role="status"
      aria-busy={busy}
      className={cn("flex flex-wrap items-center gap-x-lg gap-y-xs rounded-sm border-l-4 bg-panel px-md py-xs", tone[ev.verdict], className)}
    >
      <strong className={cn("t-label-m", tone[ev.verdict])}>{ev.verdict}</strong>
      <span className="t-body-s text-fg-secondary">{settings.mode} route</span>
      {items.map(([k, v]) => (
        <span key={k} className="flex items-baseline gap-xs whitespace-nowrap">
          <span className="t-data-telemetry text-fg-muted">{k}</span>
          <span className="t-data-coordinate text-fg">{v}</span>
        </span>
      ))}
      <Button variant="secondary" size="control" className="ml-auto" onClick={() => (window.location.hash = "/plan")}>
        Open plan
      </Button>
    </div>
  );
}
