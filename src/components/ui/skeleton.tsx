import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Tactical skeleton loader following Marswalk instrument design.
 * Pulses with stepped frames in steps(4, jump-end).
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("mw-skeleton rounded-sm bg-inset", className)}
      {...props}
    />
  );
}

export { Skeleton };
