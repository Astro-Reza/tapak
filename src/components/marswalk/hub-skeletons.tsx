import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LABEL_W = 140;

/**
 * Skeleton loading state for ChecklistTabs upon opening a preset.
 * Replicates the tab bar, progress strip, and checklist block item rows.
 */
export function ChecklistSkeleton() {
  return (
    <div className="relative flex size-full min-h-0 flex-col bg-panel overflow-hidden">
      {/* Centered tactical loading text */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div className="flex items-center gap-sm rounded-sm border border-line-subtle bg-canvas/90 px-xl py-md backdrop-blur-sm select-none">
          <span className="size-2 rounded-pill bg-brand mw-skeleton" />
          <span className="t-label-m text-fg font-medium">Loading Presets</span>
        </div>
      </div>

      {/* Tab bar header */}
      <header className="flex shrink-0 items-center gap-sm border-b border-line-subtle px-md py-md">
        <div className="flex items-center gap-xs">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
        <Skeleton className="size-control rounded-sm" />
        <Skeleton className="ml-auto h-4 w-32" />
      </header>

      {/* Progress line */}
      <div className="h-0.5 w-full bg-inset">
        <Skeleton className="h-full w-1/4 bg-brand/50" />
      </div>

      {/* Checklist items list */}
      <div className="flex-1 overflow-hidden p-md space-y-md opacity-40">
        {/* Block 1 */}
        <div className="space-y-sm">
          <Skeleton className="h-4 w-36 mb-xs" />
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex min-h-glove items-center gap-md rounded-sm border border-line-subtle/30 bg-inset/30 px-md py-sm"
            >
              <Skeleton className="size-5 shrink-0 rounded-xs" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <Skeleton className={cn("h-4", i % 2 === 0 ? "w-4/5" : "w-3/5")} />
                <Skeleton className="h-3 w-2/5 opacity-60" />
              </div>
              <Skeleton className="h-4 w-12 shrink-0 opacity-70" />
            </div>
          ))}
        </div>

        {/* Block 2 */}
        <div className="space-y-sm pt-xs">
          <Skeleton className="h-4 w-28 mb-xs" />
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex min-h-glove items-center gap-md rounded-sm border border-line-subtle/30 bg-inset/30 px-md py-sm"
            >
              <Skeleton className="size-5 shrink-0 rounded-xs" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <Skeleton className={cn("h-4", i === 1 ? "w-3/4" : "w-1/2")} />
              </div>
              <Skeleton className="h-4 w-10 shrink-0 opacity-70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton loading state for HoldPanel upon opening a preset.
 * Replicates limits header, summary line, and hold criteria cards.
 */
export function HoldPanelSkeleton() {
  return (
    <div className="flex size-full min-h-0 flex-col bg-panel">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-line-subtle px-lg py-md">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-16" />
      </header>

      {/* Meta summary line */}
      <div className="px-lg py-md border-b border-line-subtle/40">
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Criteria list */}
      <div className="flex-1 space-y-sm p-sm overflow-hidden">
        <div className="flex items-center justify-between py-xs px-md">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-6" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 rounded-sm border border-line-subtle/30 bg-inset/20 p-md"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="h-3 w-4/5 opacity-70" />
            <div className="flex items-center gap-sm pt-xs">
              <Skeleton className="h-1.5 flex-1 rounded-full" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton loading state for the During-EVA Timeline upon opening a preset.
 * Replicates timeline title, time ticks, track lanes, and summary cards.
 */
export function TimelineSkeleton() {
  return (
    <div className="flex size-full min-h-0 flex-col bg-panel">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-line-subtle px-lg py-md">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-44" />
      </header>

      <div className="flex-1 overflow-hidden p-md space-y-md">
        {/* Ticks header */}
        <div className="flex items-center gap-md">
          <div className="shrink-0" style={{ width: LABEL_W }} />
          <div className="flex flex-1 justify-between gap-sm">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="h-3 w-12" />
            ))}
          </div>
        </div>

        {/* Tracks */}
        {[1, 2, 3, 4].map((track) => (
          <div key={track} className="flex items-center gap-md">
            <Skeleton className="h-4 shrink-0" style={{ width: LABEL_W }} />
            <div className="relative h-9 min-w-0 flex-1 rounded-sm border border-line-subtle/30 bg-inset/30 overflow-hidden">
              <div
                className="mw-skeleton absolute top-1 bottom-1 rounded-xs bg-line-subtle/70"
                style={{
                  left: `${(track * 15) % 40}%`,
                  width: `${24 + track * 8}%`,
                }}
              />
            </div>
          </div>
        ))}

        {/* Bottom track schedule columns */}
        <div className="grid grid-cols-2 gap-md border-t border-line-subtle/40 pt-md sm:grid-cols-4 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((col) => (
            <div key={col} className="space-y-xs">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-28 opacity-70" />
              <Skeleton className="h-3 w-24 opacity-60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
