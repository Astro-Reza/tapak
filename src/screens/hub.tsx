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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SimpleTooltip, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChecklistPanel } from "@/components/marswalk/checklist-panel";
import { HoldPanel } from "@/components/marswalk/hold-panel";
import { ChecklistSkeleton, HoldPanelSkeleton, TimelineSkeleton } from "@/components/marswalk/hub-skeletons";
import { Icon } from "@/components/marswalk/icons";
import { Brackets, TimelineBar } from "@/components/marswalk/primitives";
import { useToast } from "@/components/marswalk/toaster";
import { POST_EVA_BLOCKS, PRE_EVA_BLOCKS, type ChecklistBlock } from "@/data/eva-checklist";
import { DURING_EVA, TIMELINE } from "@/data/mission";
import { MARS_MISSION_PRESETS, type MissionPreset } from "@/data/mission-presets";
import type { Mode, PolicyId, ScienceId } from "@/engine";
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
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Add custom checklist"
            onClick={() => setTab(add())}
            className="flex size-control shrink-0 items-center justify-center self-center rounded-sm text-fg-secondary hover:bg-inset hover:text-fg focus-visible:bg-inset focus-visible:text-fg"
          >
            <Icon name="plus" size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Add custom checklist</TooltipContent>
      </Tooltip>
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

function HubSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { link } = useMission();
  const { resetList } = useStore();
  const toast = useToast();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
  );
}

function PresetSettingsDialog({
  preset,
  open,
  onOpenChange,
  onSave,
}: {
  preset: MissionPreset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: MissionPreset) => void;
}) {
  const [mode, setMode] = useState<Mode>("balanced");
  const [policyId, setPolicyId] = useState<PolicyId>("engine");
  const [scienceId, setScienceId] = useState<ScienceId>("app-50kg");
  const [startLmst, setStartLmst] = useState<number>(9);

  useEffect(() => {
    if (preset) {
      setMode(preset.mode);
      setPolicyId(preset.policyId);
      setScienceId(preset.scienceId);
      setStartLmst(preset.startLmst);
    }
  }, [preset]);

  if (!preset) return null;

  const handleSave = () => {
    onSave({
      ...preset,
      mode,
      policyId,
      scienceId,
      startLmst,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px]">
        <DialogTitle>Preset settings · {preset.id}</DialogTitle>
        <DialogDescription>
          Configure mission rules, route mode, and simulation parameters for {preset.name}.
        </DialogDescription>

        <div className="flex flex-col gap-lg py-md">
          <div className="flex flex-col gap-xs">
            <p className="t-data-telemetry text-fg-muted">Route mode</p>
            <div className="grid grid-cols-3 gap-xs">
              {(["efficient", "balanced", "safest"] as Mode[]).map((m) => (
                <Button
                  key={m}
                  variant={mode === m ? "primary" : "secondary"}
                  size="control"
                  className="h-8 text-xs capitalize"
                  onClick={() => setMode(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-xs border-t border-line-subtle pt-md">
            <p className="t-data-telemetry text-fg-muted">Mission rules</p>
            <div className="grid grid-cols-3 gap-xs">
              {(
                [
                  { id: "engine", label: "Engine rules" },
                  { id: "hold-sheet", label: "Hold criteria" },
                  { id: "none", label: "No rules" },
                ] as { id: PolicyId; label: string }[]
              ).map((p) => (
                <Button
                  key={p.id}
                  variant={policyId === p.id ? "primary" : "secondary"}
                  size="control"
                  className="h-8 text-xs"
                  onClick={() => setPolicyId(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-xs border-t border-line-subtle pt-md">
            <p className="t-data-telemetry text-fg-muted">Start LMST</p>
            <div className="flex items-center gap-sm">
              <Button
                variant="secondary"
                size="control"
                className="h-8 text-xs"
                disabled={startLmst <= 7}
                onClick={() => setStartLmst((h) => Math.max(7, h - 1))}
              >
                −1 h
              </Button>
              <p className="min-w-0 flex-1 text-center t-data-coordinate text-fg">
                {startLmst}:00 LMST
              </p>
              <Button
                variant="secondary"
                size="control"
                className="h-8 text-xs"
                disabled={startLmst >= 15}
                onClick={() => setStartLmst((h) => Math.min(15, h + 1))}
              >
                +1 h
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-sm border-t border-line-subtle pt-sm">
          <Button
            variant="secondary"
            size="control"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="control"
            className="flex-1"
            onClick={handleSave}
          >
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Left rail for customizing the checklists and mission presets.
 * Supports searching and opening presets of the Mars mission, with settings access at the bottom.
 */
function HubSidebar({
  onToggle,
  onOpenSettings,
  onOpenPreset,
}: {
  onToggle?: () => void;
  onOpenSettings?: () => void;
  onOpenPreset?: (preset: MissionPreset) => void;
}) {
  const { update } = useMission();
  const toast = useToast();
  const [presets, setPresets] = useState<MissionPreset[]>(MARS_MISSION_PRESETS);
  const [search, setSearch] = useState("");
  const [activePresetId, setActivePresetId] = useState<string>("EVA-07");
  const [controlledPresetId, setControlledPresetId] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<MissionPreset | null>(null);

  const filtered = presets.filter((p) => {
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

  const handlePresetClick = (preset: MissionPreset) => {
    if (preset.id === activePresetId) {
      setControlledPresetId(null);
      return;
    }
    setControlledPresetId((curr) => (curr === preset.id ? null : preset.id));
  };

  const openPreset = (preset: MissionPreset) => {
    setActivePresetId(preset.id);
    setControlledPresetId(null);
    update({
      mode: preset.mode,
      policyId: preset.policyId,
      scienceId: preset.scienceId,
      startLmst: preset.startLmst,
    });
    onOpenPreset?.(preset);
  };

  const handleDeletePreset = (preset: MissionPreset) => {
    setPresets((list) => list.filter((p) => p.id !== preset.id));
    if (controlledPresetId === preset.id) {
      setControlledPresetId(null);
    }
    toast(`Preset deleted: ${preset.id} · ${preset.name}`);
  };

  const handleSavePresetSettings = (updated: MissionPreset) => {
    setPresets((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    if (activePresetId === updated.id) {
      update({
        mode: updated.mode,
        policyId: updated.policyId,
        scienceId: updated.scienceId,
        startLmst: updated.startLmst,
      });
    }
    toast(`Preset updated: ${updated.id}`);
  };

  return (
    <aside aria-label="EVA presets" className={cn("flex size-full min-h-0 flex-col bg-panel", CARD)}>
      <CardHeader
        title="EVA presets"
        meta={
          onToggle ? (
            <SimpleTooltip content="Collapse sidebar" side="right">
              <button
                type="button"
                onClick={onToggle}
                className="flex size-control items-center justify-center rounded-sm text-fg-secondary transition-colors hover:text-fg hover:bg-inset select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                aria-label="Collapse sidebar"
              >
                <Icon name="sidebar" size={18} />
              </button>
            </SimpleTooltip>
          ) : null
        }
      />

      {/* Themed quiet search bar */}
      <div className="shrink-0 border-b border-line-subtle p-md">
        <label
          data-slot="preset-search"
          className="flex h-control items-center gap-sm rounded-sm border border-line-subtle bg-inset px-md text-fg-muted transition-colors focus-within:border-brand/70 focus-within:text-fg"
        >
          <Icon name="search" size={16} className="shrink-0 text-fg-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search presets"
            aria-label="Search Mars mission presets"
            className="min-w-px flex-1 appearance-none bg-transparent t-body-s text-fg outline-none placeholder:text-fg-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <SimpleTooltip content="Clear search" side="top">
              <button
                type="button"
                onClick={() => setSearch("")}
                className="flex size-sm items-center justify-center text-fg-muted transition-colors hover:text-fg select-none"
                aria-label="Clear search"
              >
                <Icon name="close" size={14} />
              </button>
            </SimpleTooltip>
          ) : null}
        </label>
      </div>

      {/* Preset list with simple line dividers */}
      <ScrollArea className="min-h-0 flex-1" aria-label="EVA presets">
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
              const isControlled = controlledPresetId === preset.id;

              return (
                <div
                  key={preset.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlePresetClick(preset)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handlePresetClick(preset);
                    }
                  }}
                  className={cn(
                    "group relative flex w-full flex-col justify-between gap-xs px-lg py-md text-left transition-colors select-none cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand overflow-hidden",
                    isActive
                      ? "bg-inset/70 text-fg cursor-default"
                      : isControlled
                        ? "bg-inset/40 text-fg pr-[96px]"
                        : "text-fg-secondary hover:bg-inset/30 hover:text-fg",
                  )}
                >
                  {isActive ? <Brackets /> : null}

                  {/* Preset Content */}
                  <div className="flex min-w-0 flex-col gap-xs">
                    <div className="flex items-center justify-between gap-sm">
                      <div className="flex items-center gap-xs">
                        <span className={cn("t-label-s font-semibold", isActive ? "text-brand" : "text-fg")}>
                          {preset.id}
                        </span>
                        <span className="text-fg-muted">·</span>
                        <span className="t-data-telemetry text-fg-muted">Sol {preset.sol}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isActive ? (
                          <span className="flex items-center gap-1 t-caption font-medium text-brand">
                            <span className="size-1.5 rounded-pill bg-brand" />
                            Active
                          </span>
                        ) : isControlled ? null : (
                          <span className="t-caption text-fg-muted">{preset.status}</span>
                        )}
                      </div>
                    </div>

                    <span className="t-label-m font-medium text-fg truncate">{preset.name}</span>

                    <p className={cn("t-body-s text-fg-secondary", isControlled ? "truncate" : "line-clamp-2")}>
                      {preset.summary}
                    </p>

                    <div className="flex items-center gap-xs pt-xs t-data-telemetry text-fg-muted">
                      <span className="capitalize">{preset.mode}</span>
                      <span>·</span>
                      <span className="tabular-nums">{preset.distanceKm.toFixed(2)} km</span>
                      <span>·</span>
                      <span className="tabular-nums">{preset.durationLabel}</span>
                    </div>
                  </div>

                  {/* Side control menu consuming the complete right side from top to bottom */}
                  {isControlled ? (
                    <div
                      className="mw-slide-in-right absolute inset-y-0 right-0 z-10 flex w-[88px] flex-col border-l border-line-subtle bg-panel"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Top: Open button (colored red) */}
                      <button
                        type="button"
                        onClick={() => openPreset(preset)}
                        className="flex flex-1 items-center justify-center border-b border-line-subtle bg-brand text-canvas font-normal t-body-s transition-colors hover:brightness-110 active:brightness-95 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                        aria-label={`Open ${preset.id}`}
                      >
                        Open
                      </button>

                      {/* Middle: Settings button (plain) */}
                      <button
                        type="button"
                        onClick={() => setEditingPreset(preset)}
                        className="flex flex-1 items-center justify-center border-b border-line-subtle bg-transparent text-fg-secondary font-normal t-body-s transition-colors hover:text-fg hover:bg-inset active:bg-inset/80 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                        aria-label={`Settings for ${preset.id}`}
                      >
                        Settings
                      </button>

                      {/* Bottom: Delete button (delete button text is red) */}
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(preset)}
                        className="flex flex-1 items-center justify-center bg-transparent text-danger font-normal t-body-s transition-colors hover:bg-danger/10 active:bg-danger/20 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger"
                        aria-label={`Delete ${preset.id}`}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Preset Settings Dialog */}
      <PresetSettingsDialog
        preset={editingPreset}
        open={Boolean(editingPreset)}
        onOpenChange={(open) => !open && setEditingPreset(null)}
        onSave={handleSavePresetSettings}
      />

      {/* Bottom Settings Button - simple, no outer padding, no outline, brightens on hover */}
      <div className="shrink-0 border-t border-line-subtle">
        <SimpleTooltip content="Mission simulation & comms settings" side="top">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-control w-full items-center justify-center gap-sm text-fg-secondary transition-colors hover:text-fg hover:bg-inset/40 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            aria-label="Settings"
          >
            <Icon name="settings" size={18} />
            <span className="t-label-m">Settings</span>
          </button>
        </SimpleTooltip>
      </div>
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
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isDragging, setIsDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const group = motionMs("stagger-group");
  const ticks = Array.from({ length: TIMELINE.minutes / TIMELINE.tickEvery + 1 }, (_, i) => i * TIMELINE.tickEvery);

  const handleOpenPreset = (_preset: MissionPreset) => {
    setIsLoadingPreset(true);
    setTimeout(() => {
      setIsLoadingPreset(false);
    }, 750);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onPointerMove = (ev: PointerEvent) => {
      const newWidth = Math.min(520, Math.max(240, startWidth + (ev.clientX - startX)));
      setSidebarWidth(newWidth);
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div className="flex size-full min-h-0 overflow-hidden">
      {/* Sliding sidebar container: transitions width without remounting right-side panels */}
      <aside
        aria-label="EVA presets sidebar"
        className={cn(
          "relative h-full shrink-0 border-r border-line-subtle bg-panel overflow-hidden select-none",
          isDragging ? "transition-none" : "transition-[width] duration-200 ease-out",
        )}
        style={{
          width: sidebarOpen ? `${sidebarWidth}px` : "52px",
        }}
      >
        {/* Collapsed rail (fades in when closed) */}
        <div
          className={cn(
            "absolute inset-0 flex w-[52px] flex-col justify-between transition-opacity duration-150",
            sidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100",
          )}
        >
          <header className="flex shrink-0 items-center justify-center border-b border-line-subtle px-sm py-md">
            <SimpleTooltip content="Expand EVA presets" side="right">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex size-control items-center justify-center rounded-sm text-fg-secondary transition-colors hover:text-fg hover:bg-inset select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                aria-label="Open EVA presets"
              >
                <Icon name="sidebar" size={18} />
              </button>
            </SimpleTooltip>
          </header>

          <div className="min-h-0 flex-1" />

          <footer className="flex h-control shrink-0 items-center justify-center border-t border-line-subtle">
            <SimpleTooltip content="Settings" side="right">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex size-control items-center justify-center rounded-sm text-fg-secondary transition-colors hover:text-fg hover:bg-inset/40 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                aria-label="Settings"
              >
                <Icon name="settings" size={18} />
              </button>
            </SimpleTooltip>
          </footer>
        </div>

        {/* Expanded HubSidebar */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 h-full transition-opacity duration-150",
            sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          style={{ width: `${sidebarWidth}px` }}
        >
          <HubSidebar
            onToggle={() => setSidebarOpen(false)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPreset={handleOpenPreset}
          />
        </div>

        {/* Resizable handle on open sidebar right border */}
        {sidebarOpen ? (
          <div
            onPointerDown={handlePointerDown}
            className="group/handle absolute right-0 top-0 bottom-0 z-10 w-2 cursor-col-resize select-none"
            title="Drag to resize sidebar"
          >
            <div className="h-full w-px bg-transparent group-hover/handle:bg-brand group-active/handle:bg-brand transition-colors mx-auto" />
          </div>
        ) : null}
      </aside>

      {/* Main content on the right: stable, never unmounts, never re-animates */}
      <div className="min-w-0 flex-1 h-full overflow-hidden">
        <ResizablePanelGroup orientation="vertical" className="size-full min-h-0">
            <ResizablePanel id="hub-checklists" defaultSize="70%" minSize={wide ? 160 : 240}>
              <ResizablePanelGroup key={wide ? "row" : "stack"} orientation={wide ? "horizontal" : "vertical"}>
                <ResizablePanel id="hub-lists" defaultSize="72%" minSize="30%">
                  {isLoadingPreset ? <ChecklistSkeleton /> : <ChecklistTabs delay={group} />}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="hub-hold" defaultSize="28%" minSize="14%">
                  {isLoadingPreset ? <HoldPanelSkeleton /> : <HoldPanel className={CARD} delay={group * 2} />}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id="hub-timeline" defaultSize="30%" minSize={96}>
              {isLoadingPreset ? (
                <TimelineSkeleton />
              ) : (
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
                                <SimpleTooltip
                                  key={`${event.label}-${event.start}`}
                                  content={
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-semibold text-fg">{event.label}</span>
                                      <span className="t-data-telemetry text-fg-muted">
                                        {clockAfter(TIMELINE.startLabel, event.start)}
                                        {event.duration ? ` · ${event.duration} min` : ""}
                                        {` · track: ${track.name}`}
                                      </span>
                                    </div>
                                  }
                                  side="top"
                                >
                                  <TimelineBar
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
                                </SimpleTooltip>
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
                    </div>
                  </ScrollArea>
                </section>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

      <HubSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
