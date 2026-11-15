import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDecodedText } from "@/lib/motion";

/* ---------- Selection brackets (the signature, pattern 17) ---------- */

/** Four L corners that mark the one live thing on a screen. One per screen. */
export function Brackets({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mw-brackets", className)}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/* ---------- Status chip ---------- */

export type Status = "safe" | "caution" | "danger" | "offline";

const statusWord: Record<Status, string> = {
  safe: "Safe",
  caution: "Caution",
  danger: "Danger",
  offline: "Offline",
};
const statusDot: Record<Status, string> = {
  safe: "bg-safe",
  caution: "bg-caution",
  danger: "bg-danger",
  offline: "bg-fg-muted",
};

/** Pill status indicator. The dot carries the color and is always paired with the word. */
export function StatusChip({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant="status" className={className}>
      <span aria-hidden="true" className={cn("size-sm shrink-0 rounded-pill", statusDot[status])} />
      {statusWord[status]}
    </Badge>
  );
}

/* ---------- Map tag ---------- */

export function MapTag({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Badge variant="tag" className={className} style={style}>
      {children}
    </Badge>
  );
}

/* ---------- Readout ticker (pattern 9) ---------- */

/** Returns a key that changes when `value` changes after the first render. */
function useChangeKey(value: string): number {
  const previous = useRef(value);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setKey((k) => k + 1);
    }
  }, [value]);
  return key;
}

/* ---------- Stat row ---------- */

/** Label · value · unit. Never a bare number. The value never rolls or counts. */
export function StatRow({
  label,
  value,
  unit,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  className?: string;
}) {
  const changeKey = useChangeKey(value);
  return (
    <div className={cn("flex items-baseline gap-sm py-xs", className)}>
      <dt className="min-w-px flex-1 t-body-s text-fg-secondary">{label}</dt>
      <dd className="relative shrink-0 whitespace-nowrap t-data-coordinate text-fg">
        {value}
        {changeKey > 0 ? <span key={changeKey} className="mw-sweep" /> : null}
      </dd>
      <dd className="shrink-0 whitespace-nowrap t-label-unit text-fg-secondary">{unit ?? ""}</dd>
    </div>
  );
}

export function StatList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("flex flex-col", className)}>{children}</dl>;
}

/* ---------- Metric tile ---------- */

export function MetricTile({
  label,
  value,
  unit,
  sub,
  size = "s",
  variant = "card",
  className,
  style,
}: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  size?: "s" | "l";
  variant?: "card" | "grid";
  className?: string;
  style?: CSSProperties;
}) {
  const changeKey = useChangeKey(value);
  return (
    <div
      className={cn(
        "mw-flash-in flex flex-col items-start gap-xs bg-panel p-md",
        variant === "card" && "rounded-sm border border-line-subtle",
        className,
      )}
      style={style}
    >
      <p className="whitespace-nowrap t-data-telemetry text-fg-secondary">{label}</p>
      <p className="relative flex items-baseline gap-xs whitespace-nowrap">
        <span className={cn("text-fg", size === "l" ? "t-display-metric" : "t-heading-l")}>{value}</span>
        <span className="t-label-unit text-fg-secondary">{unit}</span>
        {changeKey > 0 ? <span key={changeKey} className="mw-sweep" /> : null}
      </p>
      <p className="t-data-telemetry text-fg-muted">{sub}</p>
    </div>
  );
}

/* ---------- Screen heading with text decode (pattern 8) ---------- */

/** Heading that resolves from scrambled glyphs on first appearance. Labels only. */
export function DecodeText({ text, ticks = 6 }: { text: string; ticks?: number }) {
  const decoded = useDecodedText(text, ticks);
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className={decoded === text ? undefined : "invisible"}>{text}</span>
      {decoded === text ? null : (
        <span aria-hidden="true" className="absolute inset-0 overflow-hidden">
          {decoded}
        </span>
      )}
    </span>
  );
}

export function ScreenHeading({
  title,
  sub,
  inline = false,
  className,
}: {
  title: string;
  sub: string;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0",
        inline ? "flex-wrap items-baseline gap-x-lg gap-y-xs" : "flex-col items-start gap-xs",
        className,
      )}
    >
      <h1 className="t-heading-m text-fg">
        <DecodeText text={title} />
      </h1>
      <p className="mw-text-in t-body-s text-fg-secondary" style={{ "--i": 6 } as CSSProperties}>
        {sub}
      </p>
    </div>
  );
}

/* ---------- Log line ---------- */

export type LogLevel = "info" | "warn" | "alert";
const levelTag: Record<LogLevel, { tag: string; className: string }> = {
  info: { tag: "INF", className: "text-fg-secondary" },
  warn: { tag: "WRN", className: "text-caution" },
  alert: { tag: "ALR", className: "text-danger" },
};

/** System log row. The level always pairs color with a text tag. */
export function LogLine({
  time,
  level,
  message,
  style,
}: {
  time: string;
  level: LogLevel;
  message: string;
  style?: CSSProperties;
}) {
  return (
    <li className="mw-text-in flex items-start gap-sm t-data-telemetry" style={style}>
      <time className="shrink-0 whitespace-nowrap text-fg-muted">{time}</time>
      <span className={cn("shrink-0 whitespace-nowrap", levelTag[level].className)}>
        {levelTag[level].tag}
      </span>
      <span className="min-w-px flex-1 text-fg">{message}</span>
    </li>
  );
}

/* ---------- Timeline bar ---------- */

export type TimelineKind = "task" | "comms" | "hazard" | "rover";
const timelineStyle: Record<TimelineKind, string> = {
  task: "border border-line-subtle bg-raised text-fg",
  comms: "bg-link-low text-link-high",
  hazard: "bg-caution-tint text-caution",
  rover: "border border-dashed border-line text-fg-secondary",
};

/** Gantt bar. Position and width are set by the caller from start and duration. */
export function TimelineBar({
  kind,
  label,
  style,
  className,
}: {
  kind: TimelineKind;
  label: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mw-flash-in absolute top-0 flex h-2xl items-center gap-xs overflow-hidden rounded-sm px-sm t-data-telemetry whitespace-nowrap",
        timelineStyle[kind],
        className,
      )}
      style={style}
    >
      {label}
    </div>
  );
}
