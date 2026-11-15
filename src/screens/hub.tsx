import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChecklistPanel } from "@/components/marswalk/checklist-panel";
import { HoldPanel } from "@/components/marswalk/hold-panel";
import { Icon } from "@/components/marswalk/icons";
import { TimelineBar } from "@/components/marswalk/primitives";
import { useToast } from "@/components/marswalk/toaster";
import { POST_EVA_BLOCKS, PRE_EVA_BLOCKS, type ChecklistBlock } from "@/data/eva-checklist";
import { DURING_EVA, TIMELINE } from "@/data/mission";
import { MARS_MISSION_PRESETS, type MissionPreset } from "@/data/mission-presets";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { clockAfter, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { PlanControls } from "@/sim/controls";
import { useMission } from "@/sim/mission";

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

/**
 * Left rail for customizing the checklists and mission presets.
 * Supports searching and opening presets of the Mars mission, with settings access at the bottom.
 */
function HubSidebar({ onToggle }: { onToggle?: () => void }) {
  const { update, link } = useMission();
  const { resetList } = useStore();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [activePresetId, setActivePresetId] = useState<string>("EVA-07");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const filtered = MARS_MISSION_PRESETS.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.site.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) ||
      p.mode.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)) ||
      String(p.sol).includes(q)
    );
  });

  const openPreset = (preset: MissionPreset) => {
    setActivePresetId(preset.id);
    update({
      mode: preset.mode,
      policyId: preset.policyId,
      scienceId: preset.scienceId,
      startLmst: preset.startLmst,
    });
    toast(`Preset opened: ${preset.id} · ${preset.name}`);
  };

  return (
    <aside aria-label="EVA Presets" className={cn("flex size-full min-h-0 flex-col", CARD)}>
      <CardHeader
        title="EVA PRESETS"
        meta={
          onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              className="flex size-control items-center justify-center rounded-sm text-fg-secondary transition-colors hover:text-fg hover:bg-inset select-none"
              title="Close sidebar"
              aria-label="Close sidebar"
            >
              <Icon name="sidebar" size={18} />
            </button>
          ) : null
        }
      />

      {/* Search menu */}
      <div className="shrink-0 border-b border-line-subtle p-md">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search presets..."
          aria-label="Search Mars mission presets"
          className="h-control"
        />
      </div>

      {/* Preset list with simple line dividers */}
      <ScrollArea className="min-h-0 flex-1" aria-label="Customize presets">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-sm p-xl text-center">
            <p className="t-body-s text-fg-muted">No presets match &ldquo;{search}&rdquo;</p>
            <Button
              variant="secondary"
              size="control"
              className="h-7 px-sm t-caption"
              onClick={() => setSearch("")}
            >
              Clear search
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-line-subtle">
            {filtered.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
                <div
                  key={preset.id}
                  className={cn(
                    "mw-flash-in flex flex-col gap-xs px-lg py-md transition-colors",
                    isActive ? "bg-inset/50" : "hover:bg-inset/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-sm">
                    <div className="flex items-center gap-xs">
                      <span className="t-label-m font-semibold text-brand">{preset.id}</span>
                      <span className="text-fg-muted">·</span>
                      <span className="t-data-telemetry text-fg-muted">SOL {preset.sol}</span>
                    </div>
                    <span
                      className={cn(
                        "rounded-pill px-xs py-[1px] t-caption uppercase font-medium",
                        isActive
                          ? "border border-brand/50 bg-brand/20 text-brand"
                          : preset.status === "Ready"
                            ? "border border-safe/50 bg-safe/20 text-safe"
                            : "border border-line-subtle bg-inset text-fg-muted",
                      )}
                    >
                      {isActive ? "Active" : preset.status}
                    </span>
                  </div>

                  <h3 className="t-heading-s font-medium text-fg">{preset.name}</h3>

                  <p className="line-clamp-2 t-body-s text-fg-secondary">{preset.summary}</p>

                  <div className="flex items-center justify-between gap-sm pt-xs">
                    <div className="flex flex-wrap items-center gap-xs t-data-telemetry text-fg-muted">
                      <span className="capitalize">{preset.mode}</span>
                      <span>·</span>
                      <span>{preset.distanceKm.toFixed(2)} km</span>
                      <span>·</span>
                      <span>{preset.durationLabel}</span>
                    </div>
                    <Button
                      variant={isActive ? "primary" : "secondary"}
                      size="control"
                      className="min-w-[80px]"
                      onClick={() => openPreset(preset)}
                    >
                      {isActive ? "Opened" : "Open"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Bottom Settings Button - simple, no outer padding, no outline, brightens on hover */}
      <div className="shrink-0 border-t border-line-subtle">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex h-control w-full items-center justify-center gap-sm text-fg-secondary transition-colors hover:text-fg hover:bg-inset/40 select-none"
          aria-label="Settings"
        >
          <Icon name="settings" size={18} />
          <span className="t-label-m">Settings</span>
        </button>
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-[500px]">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure mission simulation rules, EVA telemetry parameters, and comms relay links.
          </DialogDescription>

          <div className="flex flex-col gap-lg py-md">
            <PlanControls />

            <div className="flex flex-col gap-xs border-t border-line-subtle pt-md">
              <p className="t-data-telemetry text-fg-muted">Comms relay · light-time latency</p>
              <div className="grid grid-cols-4 gap-xs">
                {[
                  { s: 0, label: "0 s (direct)" },
                  { s: 4, label: "4 s (sim)" },
                  { s: 20, label: "20 s (orbit)" },
                  { s: 400, label: "400 s (Earth)" },
                ].map(({ s, label }) => (
                  <Button
                    key={s}
                    variant={link.delayS === s ? "primary" : "secondary"}
                    size="control"
                    className="h-8 px-xs text-xs"
                    onClick={() => link.setDelay(s)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-xs border-t border-line-subtle pt-md">
              <p className="t-data-telemetry text-fg-muted">Checklist state</p>
              <div className="flex gap-sm">
                <Button
                  variant="secondary"
                  size="control"
                  className="h-8 flex-1 text-xs"
                  onClick={() => {
                    resetList("pre");
                    toast("Reset Pre-EVA checklist");
                  }}
                >
                  Reset Pre-EVA
                </Button>
                <Button
                  variant="secondary"
                  size="control"
                  className="h-8 flex-1 text-xs"
                  onClick={() => {
                    resetList("during");
                    toast("Reset During-EVA checklist");
                  }}
                >
                  Reset During-EVA
                </Button>
                <Button
                  variant="secondary"
                  size="control"
                  className="h-8 flex-1 text-xs"
                  onClick={() => {
                    resetList("post");
                    toast("Reset Post-EVA checklist");
                  }}
                >
                  Reset Post-EVA
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-line-subtle pt-sm">
            <DialogClose asChild>
              <Button variant="primary" size="control" className="w-full">
                Done
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const group = motionMs("stagger-group");
  const ticks = Array.from({ length: TIMELINE.minutes / TIMELINE.tickEvery + 1 }, (_, i) => i * TIMELINE.tickEvery);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-lg md:p-xl">
      <ResizablePanelGroup
        key={sidebarOpen ? "sidebar-open" : "sidebar-closed"}
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        {sidebarOpen ? (
          <>
            <ResizablePanel id="hub-sidebar" defaultSize={wide ? "22%" : "26%"} minSize={220}>
              <HubSidebar onToggle={() => setSidebarOpen(false)} />
            </ResizablePanel>

            <ResizableHandle withHandle />
          </>
        ) : null}

        <ResizablePanel id="hub-main" defaultSize={sidebarOpen ? (wide ? "78%" : "74%") : "100%"} minSize="40%">
          <div className={cn("flex size-full min-h-0 flex-col gap-lg", sidebarOpen ? "pl-lg" : "pl-0")}>
            {!sidebarOpen && (
              <div className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="flex h-control items-center gap-xs rounded-sm border border-line-subtle bg-panel px-md text-fg-secondary transition-colors hover:border-line hover:text-fg select-none"
                  title="Open EVA presets sidebar"
                  aria-label="Open EVA presets sidebar"
                >
                  <Icon name="sidebar" size={18} />
                  <span className="t-label-m">EVA PRESETS</span>
                </button>
              </div>
            )}
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
