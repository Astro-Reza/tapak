import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui Button, restyled with Marswalk tokens (Figma component "Button").
 * Motion comes from `.mw-btn` in motion.css: hover underline then brand fill,
 * one-tick inverse flash on press.
 */
const buttonVariants = cva(
  "mw-btn inline-flex shrink-0 items-center justify-center gap-sm overflow-hidden rounded-sm t-label-m whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-canvas",
        secondary: "border border-line text-fg",
        ghost: "text-fg",
        map: "bg-fg text-panel",
      },
      size: {
        glove: "h-glove px-xl",
        control: "h-control px-lg",
        icon: "size-control",
      },
    },
    defaultVariants: { variant: "primary", size: "glove" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({ className, variant = "primary", size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
