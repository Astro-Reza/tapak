import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui Tooltip component styled for Marswalk.
 * Based on https://ui.shadcn.com/docs/components/radix/tooltip
 */

function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

const tooltipVariants = cva(
  "z-50 overflow-hidden rounded-md px-3 py-1.5 text-xs select-none shadow-md will-change-[transform,opacity] text-balance pointer-events-none " +
    "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 " +
    "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
  {
    variants: {
      variant: {
        default: "border border-line-subtle bg-panel text-fg",
        inverse: "bg-fg text-panel font-medium",
        brand: "bg-brand text-canvas font-medium",
        subtle: "border border-line-subtle bg-inset text-fg-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const arrowVariants = cva("z-50 size-2.5 rotate-45 rounded-[2px]", {
  variants: {
    variant: {
      default: "fill-panel border-r border-b border-line-subtle",
      inverse: "fill-fg",
      brand: "fill-brand",
      subtle: "fill-inset border-r border-b border-line-subtle",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface TooltipContentProps
  extends React.ComponentProps<typeof TooltipPrimitive.Content>,
    VariantProps<typeof tooltipVariants> {
  arrow?: boolean;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  variant = "default",
  arrow = false,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(tooltipVariants({ variant }), className)}
        {...props}
      >
        {children}
        {arrow ? (
          <TooltipPrimitive.Arrow
            data-slot="tooltip-arrow"
            className={cn(arrowVariants({ variant }))}
          />
        ) : null}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/**
 * Convenience universal helper component for simple tooltips across the repo.
 * Usage:
 *   <SimpleTooltip content="Helpful hint">
 *     <Button>Hover me</Button>
 *   </SimpleTooltip>
 */
export interface SimpleTooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
  delayDuration?: number;
  asChild?: boolean;
  arrow?: boolean;
  variant?: VariantProps<typeof tooltipVariants>["variant"];
  disabled?: boolean;
}

function SimpleTooltip({
  content,
  children,
  side = "top",
  align = "center",
  sideOffset = 6,
  className,
  delayDuration,
  asChild = true,
  arrow = false,
  variant = "default",
  disabled = false,
}: SimpleTooltipProps) {
  if (disabled || !content) return children;

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={className}
        arrow={arrow}
        variant={variant}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  SimpleTooltip,
  tooltipVariants,
};
