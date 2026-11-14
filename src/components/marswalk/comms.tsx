import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import type { RelayPass } from "@/data/mission";
import { Icon } from "./icons";
import { Brackets } from "./primitives";

/**
 * Relay satellite pass (Figma "Pass Row"). Margin = E[Pr] − Pth from the
 * gamma-distributed elevation model. The in-view pass carries the signature
 * brackets when `signature` is set. Values are simulated.
 */
export function PassRow({
  pass,
  signature = false,
  style,
}: {
  pass: RelayPass;
  signature?: boolean;
  style?: CSSProperties;
}) {
  const later = pass.state === "later";
  return (
    <li
      className={cn(
        "mw-flash-in relative flex items-center gap-md rounded-sm p-md",
        pass.state === "in-view" ? "bg-inset" : "border-b border-line-subtle",
      )}
      style={style}
    >
      <span className={later ? "text-fg-secondary" : "text-fg"}>
        <Icon name="satellite" />
      </span>
      <div className="flex min-w-px flex-1 flex-col gap-xs whitespace-nowrap">
        <p className={cn("t-label-m", later ? "text-fg-secondary" : "text-fg")}>{pass.name}</p>
        <p className="t-data-telemetry text-fg-secondary">{pass.window}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-xs whitespace-nowrap">
        <p className="t-data-telemetry text-fg">{pass.maxElevation}</p>
        <p className={cn("t-data-coordinate", later ? "text-fg-secondary" : "text-fg")}>{pass.margin}</p>
      </div>
      {pass.state === "in-view" && signature ? <Brackets /> : null}
    </li>
  );
}
