import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PassRow } from "@/components/marswalk/comms";
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

const LANE_W = 886;
const PASS_CHIP_W = 40;
const pxPerMinute = LANE_W / CONTACT_WINDOWS.minutes;

/** 06 · Comms · Pass Prediction. Passes are propagated from synthetic elements. */
export function CommsPassesScreen() {
  const toast = useToast();
  const [siteOpen, setSiteOpen] = useState(true);
  const group = motionMs("stagger-group");
  const tick = motionMs("tick");

  return (
    <>
      <div className="absolute top-top-bar bottom-0 left-0 w-[966px] overflow-hidden bg-top-bar">
        <ScreenHeading
          title="Relay passes over Jezero West"
          sub="4 relays · 400 km · 3 orbital planes · propagated from synthetic elements"
          className="absolute top-xl left-xl"
        />

        <div className="absolute top-[120px] left-[163px] size-[640px] overflow-hidden rounded-pill">
          <ImageSlot
            file="mars-globe.png"
            alt="Mars globe"
            className="inset-0 size-full"
            missingLabel="Globe image missing · add public/images/mars-globe.png"
          />
        </div>

        <svg width={966} height={938} viewBox="0 0 966 938" fill="none" aria-hidden="true" className="absolute top-0 left-0">
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

        <section className="absolute top-[810px] left-xl flex h-[104px] w-[918px] flex-col gap-sm rounded-sm border border-line-subtle bg-panel px-lg py-md">
          <div className="flex items-start justify-between whitespace-nowrap">
            <h2 className="t-label-m text-fg">Contact windows · next 6 h</h2>
            <p className="t-data-telemetry text-fg-muted">{CONTACT_WINDOWS.meta}</p>
          </div>
          <div className="relative h-2xl shrink-0 overflow-hidden rounded-sm bg-inset" style={{ width: LANE_W }}>
            <span
              aria-label="EVA remaining"
              className="absolute top-0 left-0 h-full bg-raised"
              style={{ width: CONTACT_WINDOWS.evaEnds * pxPerMinute }}
            />
            {CONTACT_WINDOWS.passes.map((pass, i) => (
              <TimelineBar
                key={`${pass.label}-${pass.start}`}
                kind="comms"
                label={pass.label}
                style={{ left: pass.start * pxPerMinute, width: PASS_CHIP_W, ...stagger(i, group * 2) }}
              />
            ))}
            <span
              aria-label="Now"
              className="absolute top-0 h-full w-(--stroke-default) bg-brand"
              style={{ left: CONTACT_WINDOWS.now * pxPerMinute }}
            />
          </div>
        </section>
      </div>

      <aside className="absolute top-top-bar right-0 bottom-0 flex w-[400px] flex-col gap-lg bg-raised px-lg py-xl">
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
        <div className="min-h-px flex-1" />
        <Button className="w-full" onClick={() => toast("Passes synced to HUD", { safety: true })}>
          Sync passes to HUD
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => toast("Export is not in this prototype")}>
          Export elements
        </Button>
      </aside>
    </>
  );
}
