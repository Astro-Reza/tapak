import tapakWordmark from "@/icon/TAPAK_LOGO_WORDMARK.svg";
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
  { label: "Comms", route: "comms", match: ["comms"] },
  { label: "Debrief", route: "debrief", match: ["debrief"] },
];

function Tabs({
  route,
  onNavigate,
  className,
  tabClassName,
  dataTour,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  className?: string;
  tabClassName?: string;
  dataTour?: string;
}) {
  return (
    <nav
      aria-label="Mission views"
      data-tour={dataTour}
      className={cn("grid grid-cols-6 border-x border-line-subtle", className)}
    >
      {TABS.map((tab) => {
        const active = tab.match.includes(route);
        return (
          <button
            key={tab.route}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(tab.route)}
            className={cn(
              "mw-tab relative flex h-full w-full min-w-0 items-center justify-center rounded-none border-r border-line-subtle last:border-r-0 text-center t-body-s lg:t-label-m text-[17.5px] lg:text-[21.25px] whitespace-nowrap cursor-pointer select-none px-1",
              tabClassName,
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Global header, 80 px on wide screens. Stays put during screen changes so the
 * astronaut never loses it. Below 1024 px the tabs move to a second
 * row. The link chip mirrors the relay link verdict.
 */
export function TopBar({
  route,
  clock,
  linkStatus = "safe",
  suit,
  onNavigate,
  onHelp,
}: {
  route: Route;
  clock: string;
  linkStatus?: Status;
  /** live suit device line, e.g. "Suit live · 0.41 km" (the Marswalk AR phone on the relay) */
  suit?: string;
  onNavigate: (route: Route) => void;
  onHelp?: () => void;
}) {
  return (
    <header className="relative z-50 shrink-0 border-b border-line-subtle bg-top-bar">
      <div className="flex h-[60px] items-stretch justify-between gap-md px-md lg:h-[80px] lg:gap-lg lg:px-lg">
        <div className="flex min-w-0 items-center gap-md whitespace-nowrap">
          <img
            src={tapakWordmark}
            alt="TAPAK"
            className="h-[22px] w-auto sm:h-[26px] xl:h-[32px]"
          />
          <p className="hidden t-data-telemetry text-[17.5px] text-fg-secondary min-[1366px]:block">
            {MISSION.id} · {MISSION.site}
          </p>
        </div>
        <Tabs
          route={route}
          onNavigate={onNavigate}
          dataTour="main-nav"
          className="hidden h-full items-stretch lg:grid w-[600px] xl:w-[696px]"
        />
        <div className="flex shrink-0 items-center gap-sm xl:gap-md">
          {suit ? <p role="status" className="hidden whitespace-nowrap t-data-telemetry text-[17.5px] text-fg-secondary md:block">{suit}</p> : null}
          <p className="whitespace-nowrap t-data-coordinate text-[18.75px] text-fg">
            <span className="hidden sm:inline">SOL {MISSION.sol} · </span>
            {clock} LMST
          </p>
          <div className="flex items-center gap-sm">
            <span className="hidden text-fg sm:inline">
              <Icon name="signal" size={19} />
            </span>
            <p className="hidden whitespace-nowrap t-data-telemetry text-[17.5px] text-fg-secondary xl:block">{MISSION.relay}</p>
            <span className="origin-right scale-[0.94]"><StatusChip status={linkStatus} /></span>
          </div>
          {/* Final-step Replay Help button (56px touch target for gloved fingers) */}
          <button
            type="button"
            data-tour="help-button"
            data-testid="help-button"
            aria-label="Help · Replay onboarding tour"
            title="Help · Replay onboarding tour"
            onClick={onHelp}
            className="mw-btn flex min-h-[56px] min-w-[56px] items-center justify-center rounded-sm border border-line-subtle bg-panel px-sm text-[18px] font-semibold text-fg-secondary transition-colors hover:bg-inset hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand cursor-pointer select-none"
          >
            ?
          </button>
        </div>
      </div>
      <Tabs
        route={route}
        onNavigate={onNavigate}
        className="grid h-[48px] w-full border-t border-line-subtle lg:hidden"
      />
    </header>
  );
}
