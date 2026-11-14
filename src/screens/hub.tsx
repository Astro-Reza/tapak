import { useSyncExternalStore, type CSSProperties } from "react";

import { CardHeader } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChecklistPanel } from "@/components/marswalk/checklist-panel";
import { HoldPanel } from "@/components/marswalk/hold-panel";
import { TimelineBar } from "@/components/marswalk/primitives";
import { POST_EVA_BLOCKS, PRE_EVA_BLOCKS, type ChecklistBlock } from "@/data/eva-checklist";
import { DURING_EVA, TIMELINE } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { clockAfter, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { MissionStatusStrip } from "@/sim/status-strip";

/** Track label column from the Figma frame; lanes stretch to fill (lane = 4 h). */
const LABEL_W = 140;
const COMMS_CHIP_W = 64;
const pct = (minute: number) => `${(minute / TIMELINE.minutes) * 100}%`;

/** The EVA checklist sheet has no During-EVA tab yet, so this list still comes from the mission plan. */
const DURING_EVA_BLOCKS: ChecklistBlock[] = [
  {
    id: "during-1",
    title: "During EVA",
    items: DURING_EVA.map((entry) => ({ id: entry.id, title: entry.text, codes: [], tag: entry.time })),
  },
];

/** Tailwind `md`: below it the three checklists stack instead of sitting side by side. */
const WIDE = "(min-width: 768px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

/**
 * 01 · Mission Hub (Pre-EVA): the three checklists, the hold criteria and the
 * During-EVA timeline in one resizable frame. Every panel scrolls on its own.
 */
export function HubScreen() {
  const { done, toggle } = useStore();
  const wide = useWide();
  const group = motionMs("stagger-group");
  const ticks = Array.from({ length: TIMELINE.minutes / TIMELINE.tickEvery + 1 }, (_, i) => i * TIMELINE.tickEvery);

  return (
    <div className={cn("flex h-full flex-col gap-lg p-lg md:p-xl", wide ? "min-h-[720px]" : "min-h-[1280px]")}>
      <MissionStatusStrip className="shrink-0" />
      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-0 flex-1 overflow-hidden rounded-md border border-line-subtle bg-panel text-fg"
      >
        <ResizablePanel id="hub-checklists" defaultSize="70%" minSize={wide ? 240 : 480}>
          <ResizablePanelGroup key={wide ? "row" : "stack"} orientation={wide ? "horizontal" : "vertical"}>
            <ResizablePanel id="hub-pre" defaultSize="34%" minSize="14%">
              <ChecklistPanel
                title="Pre-EVA checklist"
                blocks={PRE_EVA_BLOCKS}
                done={done.pre}
                current
                signature
                onToggle={(id) => toggle("pre", id)}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="hub-during" defaultSize="18%" minSize="14%">
              <ChecklistPanel
                title="During-EVA checklist"
                blocks={DURING_EVA_BLOCKS}
                done={done.during}
                metaSuffix={`starts ${TIMELINE.startLabel}`}
                onToggle={(id) => toggle("during", id)}
                delay={group}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="hub-post" defaultSize="26%" minSize="14%">
              <ChecklistPanel
                title="Post-EVA checklist"
                blocks={POST_EVA_BLOCKS}
                done={done.post}
                onToggle={(id) => toggle("post", id)}
                delay={group * 2}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="hub-hold" defaultSize="22%" minSize="14%">
              <HoldPanel delay={group * 3} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel id="hub-timeline" defaultSize="30%" minSize={96}>
          <section className="flex size-full min-h-0 flex-col">
        <CardHeader
          title="During-EVA missions · timeline"
          meta={`Synthetic schedule · drag up for details · ${TIMELINE.tracks.length} tracks · ${TIMELINE.startLabel} → ${TIMELINE.endLabel}`}
          delay={group * 3}
        />
        <ScrollArea className="min-h-0 flex-1" aria-label="Mission timeline">
        <div className="shrink-0 overflow-x-auto overflow-y-hidden">
        <div className="relative flex min-w-[760px] flex-col gap-sm px-lg py-md">
          <div className="flex gap-md">
            <div className="h-lg shrink-0" style={{ width: LABEL_W }} />
            <div className="relative h-lg min-w-0 flex-1 t-data-telemetry text-fg-muted">
              {ticks.map((minute, i) => (
                <span
                  key={minute}
                  className="absolute top-0 whitespace-nowrap"
                  style={i === ticks.length - 1 ? { right: 0 } : { left: pct(minute) }}
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
              <div className="relative h-2xl min-w-0 flex-1 overflow-hidden rounded-sm bg-inset">
                {ticks.slice(1, -1).map((minute) => (
                  <span
                    key={minute}
                    className="absolute top-0 h-full w-px bg-line opacity-25"
                    style={{ left: pct(minute) }}
                  />
                ))}
                {track.events.map((event, i) => (
                  <TimelineBar
                    key={`${event.label}-${event.start}`}
                    kind={event.kind}
                    label={event.label}
                    style={
                      {
                        left: pct(event.start),
                        width: event.duration ? pct(event.duration) : COMMS_CHIP_W,
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
            className="absolute top-md bottom-md w-(--stroke-default) bg-brand"
            style={{ left: 16 + LABEL_W + 12 }}
          />
        </div>
        </div>

          <div className="grid grid-cols-1 gap-xl border-t border-line-subtle px-lg py-lg sm:grid-cols-2 lg:grid-cols-5">
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
        </ScrollArea>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
