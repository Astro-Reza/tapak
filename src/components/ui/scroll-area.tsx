import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui Scroll Area on Marswalk tokens: native scrolling with a thin
 * pill thumb that overlays the content instead of taking layout space.
 */
function ScrollArea({
  className,
  children,
  viewportClassName,
  fill = false,
  type = "auto",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportClassName?: string;
  /** Content column stretches to the panel height (charts that flex to fill), and scrolls only when taller. */
  fill?: boolean;
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type={type}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        // Radix wraps the content in a `display: table` div, which lets long
        // text push past the viewport; force it back to a block.
        className={cn(
          "size-full rounded-[inherit]",
          fill ? "[&>div]:!flex [&>div]:min-h-full [&>div]:flex-col" : "[&>div]:!block",
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "z-20 flex touch-none p-[2px] select-none",
        orientation === "vertical" && "h-full w-[10px]",
        orientation === "horizontal" && "h-[10px] flex-col",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-pill bg-line opacity-60 hover:opacity-100"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
