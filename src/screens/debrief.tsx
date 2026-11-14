import { Card, CardHeader } from "@/components/ui/card";
import { ChecklistCard } from "@/components/marswalk/checklist";
import {
  Basemap,
  RouteLine,
  RouteOverlay,
  WaypointDot,
  WaypointMarker,
} from "@/components/marswalk/map";
import { LogLine, MapTag, MetricTile, ScreenHeading, StatusChip } from "@/components/marswalk/primitives";
import { DEBRIEF, POST_EVA } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { useStore } from "@/lib/store";

/** 07 · Debrief (Post-EVA): planned vs walked, outcome, samples, events. */
export function DebriefScreen() {
  const { done, toggle } = useStore();
  const group = motionMs("stagger-group");
  const tick = motionMs("tick");

  return (
    <div className="absolute inset-x-0 top-top-bar bottom-0 flex flex-col gap-xl p-xl">
      <ScreenHeading inline title="EVA-07 debrief · Sol 412" sub={DEBRIEF.subtitle} />

      <div className="flex h-[500px] shrink-0 items-start gap-xl">
        <Card className="h-full w-[820px] shrink-0">
          <CardHeader title="Planned vs walked" meta="dashed: plan · solid: walked" />
          <div className="relative min-h-px flex-1 overflow-hidden bg-canvas">
            <Basemap {...DEBRIEF.basemap} />
            <div className="absolute inset-0 bg-canvas opacity-35" />
            <RouteOverlay width={818} height={452}>
              <RouteLine points={DEBRIEF.planned} variant="plan-dashed" />
              <RouteLine points={DEBRIEF.walked} variant="walked" delay={headerDelay()} />
            </RouteOverlay>
            {DEBRIEF.markers.map((m, i) => (
              <WaypointMarker key={m.label} label={m.label} x={m.x} y={m.y} delay={headerDelay() + i * tick * 2} />
            ))}
            {DEBRIEF.tags.map((tag) => (
              <MapTag key={tag.label} className="absolute" style={{ left: tag.left, top: tag.top }}>
                {tag.label}
              </MapTag>
            ))}
          </div>
        </Card>

        <div className="flex h-full min-w-px flex-1 flex-col gap-md">
          {DEBRIEF.outcome.map((tile, i) => (
            <MetricTile key={tile.label} {...tile} size="l" className="w-full" style={stagger(i, group)} />
          ))}
          <div className="flex w-full items-stretch gap-md">
            {DEBRIEF.pair.map((tile, i) => (
              <MetricTile key={tile.label} {...tile} className="min-w-px flex-1" style={stagger(i + 3, group)} />
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-h-px flex-1 items-start gap-xl">
        <Card className="h-full w-[420px] shrink-0">
          <CardHeader title="Samples" meta={`${DEBRIEF.samples.length} bagged`} delay={group * 2} />
          <ul className="flex flex-col gap-xs p-sm">
            {DEBRIEF.samples.map((sample, i) => (
              <li
                key={sample.id}
                className="mw-flash-in flex items-center gap-md border-b border-line-subtle px-md py-sm"
                style={stagger(i, group * 2 + headerDelay())}
              >
                <WaypointDot size={14} />
                <div className="flex min-w-px flex-1 flex-col gap-xs">
                  <p className="truncate t-label-m text-fg">
                    {sample.id} · {sample.name}
                  </p>
                  <p className="truncate t-data-telemetry text-fg-secondary">{sample.detail}</p>
                </div>
                <StatusChip status={sample.status} />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="h-full min-w-px flex-1">
          <CardHeader title="Events" meta={`${DEBRIEF.events.length} flagged`} delay={group * 3} />
          <ul className="flex flex-col gap-xs p-sm">
            {DEBRIEF.events.map((event, i) => (
              <LogLine key={event.time} {...event} style={stagger(i, group * 3 + headerDelay())} />
            ))}
          </ul>
        </Card>

        <ChecklistCard
          title="Post-EVA checklist"
          entries={POST_EVA.slice(0, 4)}
          done={done["post-debrief"]}
          current
          signature
          showProgress={false}
          onToggle={(id) => toggle("post-debrief", id)}
          className="h-full w-[400px] shrink-0"
          listClassName="p-sm"
          delay={group * 4}
        />
      </div>
    </div>
  );
}
