import { CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HOLD_CRITERIA, type HoldCriterion, type HoldStatus } from "@/data/eva-checklist";
import { headerDelay, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * How firm each limit is. Words only: status colors are reserved for
 * live safety state, and a limit's provenance is not one.
 */
const STATUS: Record<HoldStatus, { label: string; heading: string }> = {
  sourced: { label: "Sourced", heading: "Sourced limits" },
  margin: { label: "Needs margin", heading: "Sourced, margin is a mission rule" },
  rule: { label: "Mission rule", heading: "Mission rules" },
};
const ORDER: HoldStatus[] = ["sourced", "margin", "rule"];

/**
 * Hold and abort criteria as a panel body (no card frame of its own).
 * Reference only: nothing here is ticked.
 */
export function HoldPanel({
  criteria = HOLD_CRITERIA,
  className,
  delay = 0,
}: {
  criteria?: HoldCriterion[];
  className?: string;
  delay?: number;
}) {
  const groups = ORDER.map((status) => ({ status, items: criteria.filter((c) => c.status === status) })).filter(
    (group) => group.items.length,
  );
  const meta = groups.map((group) => `${group.items.length} ${STATUS[group.status].label.toLowerCase()}`).join(" · ");
  let row = 0;

  return (
    <section className={cn("flex size-full min-h-0 min-w-0 flex-col", className)}>
      <CardHeader title="Hold and abort criteria" meta={`${criteria.length} limits`} delay={delay} />
      <p className="shrink-0 truncate px-lg py-md t-data-telemetry text-fg-muted">{meta}</p>

      <ScrollArea className="min-h-0 flex-1" aria-label="Hold and abort criteria">
        {groups.map((group) => (
          <section key={group.status} aria-label={STATUS[group.status].heading}>
            <header className="sticky top-0 z-10 flex items-baseline gap-sm border-y border-line-subtle bg-canvas px-lg py-sm">
              <h3 className="min-w-px flex-1 truncate t-body-s text-fg">{STATUS[group.status].heading}</h3>
              <p className="shrink-0 t-data-telemetry text-fg-muted">{group.items.length}</p>
            </header>
            <ul className="flex flex-col gap-xs p-sm">
              {group.items.map((criterion) => (
                <li
                  key={criterion.id}
                  className="mw-flash-in flex min-h-glove items-start gap-md rounded-sm px-md py-md"
                  style={stagger(row++, delay + headerDelay())}
                  title={criterion.source}
                >
                  <div className="flex min-w-px flex-1 flex-col gap-xs">
                    <span className="t-body-m text-fg">{criterion.title}</span>
                    <span className="t-body-s text-fg-secondary">{criterion.limit}</span>
                  </div>
                  <span className="shrink-0 whitespace-nowrap pt-[2px] t-data-telemetry text-fg-muted">
                    {criterion.codes.join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </ScrollArea>
    </section>
  );
}
