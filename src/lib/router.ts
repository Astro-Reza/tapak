import { useCallback, useEffect, useState } from "react";

export const ROUTES = ["hub", "plan", "eva", "fov", "comms", "debrief"] as const;
export type Route = (typeof ROUTES)[number];

function readHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return (ROUTES as readonly string[]).includes(raw) ? (raw as Route) : "hub";
}

/** Tiny hash router: works from file hosting and keeps deep links (#/plan). */
export function useHashRoute(): [Route, (next: Route) => void] {
  const [route, setRoute] = useState<Route>(readHash);

  useEffect(() => {
    const onChange = () => setRoute(readHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    window.location.hash = `/${next}`;
  }, []);

  return [route, navigate];
}
