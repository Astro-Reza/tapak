import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { stagger, motionMs } from "@/lib/motion";
import { Icon } from "./icons";

/**
 * Hazard alert. Complete and readable on frame one, with no build or stagger.
 * Emphasis follows: the danger border flashes off and on twice, then holds.
 */
export function HazardAlert({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "mw-hazard flex items-start gap-md rounded-sm border-2 border-danger bg-panel p-lg",
        className,
      )}
    >
      <span className="text-danger">
        <Icon name="warning" />
      </span>
      <div className="flex min-w-px flex-1 flex-col gap-xs">
        <p className="t-label-m text-fg">{title}</p>
        <p className="t-body-s text-fg-secondary">{body}</p>
        <p className="t-body-s text-fg">{action}</p>
      </div>
    </div>
  );
}

export type Verdict = "GO" | "CAUTION" | "NO-GO";
const verdictTone: Record<Verdict, { text: string; edge: string }> = {
  GO: { text: "text-safe", edge: "border-safe" },
  CAUTION: { text: "text-caution", edge: "border-caution" },
  "NO-GO": { text: "text-danger", edge: "border-danger" },
};

/**
 * Planner verdict (verdict stamp, pattern 13). A quiet panel with a 4 px status
 * edge. The word is visible from the first frame; the plate wipes in behind it
 * and the reasons follow as a staggered list. A planning aid, not a guarantee.
 */
export function VerdictBanner({
  verdict,
  reasons,
  className,
}: {
  verdict: Verdict;
  reasons: readonly string[];
  className?: string;
}) {
  const tone = verdictTone[verdict];
  const afterWipe = motionMs("duration-wipe");
  return (
    <div role="status" className={cn("relative flex items-center gap-xl px-xl py-lg", className)}>
      <span
        aria-hidden="true"
        className={cn("mw-wipe-in absolute inset-0 rounded-sm border-l-4 bg-panel", tone.edge)}
      />
      <strong className={cn("relative shrink-0 whitespace-nowrap t-heading-l", tone.text)}>{verdict}</strong>
      <p className="relative min-w-px flex-1 t-body-s text-fg-secondary">
        {reasons.map((reason, i) => (
          <span key={reason} className="mw-text-in" style={stagger(i, afterWipe) as CSSProperties}>
            {i > 0 ? " · " : ""}
            {reason}
          </span>
        ))}
      </p>
    </div>
  );
}
