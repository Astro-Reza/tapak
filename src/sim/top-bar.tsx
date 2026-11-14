import type { ComponentProps } from "react";

import { TopBar } from "@/components/marswalk/top-bar";
import type { Route } from "@/lib/router";
import { useMission } from "./mission";
import { fmtLmst, MARS_HOUR_MIN } from "./view";

/** Top bar whose LMST clock follows the plan: EVA start before the walk, the EVA clock during it, ingress after. */
export function MissionTopBar({ route, fallback, ...rest }: Omit<ComponentProps<typeof TopBar>, "clock"> & { route: Route; fallback: string }) {
  const { settings, ev, evaT } = useMission();
  const start = settings.startLmst;
  const end = ev?.end?.t;
  const t = route === "eva" || route === "fov" || route.startsWith("comms") ? evaT : route === "debrief" ? end : 0;
  const clock = t == null || !ev ? fallback : fmtLmst(start + t / MARS_HOUR_MIN);
  return <TopBar route={route} clock={clock} {...rest} />;
}
