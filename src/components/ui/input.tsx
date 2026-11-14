import * as React from "react";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/marswalk/icons";

/** shadcn/ui Input as the Figma "Search Field": white pill, icon at the right. */
function SearchInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <label
      data-slot="search-field"
      className={cn(
        "flex h-control items-center gap-sm rounded-pill bg-fg px-lg text-panel focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand",
        className,
      )}
    >
      <input
        type="search"
        className="min-w-px flex-1 appearance-none bg-transparent t-body-m text-panel outline-none placeholder:text-panel [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      <Icon name="search" size={18} />
    </label>
  );
}

export { SearchInput };
