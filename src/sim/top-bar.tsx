import { useEffect, useState, type ComponentProps } from "react";

import { TopBar } from "@/components/marswalk/top-bar";
import type { Route } from "@/lib/router";
import { courseText, suitIsLive, useMission } from "./mission";
import { fmtLmst, MARS_HOUR_MIN } from "./view";

/** Top bar whose LMST clock follows the plan: EVA start before the walk, the EVA clock during it, ingress after. */
export function MissionTopBar({ route, fallback, ...rest }: Omit<ComponentProps<typeof TopBar>, "clock"> & { route: Route; fallback: string }) {
  const { settings, ev, evaT, link } = useMission();
  const start = settings.startLmst;
  const end = ev?.end?.t;
  const t = route === "eva" || route === "fov" || route.startsWith("comms") ? evaT : route === "debrief" ? end : 0;
  const clock = t == null || !ev ? fallback : fmtLmst(start + t / MARS_HOUR_MIN);
  // statuses arrive every 2 s plus the light-time delay; call the suit lost after 3 missed ones
  const s = link.suit;
  const [, tick] = useState(0);
  useEffect(() => { // re-check once a second so a silent suit shows as lost
    if (!s) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [s]);
  const course = s ? courseText(s.offM) : null;
  const suit = !s ? undefined
    : !suitIsLive(s, link.delayS) ? "Suit link lost"
    : `Suit live · ${s.km.toFixed(2)} km${s.counts ? "" : ` · paused (${s.tracking})`}${course && course !== "On course" ? ` · ${course}` : ""}`;
  return <TopBar route={route} clock={clock} suit={suit} {...rest} />;
}
