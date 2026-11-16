import { lazy, Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PassRow } from "@/components/marswalk/comms";
import { ScreenHeading, StatList, StatRow, TimelineBar } from "@/components/marswalk/primitives";
import { useToast } from "@/components/marswalk/toaster";
import { DEFAULT_ACTIVE_PASS } from "@/data/comms";
import { SOURCE_LABEL, useCommsPasses } from "@/lib/comms-api";
import { saveHudPass, type HudPassData } from "@/lib/hud-pass";
import { motionMs, stagger } from "@/lib/motion";

/** three.js is only needed here, so it stays out of the other screens' bundle. */
const MarsGlobe = lazy(() => import("@/components/marswalk/mars-globe"));

const PASS_CHIP_W = 40;

/**
 * 06 · Comms · Pass Prediction. The screen fills the frame and never scrolls
 * as a whole: the globe takes the free space and only the pass list scrolls.
 */
export function CommsPassesScreen() {
  const toast = useToast();
  const { data, source } = useCommsPasses();
  const { site, contactWindows } = data;
  const [siteOpen, setSiteOpen] = useState(true);
  const group = motionMs("stagger-group");
  const tick = motionMs("tick");
  const pct = (minute: number) => `${(minute / contactWindows.minutes) * 100}%`;

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-top-bar lg:min-w-0">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-md p-lg md:p-xl lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-0 lg:z-10">
          <ScreenHeading
            title={`Relay passes over ${site.name}`}
            sub={`${data.constellation} · ${SOURCE_LABEL[source]}`}
            className="shrink"
          />
        </div>

        <Suspense fallback={<div className="min-h-0 flex-1" />}>
          <MarsGlobe
            site={site}
            relays={data.relays}
            siteOpen={siteOpen}
            onToggleSite={() => setSiteOpen((open) => !open)}
            className="min-h-0 flex-1"
            sitePanel={
              /* Lock-on open: the site panel is born from the "You" marker */
              <div className="mw-lockon flex w-[280px] flex-col gap-xs rounded-sm border border-line-subtle bg-scrim p-md">
                <p className="mw-flash-in whitespace-nowrap t-label-m text-fg" style={stagger(0, tick * 3)}>
                  {site.name}
                </p>
                <p className="mw-flash-in t-data-telemetry whitespace-pre text-fg-secondary" style={stagger(1, tick * 3)}>
                  {site.coordinate}
                </p>
                <StatList className="mw-flash-in">
                  {site.stats.map((row) => (
                    <StatRow key={row.label} {...row} />
                  ))}
                </StatList>
              </div>
            }
          />
        </Suspense>

        <section className="m-lg mt-0 flex shrink-0 flex-col gap-sm rounded-sm border border-line-subtle bg-panel px-lg py-md md:m-xl md:mt-0">
          <div className="flex flex-wrap items-start justify-between gap-x-lg gap-y-xs">
            <h2 className="t-label-m text-fg">Contact windows · next {contactWindows.minutes / 60} h</h2>
            <p className="t-data-telemetry text-fg-muted">{contactWindows.meta}</p>
          </div>
          <div className="relative h-2xl w-full shrink-0 overflow-hidden rounded-sm bg-inset">
            <span
              aria-label="EVA remaining"
              className="absolute top-0 left-0 h-full bg-raised"
              style={{ width: pct(contactWindows.evaEnds) }}
            />
            {contactWindows.passes.map((pass, i) => (
              <TimelineBar
                key={`${pass.label}-${pass.start}`}
                kind="comms"
                label={pass.label}
                style={{ left: pct(pass.start), width: PASS_CHIP_W, ...stagger(i, group * 2) }}
              />
            ))}
            <span
              aria-label="Now"
              className="absolute top-0 h-full w-(--stroke-default) bg-brand"
              style={{ left: pct(contactWindows.now) }}
            />
          </div>
        </section>
      </div>

      <aside className="flex h-[48%] min-h-0 shrink-0 flex-col bg-raised lg:h-auto lg:w-[360px] xl:w-[400px]">
        <ScreenHeading
          title="Link prediction"
          sub="Margins use the uplink, the weaker direction"
          className="px-lg pt-xl pb-lg"
        />
        <ScrollArea className="min-h-0 flex-1" aria-label="Link prediction">
          <div className="flex flex-col gap-lg px-lg pb-lg">
            <ul data-tour="pass-list" className="flex flex-col gap-xs">
              {data.passes.map((pass, i) => (
                <PassRow key={pass.id} pass={pass} signature style={stagger(i, group)} />
              ))}
            </ul>
            <StatList className="rounded-sm bg-panel px-md py-sm">
              {data.summary.map((row) => (
                <StatRow key={row.label} {...row} />
              ))}
            </StatList>
          </div>
        </ScrollArea>
        <div className="flex shrink-0 flex-col gap-sm border-t border-line-subtle p-lg">
          <Button
            className="w-full"
            onClick={() => {
              const passToSync: HudPassData = data.activePass
                ? {
                    relayId: data.activePass.relayId,
                    relayName: data.activePass.relayName,
                    startS: data.activePass.startS,
                    endS: data.activePass.endS,
                    maxElevationDeg: data.activePass.maxElevationDeg,
                    aos: data.activePass.aos ?? "15:35",
                    los: data.activePass.los ?? "15:44",
                    track: data.activePass.track,
                    syncedAt: Date.now(),
                  }
                : {
                    ...DEFAULT_ACTIVE_PASS,
                    syncedAt: Date.now(),
                  };
              saveHudPass(passToSync);
              toast(`Passes synced to HUD: ${passToSync.relayName}`, { safety: true });
            }}
          >
            Sync passes to HUD
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => toast("Export is not in this prototype")}>
            Export elements
          </Button>
        </div>
      </aside>
    </div>
  );
}
