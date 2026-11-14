import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui Card on Marswalk surfaces. Flat: depth comes from surface
 * lightness and a hairline, never from shadows.
 */
function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-line-subtle bg-panel text-fg",
        className,
      )}
      {...props}
    />
  );
}

/** Panel title bar (Figma "Panel Header"). Motion: header wipe. */
function CardHeader({
  title,
  meta,
  className,
  delay = 0,
  ...props
}: Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode;
  meta?: React.ReactNode;
  delay?: number;
}) {
  return (
    <header
      data-slot="card-header"
      className={cn(
        "mw-header-wipe flex shrink-0 items-center gap-sm border-b border-line-subtle px-lg py-md",
        className,
      )}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
      {...props}
    >
      <h2 className="min-w-px flex-1 t-label-m text-fg">{title}</h2>
      {meta ? <p className="shrink-0 whitespace-nowrap t-data-telemetry text-fg-muted">{meta}</p> : null}
    </header>
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("relative", className)} {...props} />;
}

export { Card, CardHeader, CardContent };
