import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** shadcn/ui Badge. `status` is the Figma "Status Chip", `tag` the "Map Tag". */
const badgeVariants = cva("inline-flex shrink-0 items-center whitespace-nowrap rounded-pill border", {
  variants: {
    variant: {
      status: "gap-sm border-transparent bg-inset px-md py-[6px] t-body-s text-fg",
      tag: "border-line-subtle bg-scrim px-md py-xs t-data-telemetry text-fg",
      marker: "gap-sm border-transparent bg-scrim px-sm py-xs t-data-telemetry text-fg",
    },
  },
  defaultVariants: { variant: "status" },
});

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
