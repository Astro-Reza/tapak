import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Trace: a step-by-step list in the style of shadcn's Trace
 * (Trace > TraceCollapsible > TraceLine > TraceIcon / TraceTitle / TraceDescription).
 * Steps reveal one by one using the existing stepped flash-in; no new easing.
 */
export function Trace({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={cn("flex flex-col", className)}>{children}</ol>;
}

export function TraceStep({
  children,
  index,
  stagger,
}: {
  children: ReactNode;
  index: number;
  stagger: number;
}) {
  return (
    <li
      className="mw-flash-in relative"
      style={{ "--i": index, "--motion-stagger-item": `${stagger}ms` } as CSSProperties}
    >
      {children}
    </li>
  );
}

export function TraceLine({
  icon,
  title,
  description,
  trailing,
  expanded,
  onClick,
  pressed,
  disabled,
  first,
  last,
}: {
  first?: boolean;
  last?: boolean;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /** when set, the row is a collapsible trigger */
  expanded?: boolean;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-expanded={expanded}
      aria-pressed={expanded === undefined ? pressed : undefined}
      onClick={onClick}
      className="relative flex w-full items-center gap-md px-md py-sm text-left"
    >
      {/* Connector: 2 px wide, centred on the icon cell (12 px padding + 9 px = 21 px),
          running from the middle of this row's dot to the middle of the next one. */}
      {first ? null : (
        <span aria-hidden="true" className="absolute top-0 left-[20px] h-1/2 w-[2px] bg-line-subtle" />
      )}
      {last ? null : (
        <span aria-hidden="true" className="absolute bottom-0 left-[20px] h-1/2 w-[2px] bg-line-subtle" />
      )}
      <span className="relative flex w-[18px] shrink-0 justify-center">{icon}</span>
      <span className="flex min-w-px flex-1 flex-col gap-xs">
        <span className={cn("truncate t-label-m", pressed || expanded ? "text-fg" : "text-fg")}>{title}</span>
        {description ? <span className="t-data-telemetry text-fg-secondary">{description}</span> : null}
      </span>
      {trailing}
      {expanded === undefined ? null : (
        <span aria-hidden="true" className="t-data-telemetry text-fg-muted">
          {expanded ? "−" : "+"}
        </span>
      )}
    </button>
  );
}

/** Detail under a step. Appears at once (no easing), muted text. */
export function TraceContent({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <div
      className={cn(
        "mw-flash-in ml-[20px] border-l-2 py-xs pr-md pl-[22px] t-body-s text-fg-secondary",
        last ? "border-transparent" : "border-line-subtle",
      )}
    >
      {children}
    </div>
  );
}
