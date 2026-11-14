import { cn } from "@/lib/utils";
import type { Route } from "@/lib/router";
import { MISSION } from "@/data/mission";
import { Icon } from "./icons";
import { StatusChip, type Status } from "./primitives";

const TABS: { label: string; route: Route; match: readonly Route[] }[] = [
  { label: "Hub", route: "hub", match: ["hub"] },
  { label: "Plan", route: "plan", match: ["plan"] },
  { label: "EVA Map", route: "eva", match: ["eva"] },
  { label: "FoV", route: "fov", match: ["fov"] },
  { label: "Comms", route: "comms", match: ["comms", "comms/passes"] },
  { label: "Debrief", route: "debrief", match: ["debrief"] },
];

/**
 * Global header, 86 px. Stays put during screen changes so the astronaut never
 * loses it. The link chip mirrors the relay link verdict.
 */
export function TopBar({
  route,
  clock,
  linkStatus = "safe",
  onNavigate,
}: {
  route: Route;
  clock: string;
  linkStatus?: Status;
  onNavigate: (route: Route) => void;
}) {
  return (
    <header className="absolute inset-x-0 top-0 z-50 flex h-top-bar items-center justify-between border-b border-line-subtle bg-top-bar px-xl">
      <div className="flex shrink-0 items-center gap-lg whitespace-nowrap">
        <p className="t-wordmark text-fg">
          MARS<span className="text-brand">WALK</span>
        </p>
        <p className="t-data-telemetry text-fg-secondary">
          {MISSION.id} · {MISSION.site}
        </p>
      </div>
      <nav aria-label="Mission views" className="flex shrink-0 items-start">
        {TABS.map((tab) => {
          const active = tab.match.includes(route);
          return (
            <button
              key={tab.route}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(tab.route)}
              className={cn(
                "mw-tab relative flex h-top-bar items-center justify-center px-lg t-label-m whitespace-nowrap",
                active ? "text-fg" : "text-fg-secondary",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-lg">
        <p className="whitespace-nowrap t-data-coordinate text-fg">
          SOL {MISSION.sol} · {clock} LMST
        </p>
        <div className="flex items-center gap-sm">
          <span className="text-fg">
            <Icon name="signal" size={20} />
          </span>
          <p className="whitespace-nowrap t-data-telemetry text-fg-secondary">{MISSION.relay}</p>
          <StatusChip status={linkStatus} />
        </div>
      </div>
    </header>
  );
}
