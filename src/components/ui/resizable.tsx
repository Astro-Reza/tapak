import * as React from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui Resizable (react-resizable-panels v4) on Marswalk tokens.
 * One bordered frame holds the panels; hairline separators replace the
 * gaps between single cards.
 */
function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof Group>) {
  return <Group data-slot="resizable-panel-group" className={cn("size-full", className)} {...props} />;
}

function ResizablePanel({ className, ...props }: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" className={cn("min-h-0 min-w-0", className)} {...props} />;
}

/**
 * The separator's aria-orientation is perpendicular to its group: a
 * horizontal group has vertical separators.
 */
function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & { withHandle?: boolean }) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "group/handle relative z-10 flex shrink-0 items-center justify-center bg-line-subtle outline-none",
        "w-px after:absolute after:inset-y-0 after:left-1/2 after:w-xl after:-translate-x-1/2",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full",
        "aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:inset-y-auto aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-xl aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        "data-[separator=hover]:bg-line data-[separator=active]:bg-fg focus-visible:bg-brand",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <span
          aria-hidden="true"
          className={cn(
            "z-10 h-[48px] w-[6px] shrink-0 rounded-pill border border-line-subtle bg-fg-muted",
            "group-aria-[orientation=horizontal]/handle:h-[6px] group-aria-[orientation=horizontal]/handle:w-[48px]",
            "group-data-[separator=active]/handle:bg-fg",
          )}
        />
      ) : null}
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
