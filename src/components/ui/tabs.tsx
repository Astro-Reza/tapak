import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui Tabs as the Marswalk nav tab: equal columns on a hairline, the
 * selected tab one surface step up with the 3 px brand underline (`.mw-tab`,
 * DESIGN-MOTION.md pattern 5). Panels appear on the first frame.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("grid auto-cols-fr grid-flow-col border-b border-line-subtle", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "mw-tab relative h-control cursor-pointer px-md t-body-s whitespace-nowrap select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("mw-reveal outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
