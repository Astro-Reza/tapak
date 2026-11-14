import { useState, type CSSProperties } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { ChecklistCard } from "@/components/marswalk/checklist";
import { TimelineBar } from "@/components/marswalk/primitives";
import { DURING_EVA, POST_EVA, PRE_EVA, TIMELINE } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { clockAfter, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Track label column and lane width from the Figma frame (lane = 4 h). */
const LABEL_W = 140;
const LANE_W = 1134;
const COMMS_CHIP_W = 64;
const pxPerMinute = LANE_W / TIMELINE.minutes;

/** 01 · Mission Hub (Pre-EVA): the three checklists and the During-EVA timeline. */
export function HubScreen() {
  const { done, toggle } = useStore();
  const [expanded, setExpanded] = useState(false);
  const group = motionMs("stagger-group");
  const ticks = Array.from({ length: TIMELINE.minutes / TIMELINE.tickEvery + 1 }, (_, i) => i * TIMELINE.tickEvery);

  return (
    <div className="absolute inset-x-0 top-top-bar bottom-0 flex flex-col gap-xl p-xl">
      {expanded ? null : (
        <div className="flex h-[512px] shrink-0 items-start gap-xl">
          <ChecklistCard
            title="Pre-EVA checklist"
            entries={PRE_EVA}
            done={done.pre}
            current
            signature
            onToggle={(id) => toggle("pre", id)}
            className="h-full w-[560px] shrink-0"
          />
          <ChecklistCard
            title="During-EVA checklist"
            entries={DURING_EVA}
            done={done.during}
            metaSuffix={`starts ${TIMELINE.startLabel}`}
            onToggle={(id) => toggle("during", id)}
            className="h-full min-w-px flex-1"
            delay={group}
          />
          <ChecklistCard
            title="Post-EVA checklist"
            entries={POST_EVA}
            done={done.post}
            onToggle={(id) => toggle("post", id)}
            className="h-full min-w-px flex-1"
            delay={group * 2}
          />
        </div>
      )}

      <Card className="min-h-px flex-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse mission timeline" : "Expand mission timeline"}
          onClick={() => setExpanded((v) => !v)}
          className="flex h-[20px] w-full shrink-0 items-center justify-center"
        >
          <span className="h-xs w-[48px] rounded-pill bg-fg-muted" />
        </button>
        <CardHeader
          title="During-EVA missions · timeline"
          meta={`${expanded ? "Slide down to close" : "Slide up for details"} · ${TIMELINE.tracks.length} tracks · ${TIMELINE.startLabel} → ${TIMELINE.endLabel}`}
          delay={group * 3}
        />
        <div className="relative flex shrink-0 flex-col gap-sm px-lg py-md">
          <div className="flex gap-md">
            <div className="h-lg shrink-0" style={{ width: LABEL_W }} />
            <div className="relative h-lg shrink-0 t-data-telemetry text-fg-muted" style={{ width: LANE_W }}>
              {ticks.map((minute, i) => (
                <span
                  key={minute}
                  className="absolute top-0 whitespace-nowrap"
                  style={i === ticks.length - 1 ? { right: 0 } : { left: minute * pxPerMinute }}
                >
                  {clockAfter(TIMELINE.startLabel, minute)}
                </span>
              ))}
            </div>
          </div>

          {TIMELINE.tracks.map((track, row) => (
            <div key={track.name} className="flex items-center gap-md">
              <p className="shrink-0 t-body-s text-fg-secondary" style={{ width: LABEL_W }}>
                {track.name}
              </p>
              <div
                className="relative h-2xl shrink-0 overflow-hidden rounded-sm bg-inset"
                style={{ width: LANE_W }}
              >
                {ticks.slice(1, -1).map((minute) => (
                  <span
                    key={minute}
                    className="absolute top-0 h-full w-px bg-line opacity-25"
                    style={{ left: minute * pxPerMinute }}
                  />
                ))}
                {track.events.map((event, i) => (
                  <TimelineBar
                    key={`${event.label}-${event.start}`}
                    kind={event.kind}
                    label={event.label}
                    style={
                      {
                        left: event.start * pxPerMinute,
                        width: event.duration ? event.duration * pxPerMinute : COMMS_CHIP_W,
                        ...stagger(row + i, group * 3 + headerDelay()),
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          ))}

          {/* T-0 marker: brand marks "now" */}
          <span
            aria-hidden="true"
            className="absolute top-md h-[236px] w-(--stroke-default) bg-brand"
            style={{ left: 16 + LABEL_W + 12 }}
          />
        </div>

        {expanded ? (
          <div className="grid min-h-px flex-1 grid-cols-5 gap-xl overflow-auto border-t border-line-subtle px-lg py-lg">
            {TIMELINE.tracks.map((track, col) => (
              <section key={track.name} className="flex flex-col gap-sm">
                <h3 className="mw-text-in t-label-m text-fg" style={stagger(col)}>
                  {track.name}
                </h3>
                <ul className="flex flex-col gap-xs">
                  {track.events.map((event, i) => (
                    <li
                      key={`${event.label}-${event.start}`}
                      className={cn("mw-text-in flex items-baseline justify-between gap-sm")}
                      style={stagger(col + i + 1)}
                    >
                      <span className="t-body-s text-fg-secondary">{event.label}</span>
                      <span className="shrink-0 t-data-telemetry text-fg">
                        {clockAfter(TIMELINE.startLabel, event.start)}
                        {event.duration ? ` · ${event.duration} min` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
