import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

/**
 * The grab line floats over the top edge instead of taking a row, so a closed drawer can be a
 * single compact strip with its text centered.
 *
 * shadcn/ui Drawer (Radix Dialog under vaul) on Marswalk tokens. Slides up
 * from the bottom edge; only the grab handle drags it, so panels inside can
 * carry their own resize handles.
 */
function Drawer({ handleOnly = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" handleOnly={handleOnly} {...props} />;
}

const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerClose = DrawerPrimitive.Close;

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-0 z-50 bg-scrim", className)}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  overlay = true,
  onHandleClick,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  overlay?: boolean;
  /** Click on the grab line, for toggling the drawer open and closed. */
  onHandleClick?: () => void;
}) {
  return (
    <DrawerPrimitive.Portal>
      {overlay ? <DrawerOverlay /> : null}
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col border border-b-0 border-line-subtle bg-panel text-fg outline-none",
          className,
        )}
        {...props}
      >
        <div
          className="absolute top-0 left-1/2 z-10 flex h-[16px] w-[96px] -translate-x-1/2 cursor-pointer items-start justify-center pt-[4px]"
          onClick={onHandleClick}
        >
          <DrawerPrimitive.Handle
            aria-label="Drag or click to open and close"
            className="!my-0 !h-[4px] !w-[48px] shrink-0 !bg-fg-muted"
          />
        </div>
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex shrink-0 flex-wrap items-center justify-between gap-md px-lg py-md md:px-xl", className)}
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title className={cn("t-heading-m text-fg", className)} {...props} />;
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description className={cn("t-body-s text-fg-secondary", className)} {...props} />;
}

export { Drawer, DrawerTrigger, DrawerClose, DrawerOverlay, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription };
