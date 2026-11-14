import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CommsToggle, PassRow } from "@/components/marswalk/comms";
import { Fit } from "@/components/marswalk/fit";
import { ImageSlot, SatelliteMarker, WaypointMarker } from "@/components/marswalk/map";
import {
  Brackets,
  ScreenHeading,
  StatList,
  StatRow,
  TimelineBar,
} from "@/components/marswalk/primitives";
import { useToast } from "@/components/marswalk/toaster";
import { CONTACT_WINDOWS, PASSES, PASS_SUMMARY } from "@/data/mission";
import { motionMs, stagger } from "@/lib/motion";

/** Orbital planes drawn over the globe: center, radii, tilt and line opacity. */
const ORBITS = [
  { cx: 405.4, cy: 585.05, rx: 379.25, ry: 109.25, tilt: 24, opacity: 0.85 },
  { cx: 510.75, cy: 315.24, rx: 379.25, ry: 149.25, tilt: -18, opacity: 0.4 },
  { cx: 381.6, cy: 97.1, rx: 359.25, ry: 79.25, tilt: -58, opacity: 0.25 },
];

const SATELLITES = [
  { label: "MRS-L1 · in view", left: 288, top: 506 },
  { label: "MRS-L3", left: 768, top: 286 },
  { label: "MRS-L2", left: 638, top: 626 },
  { label: "MRS-L4", left: 158, top: 316 },
];

/** Globe scene in Figma pixels (the left panel above the contact windows). */
const SCENE = { width: 966, height: 790 };
const PASS_CHIP_W = 40;
const pct = (minute: number) => `${(minute / CONTACT_WINDOWS.minutes) * 100}%`;

/** 06 · Comms · Pass Prediction. Passes are propagated from synthetic elements. */
export function CommsPassesScreen() {
  const toast = useToast();
  const [siteOpen, setSiteOpen] = useState(true);
  const group = motionMs("stagger-group");
  const tick = motionMs("tick");

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-[720px] lg:flex-row">
      <div className="relative flex flex-col overflow-hidden bg-top-bar lg:min-w-0 lg:flex-1">
        <div className="flex flex-wrap items-start justify-between gap-md p-lg md:p-xl lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-0 lg:z-10">
          <ScreenHeading
            title="Relay passes over Jezero West"
            sub="4 relays · 400 km · 3 orbital planes · propagated from synthetic elements"
            className="shrink"
          />
          <CommsToggle className="lg:pointer-events-auto" />
        </div>

        <Fit
          width={SCENE.width}
          height={SCENE.height}
          className="aspect-[966/790] w-full lg:aspect-auto lg:min-h-0 lg:flex-1"
        >

        <div className="absolute top-[120px] left-[163px] size-[640px] overflow-hidden rounded-pill">
          <ImageSlot
            file="mars-globe.png"
            alt="Mars globe"
            className="inset-0 size-full"
            missingLabel="Globe image missing · add public/images/mars-globe.png"
          />
        </div>

        <svg width={966} height={790} viewBox="0 0 966 790" fill="none" aria-hidden="true" className="absolute top-0 left-0">
          {ORBITS.map((o) => (
            <ellipse
              key={o.tilt}
              cx={o.cx}
              cy={o.cy}
              rx={o.rx}
              ry={o.ry}
              transform={`rotate(${o.tilt} ${o.cx} ${o.cy})`}
              stroke="var(--text-primary)"
              strokeWidth={1.5}
              opacity={o.opacity}
            />
          ))}
        </svg>

        {SATELLITES.map((sat, i) => (
          <SatelliteMarker key={sat.label} label={sat.label} className="mw-reveal" style={{ ...sat, ...stagger(i, group) }} />
        ))}
        <Brackets className="top-[500px] left-[281px] size-[40px]" delay={group + tick * SATELLITES.length} />

        <WaypointMarker label="You" x={520} y={400} selected={false} onSelect={() => setSiteOpen((v) => !v)} />

        {/* Lock-on open: the site panel is born from the "You" marker */}
        {siteOpen ? (
          <div className="mw-lockon absolute top-[372px] left-[560px] flex w-[280px] flex-col gap-xs rounded-sm border border-line-subtle bg-scrim p-md">
            <p className="mw-flash-in whitespace-nowrap t-label-m text-fg" style={stagger(0, tick * 3)}>
              Jezero West
            </p>
            <p className="mw-flash-in t-data-telemetry whitespace-pre text-fg-secondary" style={stagger(1, tick * 3)}>
              {"18.43° N  77.42° E · −2 410 m"}
            </p>
            <StatList className="mw-flash-in" >
              <StatRow label="Next usable pass" value="16:42" unit="LMST" />
              <StatRow label="Max elevation" value="62" unit="°" />
              <StatRow label="Expected margin" value="+3.1" unit="dB" />
            </StatList>
          </div>
        ) : null}
        </Fit>

        <section className="m-lg mt-0 flex shrink-0 flex-col gap-sm rounded-sm border border-line-subtle bg-panel px-lg py-md md:m-xl md:mt-0">
          <div className="flex flex-wrap items-start justify-between gap-x-lg gap-y-xs">
            <h2 className="t-label-m text-fg">Contact windows · next 6 h</h2>
            <p className="t-data-telemetry text-fg-muted">{CONTACT_WINDOWS.meta}</p>
          </div>
          <div className="relative h-2xl w-full shrink-0 overflow-hidden rounded-sm bg-inset">
            <span
              aria-label="EVA remaining"
              className="absolute top-0 left-0 h-full bg-raised"
              style={{ width: pct(CONTACT_WINDOWS.evaEnds) }}
            />
            {CONTACT_WINDOWS.passes.map((pass, i) => (
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
              style={{ left: pct(CONTACT_WINDOWS.now) }}
            />
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-lg bg-raised px-lg py-xl lg:w-[360px] lg:shrink-0 lg:overflow-y-auto xl:w-[400px]">
        <ScreenHeading title="Link prediction" sub="Margins use the uplink, the weaker direction" />
        <ul className="flex flex-col gap-xs">
          {PASSES.map((pass, i) => (
            <PassRow key={pass.id} pass={pass} signature style={stagger(i, group)} />
          ))}
        </ul>
        <StatList className="rounded-sm bg-panel px-md py-sm">
          {PASS_SUMMARY.map((row) => (
            <StatRow key={row.label} {...row} />
          ))}
        </StatList>
        <div className="hidden min-h-px flex-1 lg:block" />
        <Button className="w-full" onClick={() => toast("Passes synced to HUD", { safety: true })}>
          Sync passes to HUD
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => toast("Export is not in this prototype")}>
          Export elements
        </Button>
      </aside>
    </div>
  );
}
