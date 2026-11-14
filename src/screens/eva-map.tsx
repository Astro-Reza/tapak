import { useEffect, useState } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/input";
import { PassRow } from "@/components/marswalk/comms";
import { Fit } from "@/components/marswalk/fit";
import { Icon } from "@/components/marswalk/icons";
import {
  Basemap,
  LayerRow,
  MapDim,
  MapFrame,
  ProfileChart,
  ProfileLine,
  RouteLine,
  RouteOverlay,
  WaypointMarker,
} from "@/components/marswalk/map";
import {
  LogLine,
  MapTag,
  MetricTile,
  ScreenHeading,
  StatList,
  StatRow,
  StatusChip,
} from "@/components/marswalk/primitives";
import { EVA, PASSES_EVA, type LayerId } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";

const EVA_LAYERS: LayerId[] = ["slope", "dose", "link"];

/**
 * Simulated 1 Hz heart-rate feed so the readout ticker has something to show.
 * Placeholder for the suit telemetry stream; not a measurement.
 */
function useSimulatedHeartRate(start: number) {
  const [bpm, setBpm] = useState(start);
  useEffect(() => {
    const id = window.setInterval(() => {
      setBpm((v) => Math.max(88, Math.min(96, v + (Math.random() < 0.5 ? -1 : 1))));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  return bpm;
}

/** 03 · EVA Map (During EVA): progress, live position, connectivity, telemetry. */
export function EvaMapScreen() {
  const [layers, setLayers] = useState<Record<string, boolean>>({ slope: true, dose: true, link: true });
  const heartRate = useSimulatedHeartRate(92);
  const group = motionMs("stagger-group");
  const profile = EVA.profile;

  return (
    <div className="flex min-h-full flex-col xl:h-full xl:min-h-[760px] xl:flex-row">
      <aside className="flex flex-col gap-lg bg-raised px-lg py-xl xl:w-rail xl:shrink-0 xl:overflow-y-auto">
        <ScreenHeading title="EVA progress" sub={EVA.subtitle} />
        <div className="grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-2">
          {EVA.tiles.map((tile, i) => (
            <MetricTile key={tile.label} {...tile} className="min-w-0" style={stagger(i, group)} />
          ))}
        </div>
        <Card className="shrink-0 rounded-sm">
          <CardHeader title="Prediction" meta="vs plan" delay={group * 2} />
          <StatList className="px-md py-sm">
            {EVA.prediction.map((row) => (
              <StatRow key={row.label} {...row} />
            ))}
          </StatList>
        </Card>
      </aside>

      <section className="relative flex flex-col gap-lg p-lg xl:block xl:min-w-0 xl:flex-1 xl:p-0">
      <MapFrame
        className="h-[60vh] min-h-[380px] rounded-md xl:absolute xl:inset-0 xl:h-auto xl:min-h-0 xl:rounded-none"
        design={{ width: 710, height: 938 }}
        origin={{ x: EVA.you.x, y: EVA.you.y }}
        controlsClassName="right-lg top-1/2 -translate-y-1/2"
        world={
          <>
            <Basemap {...EVA.basemap} />
            <MapDim opacity={0.3} />
            <RouteOverlay width={710} height={938}>
              <RouteLine points={EVA.walked} variant="walked-dotted" />
              <RouteLine points={EVA.remaining} />
            </RouteOverlay>
            {EVA.markers.map((m) => (
              <WaypointMarker key={m.label} label={m.label} x={m.x} y={m.y} selected={m.next} />
            ))}
            <div
              role="img"
              aria-label="Your position"
              className="absolute flex size-control items-center justify-center rounded-pill border-3 border-brand bg-fg text-panel"
              style={{ left: EVA.you.x - 18, top: EVA.you.y - 18 }}
            >
              <Icon name="astronaut" size={20} />
            </div>
            <MapTag className="absolute" style={{ left: EVA.you.x + 26, top: EVA.you.y + 10 }}>
              {EVA.you.tag}
            </MapTag>
            <MapTag className="absolute" style={{ left: EVA.buddyTag.left, top: EVA.buddyTag.top }}>
              {EVA.buddyTag.label}
            </MapTag>
          </>
        }
      >
        <SearchInput
          placeholder="Search in map"
          aria-label="Search in map"
          className="absolute top-lg left-lg z-10 w-[min(260px,calc(100%_-_32px))] xl:top-xl xl:left-xl"
        />
      </MapFrame>

        <div className="mw-flash-in flex flex-col gap-xs rounded-sm border border-line-subtle bg-scrim px-lg py-sm xl:absolute xl:top-xl xl:right-xl xl:z-10 xl:w-[296px]">
          {EVA_LAYERS.map((id) => (
            <LayerRow
              key={id}
              layer={id}
              active={layers[id]}
              onToggle={() => setLayers((s) => ({ ...s, [id]: !s[id] }))}
            />
          ))}
        </div>

        <Card className="rounded-sm xl:absolute xl:inset-x-xl xl:bottom-xl xl:z-10">
          <CardHeader title="Route profile" meta={profile.meta} />
          <Fit width={660} height={148} className="aspect-[660/148] w-full">
            <ProfileChart width={660} height={148} baseline={130} area={[...profile.walked, ...profile.ahead.slice(1)]}>
              <ProfileLine points={profile.walked} tone="secondary" />
              <ProfileLine points={profile.ahead} draw />
            </ProfileChart>
            {/* brand marks "now" */}
            <span
              aria-hidden="true"
              className="absolute top-[10px] h-[120px] w-(--stroke-default) bg-brand"
              style={{ left: profile.nowX }}
            />
            <span
              className="absolute top-sm whitespace-nowrap t-data-telemetry text-brand"
              style={{ left: profile.nowX + 8 }}
            >
              {profile.nowLabel}
            </span>
          </Fit>
        </Card>
      </section>

      <aside className="flex flex-col gap-lg bg-raised px-lg py-xl xl:w-rail xl:shrink-0 xl:overflow-y-auto">
        <ScreenHeading title="Connectivity" sub="Tablet · HUD · relay · habitat" />
        <ul className="flex flex-col gap-xs rounded-sm bg-panel px-md py-sm">
          {EVA.hops.map((hop, i) => (
            <li key={hop.name} className="mw-flash-in flex items-center gap-sm py-xs" style={stagger(i, group)}>
              <div className="flex min-w-px flex-1 flex-col whitespace-nowrap">
                <p className="t-label-m text-fg">{hop.name}</p>
                <p className="t-data-telemetry text-fg-secondary">{hop.detail}</p>
              </div>
              <StatusChip status={hop.status} />
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-lg">
          {PASSES_EVA.map((pass, i) => (
            <PassRow key={pass.id} pass={pass} signature style={stagger(i, group * 2)} />
          ))}
        </ul>
        <Card className="shrink-0 rounded-sm border-0">
          <CardHeader title="Live telemetry" meta="1 Hz · simulated" delay={group * 3} />
          <StatList className="px-md py-sm">
            {EVA.telemetry.map((row) => (
              <StatRow key={row.label} {...row} value={row.label === "Heart rate" ? String(heartRate) : row.value} />
            ))}
          </StatList>
        </Card>
        <section className="flex flex-col gap-xs xl:min-h-px xl:flex-1 xl:overflow-hidden">
          <h2 className="t-data-telemetry text-fg-muted">System log</h2>
          <ul className="flex flex-col gap-xs">
            {EVA.log.map((line, i) => (
              <LogLine key={line.time} {...line} style={stagger(i, group * 3 + headerDelay())} />
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
