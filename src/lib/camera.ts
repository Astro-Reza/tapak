import { isReducedMotion, motionMs } from "./motion";

/**
 * Smooth camera motion for the 3D views (DESIGN_MOTION.md: the map camera is
 * the one place that eases). The curve and durations come from the CSS tokens
 * `--motion-easing-map`, `--motion-duration-map-camera` and
 * `--motion-duration-camera-fly`, so the 2D map and the 3D views move alike.
 */

/** cubic-bezier(x1, y1, x2, y2) as a function of progress 0..1. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-5) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

let cached: { raw: string; fn: (x: number) => number } | null = null;
/** The map easing token as a function. */
export function mapEase(x: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--motion-easing-map").trim();
  if (!cached || cached.raw !== raw) {
    const n = raw.match(/-?\d*\.?\d+/g)?.map(Number);
    cached = { raw, fn: n && n.length === 4 ? bezier(n[0], n[1], n[2], n[3]) : (t) => t };
  }
  return cached.fn(x);
}

/** Duration for a camera step (zoom, a glide to the next position). */
export const stepMs = () => motionMs("duration-map-camera");
/** Duration for a long flight (center, fly-to). */
export const flyMs = () => motionMs("duration-camera-fly");

/**
 * Runs `frame(eased 0..1)` each animation frame for `ms`. Returns a cancel
 * function; a cancelled run never calls `done`. With reduced motion, or a
 * zero duration, it jumps straight to the end state.
 */
export function tween(ms: number, frame: (t: number) => void, done?: () => void): () => void {
  if (ms <= 0 || isReducedMotion()) {
    frame(1);
    done?.();
    return () => {};
  }
  let raf = 0;
  let start = 0;
  const step = (now: number) => {
    start ||= now;
    const p = Math.min(1, (now - start) / ms);
    frame(mapEase(p));
    if (p < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
