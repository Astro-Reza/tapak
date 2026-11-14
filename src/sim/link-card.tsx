import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { LogLine } from "@/components/marswalk/primitives";
import { useMission } from "./mission";

/** One-way light time Earth-Mars is about 3 to 22 minutes (engine sync/channel.js); the demo default is 5 s. */
const PRESETS = [
  { label: "Demo 5 s", s: 5 },
  { label: "≈3 min", s: 180 },
  { label: "≈22 min", s: 1320 },
];

const hms = (t: number) => new Date(t).toTimeString().slice(0, 8);

/** Mission-control side of the plan link with light-time delay (engine createLink, BroadcastChannel). */
export function MissionLinkCard({ delay = 0 }: { delay?: number }) {
  const { link, ev } = useMission();
  return (
    <Card className="min-h-0">
      <CardHeader title="Mission control link" meta={`light-time delay ${link.delayS} s · simulated channel`} delay={delay} />
      <div className="flex flex-col gap-md px-lg py-md">
        <div className="flex gap-sm" role="group" aria-label="Light-time delay">
          {PRESETS.map((p) => (
            <Button
              key={p.s}
              variant={link.delayS === p.s ? "primary" : "secondary"}
              aria-pressed={link.delayS === p.s}
              className="min-w-0 flex-1 px-sm"
              onClick={() => link.setDelay(p.s)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Button className="w-full" disabled={!ev?.end} onClick={link.sendPlan}>
          Send plan to suit device
        </Button>
        <ul className="flex flex-col gap-xs" aria-live="polite">
          {link.log.length ? (
            link.log.map((e, i) => <LogLine key={`${e.at}-${i}`} time={hms(e.at)} level="info" message={`${e.dir === "out" ? "→" : "←"} ${e.text}`} />)
          ) : (
            <li className="t-body-s text-fg-secondary">No messages yet. A plan is a small recipe; the suit device rebuilds the route from the same terrain.</li>
          )}
        </ul>
      </div>
    </Card>
  );
}
