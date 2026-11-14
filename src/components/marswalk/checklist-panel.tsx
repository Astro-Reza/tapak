import { type CSSProperties } from "react";

import { CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  OWNER_KEY,
  flattenBlocks,
  nextOpenItem,
  progressOf,
  type ChecklistBlock,
  type ChecklistItem,
} from "@/data/eva-checklist";
import { headerDelay, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Brackets } from "./primitives";

/** Rows past this index build together, so a 41-item list does not crawl in. */
const MAX_STAGGER = 10;

/**
 * Checklist row with a pass condition under the title. At least one glove
 * target tall; grows with the text.
 */
function ChecklistRow({
  item,
  done,
  active,
  signature,
  onToggle,
  style,
}: {
  item: ChecklistItem;
  done: boolean;
  active: boolean;
  signature: boolean;
  onToggle: () => void;
  style?: CSSProperties;
}) {
  const id = `check-${item.id}`;
  const side = item.owner ?? item.tag;
  return (
    <li
      className={cn(
        "mw-flash-in relative flex min-h-glove items-start gap-md rounded-sm px-md py-md",
        active && "bg-inset",
      )}
      style={style}
    >
      <Checkbox id={id} checked={done} active={active} onCheckedChange={onToggle} className="mt-[2px]" />
      <label htmlFor={id} className="flex min-w-px flex-1 cursor-pointer flex-col gap-xs">
        <span className={cn("t-body-m", done ? "text-fg-secondary" : "text-fg")}>{item.title}</span>
        {item.detail ? (
          <span className={cn("t-body-s", done ? "text-fg-muted" : "text-fg-secondary")}>{item.detail}</span>
        ) : null}
      </label>
      {side || item.codes.length ? (
        <div className="flex shrink-0 flex-col items-end gap-xs pt-[2px] t-data-telemetry">
          {side ? (
            <span
              className="whitespace-nowrap text-fg-secondary"
              title={item.owner ? OWNER_KEY[item.owner] : undefined}
            >
              {side}
            </span>
          ) : null}
          {item.codes.length ? (
            <span className="whitespace-nowrap text-fg-muted">{item.codes.join(" · ")}</span>
          ) : null}
        </div>
      ) : null}
      {active && signature ? <Brackets key={item.id} /> : null}
    </li>
  );
}

/**
 * One checklist as a panel body (no card frame of its own): fixed header and
 * progress bar, then the blocks inside a scroll area with sticky block titles.
 */
export function ChecklistPanel({
  title,
  blocks,
  done,
  metaSuffix,
  signature = false,
  current = false,
  onToggle,
  className,
  delay = 0,
}: {
  title: string;
  blocks: ChecklistBlock[];
  done: ReadonlySet<string>;
  metaSuffix?: string;
  signature?: boolean;
  /** the list in progress: its first open step is the active one */
  current?: boolean;
  onToggle: (id: string) => void;
  className?: string;
  delay?: number;
}) {
  const { done: count, total } = progressOf(flattenBlocks(blocks), done);
  const activeId = current ? nextOpenItem(blocks, done)?.id : undefined;
  const meta = `${count}/${total}${count > 0 ? " done" : ""}${metaSuffix ? ` · ${metaSuffix}` : ""}`;
  const grouped = blocks.length > 1;
  let row = 0;

  return (
    <section className={cn("flex size-full min-h-0 min-w-0 flex-col", className)}>
      <CardHeader title={title} meta={meta} delay={delay} />
      <div className="flex shrink-0 px-lg py-md">
        <div
          role="progressbar"
          aria-label={`${title} progress`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={count}
          className="h-xs min-w-px flex-1 overflow-hidden rounded-pill bg-inset"
        >
          {/* Neutral fill: the accent is never used on progress bars */}
          <div className="h-full rounded-pill bg-fg" style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" aria-label={title}>
        {blocks.map((block, b) => {
          const part = progressOf(block.items, done);
          return (
            <section key={block.id} aria-label={block.title}>
              {grouped ? (
                <header className="sticky top-0 z-10 flex items-baseline gap-sm border-y border-line-subtle bg-canvas px-lg py-sm">
                  <h3 className="min-w-px flex-1 truncate t-body-s text-fg">
                    {b + 1}. {block.title}
                  </h3>
                  <p className="shrink-0 whitespace-nowrap t-data-telemetry text-fg-muted">
                    {block.when ? `${block.when} · ` : ""}
                    {part.done}/{part.total}
                  </p>
                </header>
              ) : null}
              <ul className="flex flex-col gap-xs p-sm">
                {block.items.map((item) => {
                  const i = Math.min(row++, MAX_STAGGER);
                  return (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      done={done.has(item.id)}
                      active={item.id === activeId}
                      signature={signature}
                      onToggle={() => onToggle(item.id)}
                      style={stagger(i, delay + headerDelay())}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })}
      </ScrollArea>
    </section>
  );
}
