import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/marswalk/icons";

/**
 * shadcn/ui Checkbox as the Figma "Checklist Item" box.
 * Pending: empty border-default box. Active: text-primary outline.
 * Done: neutral filled box with a check (no accent, per DESIGN.md).
 */
function Checkbox({
  className,
  active = false,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & { active?: boolean }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-active={active}
      className={cn(
        "flex size-xl shrink-0 items-center justify-center overflow-hidden rounded-sm border-2 border-line",
        "data-[active=true]:border-fg",
        "data-[state=checked]:border data-[state=checked]:border-line-subtle data-[state=checked]:bg-inset",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="mw-flash-in flex size-full items-center justify-center text-fg">
        <Icon name="check" size={18} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
