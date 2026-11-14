import { Card, CardHeader } from "@/components/ui/card";
import { ChecklistCard } from "@/components/marswalk/checklist";
import { Fit } from "@/components/marswalk/fit";
import {
  Basemap,
  MapDim,
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
    <div className="flex min-h-full flex-col gap-lg p-lg md:gap-xl md:p-xl lg:h-full lg:min-h-[760px]">
      <ScreenHeading inline title="EVA-07 debrief · Sol 412" sub={DEBRIEF.subtitle} />

      <div className="flex flex-col gap-lg md:gap-xl lg:min-h-0 lg:flex-[500_1_0%] lg:flex-row">
        <Card className="lg:w-[62%] lg:shrink-0">
          <CardHeader title="Planned vs walked" meta="dashed: plan · solid: walked" />
          <Fit
            width={818}
            height={452}
            className="aspect-[818/452] w-full bg-canvas lg:aspect-auto lg:min-h-0 lg:flex-1"
          >
            <Basemap {...DEBRIEF.basemap} />
            <MapDim opacity={0.35} />
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
          </Fit>
        </Card>

        <div className="grid gap-md sm:grid-cols-3 lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
          {DEBRIEF.outcome.map((tile, i) => (
            <MetricTile key={tile.label} {...tile} size="l" className="w-full" style={stagger(i, group)} />
          ))}
          <div className="flex w-full items-stretch gap-md sm:col-span-3">
            {DEBRIEF.pair.map((tile, i) => (
              <MetricTile key={tile.label} {...tile} className="min-w-px flex-1" style={stagger(i + 3, group)} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-lg md:grid-cols-2 md:gap-xl lg:min-h-0 lg:flex-[350_1_0%] lg:grid-cols-[minmax(0,420fr)_minmax(0,450fr)_minmax(0,400fr)] lg:grid-rows-[minmax(0,1fr)]">
        <Card className="min-h-0">
          <CardHeader title="Samples" meta={`${DEBRIEF.samples.length} bagged`} delay={group * 2} />
          <ul className="flex min-h-0 flex-col gap-xs overflow-y-auto p-sm">
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

        <Card className="min-h-0">
          <CardHeader title="Events" meta={`${DEBRIEF.events.length} flagged`} delay={group * 3} />
          <ul className="flex min-h-0 flex-col gap-xs overflow-y-auto p-sm">
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
          className="min-h-0 md:col-span-2 lg:col-span-1"
          listClassName="p-sm"
          delay={group * 4}
        />
      </div>
    </div>
  );
}
