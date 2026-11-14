import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** shadcn/ui Dialog. Used as the non-hold alternative for hold-to-confirm actions. */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="mw-reveal fixed inset-0 z-50 bg-scrim" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "mw-flash-in fixed top-1/2 left-1/2 z-50 flex w-[420px] max-w-[calc(100vw-var(--spacing-2xl))] -translate-x-1/2 -translate-y-1/2 flex-col gap-lg rounded-sm border border-line-subtle bg-panel p-xl text-fg",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("t-heading-m text-fg", className)} {...props} />;
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("t-body-s text-fg-secondary", className)} {...props} />
  );
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription };
