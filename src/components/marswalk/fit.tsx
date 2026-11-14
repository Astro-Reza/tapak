import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { cn } from "@/lib/utils";

/**
 * Fixed-geometry drawings (charts, maps, the FoV scene) are authored in Figma
 * pixels. `Fit` scales such a design box into whatever space the responsive
 * layout gives it, so the geometry stays exact while the page reflows.
 */

export type FitMode = "contain" | "cover";
export type Size = { width: number; height: number };
export type FitBox = { scale: number; x: number; y: number; width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function computeFit(
  view: Size,
  design: Size,
  mode: FitMode,
  focus?: { x: number; y: number },
  limits: { min?: number; max?: number } = {},
): FitBox {
  const { width: W, height: H } = view;
  if (!W || !H) return { scale: 1, x: 0, y: 0, width: W, height: H };
  const sx = W / design.width;
  const sy = H / design.height;
  const s = clamp(mode === "cover" ? Math.max(sx, sy) : Math.min(sx, sy), limits.min ?? 0, limits.max ?? Infinity);
  const f = focus ?? { x: design.width / 2, y: design.height / 2 };
  // Center the box when it fits; otherwise keep the focus point centered
  // without uncovering an edge.
  const place = (viewSize: number, size: number, fp: number) => {
    const span = size * s;
    if (span <= viewSize) return (viewSize - span) / 2;
    return clamp(viewSize / 2 - fp * s, viewSize - span, 0);
  };
  return { scale: s, x: place(W, design.width, f.x), y: place(H, design.height, f.y), width: W, height: H };
}

/** Measures an element and returns how a design box fits into it. */
export function useFit<T extends HTMLElement = HTMLDivElement>(
  design: Size,
  mode: FitMode = "contain",
  focus?: { x: number; y: number },
  limits?: { min?: number; max?: number },
): [RefObject<T | null>, FitBox] {
  const ref = useRef<T>(null);
  const [view, setView] = useState<Size>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = el; // layout px, unaffected by page zoom
      setView((v) => (v.width === width && v.height === height ? v : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, computeFit(view, design, mode, focus, limits)];
}

/** The scaled design box. Children are laid out in design pixels. */
export function FitLayer({
  design,
  box,
  className,
  children,
}: {
  design: Size;
  box: FitBox;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("absolute top-0 left-0", className)}
      style={{
        width: design.width,
        height: design.height,
        transform: `translate(${box.x}px, ${box.y}px) scale(${box.scale})`,
        transformOrigin: "0 0",
        visibility: box.width ? undefined : "hidden",
      }}
    >
      {children}
    </div>
  );
}

/**
 * A box that scales its design-pixel children to fit. Give it a size through
 * `className` (an aspect ratio, a flex share or a fixed height).
 */
export function Fit({
  width,
  height,
  mode = "contain",
  focus,
  minScale,
  maxScale,
  className,
  children,
}: {
  width: number;
  height: number;
  mode?: FitMode;
  focus?: { x: number; y: number };
  minScale?: number;
  maxScale?: number;
  className?: string;
  children: ReactNode;
}) {
  const design = { width, height };
  const [ref, box] = useFit(design, mode, focus, { min: minScale, max: maxScale });
  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)}>
      <FitLayer design={design} box={box}>
        {children}
      </FitLayer>
    </div>
  );
}
