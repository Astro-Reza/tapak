import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";

import { CardHeader } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChecklistPanel } from "@/components/marswalk/checklist-panel";
import { HoldPanel } from "@/components/marswalk/hold-panel";
import { Icon } from "@/components/marswalk/icons";
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
/** Panels stand clean on the page; only the resizable handles separate them. */
const CARD = "text-fg";
const pct = (minute: number) => `${(minute / TIMELINE.minutes) * 100}%`;

/** The EVA checklist sheet has no During-EVA tab yet, so this list still comes from the mission plan. */
const DURING_EVA_BLOCKS: ChecklistBlock[] = [
  {
    id: "during-1",
    title: "During EVA",
    items: DURING_EVA.map((entry) => ({ id: entry.id, title: entry.text, codes: [], tag: entry.time })),
  },
];

/** Tailwind `md`: below it the checklists and hold panel stack instead of sitting side by side. */
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

type CustomChecklist = { id: string; title: string };

const BUILT_IN_TABS = [
  { id: "pre", label: "Pre-EVA" },
  { id: "during", label: "During-EVA" },
  { id: "post", label: "Post-EVA" },
] as const;

/** Custom checklists are a per-device convenience until the sidebar editor lands. */
const CUSTOM_KEY = "marswalk.hub.custom-checklists.v1";

function loadCustom(): CustomChecklist[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(CUSTOM_KEY) ?? "null");
    if (!Array.isArray(saved)) return [];
    return saved.filter(
      (c): c is CustomChecklist =>
        !!c && typeof c === "object" && typeof c.id === "string" && typeof c.title === "string",
    );
  } catch {
    return [];
  }
}

function useCustomChecklists() {
  const [custom, setCustom] = useState<CustomChecklist[]>(loadCustom);
  useEffect(() => {
    try {
      window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
    } catch {
      // Storage blocked: custom tabs live for this session only.
    }
  }, [custom]);
  const add = () => {
    const entry = { id: `custom-${Date.now().toString(36)}`, title: `Custom ${custom.length + 1}` };
    setCustom((list) => [...list, entry]);
    return entry.id;
  };
  return { custom, add };
}

const NONE_DONE: ReadonlySet<string> = new Set();

/** Pre / During / Post (plus any custom) checklists as tabs in one card. */
function ChecklistTabs({ delay }: { delay: number }) {
  const { done, toggle } = useStore();
  const { custom, add } = useCustomChecklists();
  const [tab, setTab] = useState<string>("pre");
  const tabs = [...BUILT_IN_TABS, ...custom.map((c) => ({ id: c.id, label: c.title }))];
  const active = tabs.some((t) => t.id === tab) ? tab : "pre";

  const header = (meta: string) => (
    <header
      className="mw-header-wipe flex shrink-0 items-stretch gap-sm border-b border-line-subtle pr-lg"
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <div role="tablist" aria-label="Checklists" className="flex min-w-px items-stretch overflow-x-auto pl-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`hub-tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls="hub-checklist-panel"
            onClick={() => setTab(t.id)}
            className={cn(
              "mw-tab relative flex shrink-0 items-center px-md py-md t-label-m whitespace-nowrap",
              t.id === active ? "text-fg" : "text-fg-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Add custom checklist"
        title="Add custom checklist"
        onClick={() => setTab(add())}
        className="flex size-control shrink-0 items-center justify-center self-center rounded-sm text-fg-secondary hover:bg-inset hover:text-fg focus-visible:bg-inset focus-visible:text-fg"
      >
        <Icon name="plus" size={18} />
      </button>
      <p className="ml-auto shrink-0 self-center whitespace-nowrap t-data-telemetry text-fg-muted">{meta}</p>
    </header>
  );

  const shared = { className: CARD, header, delay };
  let panel;
  if (active === "pre") {
    panel = (
      <ChecklistPanel
        key="pre"
        {...shared}
        title="Pre-EVA checklist"
        blocks={PRE_EVA_BLOCKS}
        done={done.pre}
        current
        signature
        onToggle={(id) => toggle("pre", id)}
      />
    );
  } else if (active === "during") {
    panel = (
      <ChecklistPanel
        key="during"
        {...shared}
        title="During-EVA checklist"
        blocks={DURING_EVA_BLOCKS}
        done={done.during}
        metaSuffix={`starts ${TIMELINE.startLabel}`}
        onToggle={(id) => toggle("during", id)}
      />
    );
  } else if (active === "post") {
    panel = (
      <ChecklistPanel
        key="post"
        {...shared}
        title="Post-EVA checklist"
        blocks={POST_EVA_BLOCKS}
        done={done.post}
        onToggle={(id) => toggle("post", id)}
      />
    );
  } else {
    panel = (
      <ChecklistPanel
        key={active}
        {...shared}
        title={tabs.find((t) => t.id === active)?.label ?? "Custom checklist"}
        blocks={[]}
        done={NONE_DONE}
        emptyText="No items yet. Add them from the sidebar."
        onToggle={() => {}}
      />
    );
  }

  return (
    <div id="hub-checklist-panel" role="tabpanel" aria-labelledby={`hub-tab-${active}`} className="size-full">
      {panel}
    </div>
  );
}

/** Left rail for customizing the checklists and mission timeline. Empty for now. */
function HubSidebar() {
  return (
    <aside aria-label="Customize" className={cn("flex size-full min-h-0 flex-col", CARD)}>
      <CardHeader title="Customize" />
      <ScrollArea className="min-h-0 flex-1" aria-label="Customize options" />
    </aside>
  );
}

/**
 * 01 · Mission Hub (Pre-EVA): a full-height customize sidebar, then the
 * tabbed checklists, the hold criteria and the During-EVA timeline, all in
 * one resizable frame. Every panel scrolls on its own.
 */
export function HubScreen() {
  const wide = useWide();
  const group = motionMs("stagger-group");
  const ticks = Array.from({ length: TIMELINE.minutes / TIMELINE.tickEvery + 1 }, (_, i) => i * TIMELINE.tickEvery);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-lg md:p-xl">
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel id="hub-sidebar" defaultSize="18%" minSize={200}>
          <HubSidebar />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel id="hub-main" defaultSize="82%" minSize="40%">
          <div className="flex size-full min-h-0 flex-col gap-lg pl-lg">
            <MissionStatusStrip className="shrink-0" />
            <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
              <ResizablePanel id="hub-checklists" defaultSize="70%" minSize={wide ? 160 : 240}>
                <ResizablePanelGroup key={wide ? "row" : "stack"} orientation={wide ? "horizontal" : "vertical"}>
                  <ResizablePanel id="hub-lists" defaultSize="72%" minSize="30%">
                    <ChecklistTabs delay={group} />
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel id="hub-hold" defaultSize="28%" minSize="14%">
                    <HoldPanel className={CARD} delay={group * 2} />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel id="hub-timeline" defaultSize="30%" minSize={96}>
                <section className={cn("flex size-full min-h-0 flex-col", CARD)}>
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
