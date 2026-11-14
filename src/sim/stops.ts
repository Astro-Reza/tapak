import type { Evaluation } from "@/engine";

/** "63_3564" (site_drive of the Perseverance traverse) -> label */
export const stopName = (id: string) => {
  const [site, drive] = id.split("_");
  return drive ? `Site ${site} · drive ${drive}` : id;
};

/** Profile indices of the start, each stop arrival and the return home. */
export function arrivalIndices(ev: Evaluation): number[] {
  const prof = ev.prof!;
  const idx = ev.plan.legs.slice(1).map((leg) => prof.findIndex((p) => p.i === leg.startIdx));
  return [0, ...idx, prof.length - 1];
}
