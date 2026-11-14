import { type CSSProperties } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { headerDelay, stagger } from "@/lib/motion";
import type { ChecklistEntry } from "@/data/mission";
import { Brackets } from "./primitives";

/**
 * 56 px checklist row (Figma "Checklist Item"): Done, Active or Pending.
 * Active is the first open step and carries the signature brackets when
 * `signature` is set (one per screen).
 */
export function ChecklistItem({
  entry,
  done,
  active,
  signature = false,
  onToggle,
  style,
}: {
  entry: ChecklistEntry;
  done: boolean;
  active: boolean;
  signature?: boolean;
  onToggle: () => void;
  style?: CSSProperties;
}) {
  const id = `check-${entry.id}`;
  return (
    <li
      className={cn(
        "mw-flash-in relative flex h-glove items-center gap-md rounded-sm px-md",
        active && "bg-inset",
      )}
      style={style}
    >
      <Checkbox id={id} checked={done} active={active} onCheckedChange={onToggle} />
      <label
        htmlFor={id}
        className={cn(
          "flex h-full min-w-px flex-1 cursor-pointer items-center t-body-m",
          done ? "text-fg-secondary" : "text-fg",
        )}
      >
        {entry.text}
      </label>
      <span className="shrink-0 whitespace-nowrap t-data-telemetry text-fg-muted">{entry.time}</span>
      {active && signature ? <Brackets key={entry.id} /> : null}
    </li>
  );
}

export function ChecklistCard({
  title,
  entries,
  done,
  metaSuffix,
  signature = false,
  current = false,
  showProgress = true,
  onToggle,
  className,
  listClassName,
  delay = 0,
}: {
  title: string;
  entries: ChecklistEntry[];
  done: ReadonlySet<string>;
  metaSuffix?: string;
  signature?: boolean;
  /** the list in progress: its first open step is the active one */
  current?: boolean;
  showProgress?: boolean;
  onToggle: (id: string) => void;
  className?: string;
  listClassName?: string;
  delay?: number;
}) {
  const count = entries.filter((e) => done.has(e.id)).length;
  const activeId = current ? entries.find((e) => !done.has(e.id))?.id : undefined;
  const meta = `${count}/${entries.length}${count > 0 ? " done" : ""}${metaSuffix ? ` · ${metaSuffix}` : ""}`;

  return (
    <Card className={className}>
      <CardHeader title={title} meta={meta} delay={delay} />
      {showProgress ? (
        <div className="flex shrink-0 px-lg py-md">
          <div
            role="progressbar"
            aria-label={`${title} progress`}
            aria-valuemin={0}
            aria-valuemax={entries.length}
            aria-valuenow={count}
            className="h-xs min-w-px flex-1 overflow-hidden rounded-pill bg-inset"
          >
            {/* Neutral fill: the accent is never used on progress bars */}
            <div
              className="h-full rounded-pill bg-fg"
              style={{ width: `${(count / entries.length) * 100}%` }}
            />
          </div>
        </div>
      ) : null}
      <ul className={cn("flex flex-col gap-xs px-sm", listClassName)}>
        {entries.map((entry, i) => (
          <ChecklistItem
            key={entry.id}
            entry={entry}
            done={done.has(entry.id)}
            active={entry.id === activeId}
            signature={signature}
            onToggle={() => onToggle(entry.id)}
            style={stagger(i, delay + headerDelay())}
          />
        ))}
      </ul>
    </Card>
  );
}
