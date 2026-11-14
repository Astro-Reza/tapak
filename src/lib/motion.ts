import { useEffect, useState, type CSSProperties } from "react";

/**
 * Motion helpers. Durations live in src/styles/motion.css (from DESIGN-MOTION.md);
 * JS reads them from the CSS variables so nothing is hard-coded twice.
 */
export type MotionToken =
  | "tick"
  | "duration-flash"
  | "duration-micro"
  | "duration-short"
  | "duration-build"
  | "duration-exit"
  | "duration-wipe"
  | "duration-hold-confirm"
  | "duration-map-camera"
  | "duration-camera-fly"
  | "duration-toast-hold"
  | "stagger-item"
  | "stagger-group";

export function motionMs(token: MotionToken): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--motion-${token}`).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  // The CSS minifier may rewrite 2400ms as 2.4s, so honor the unit.
  return raw.endsWith("ms") ? value : value * 1000;
}

/** Delay after which a panel body may build: header wipe plus one tick. */
export function headerDelay(): number {
  return motionMs("duration-wipe") + motionMs("tick");
}

export function isReducedMotion(): boolean {
  return document.documentElement.dataset.motion === "reduced";
}

/** Sets <html data-motion="reduced"> from the OS setting or ?motion=reduced. */
export function initMotionPreference() {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const forced = new URLSearchParams(window.location.search).get("motion") === "reduced";
  const apply = () => {
    if (forced || query.matches) document.documentElement.dataset.motion = "reduced";
    else delete document.documentElement.dataset.motion;
  };
  apply();
  query.addEventListener("change", apply);
}

/** Inline style for a staggered build: --i is the reading-order index, --d an extra delay. */
export function stagger(index: number, delayMs = 0): CSSProperties {
  return { "--i": index, "--d": `${delayMs}ms` } as CSSProperties;
}

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/+=#";

/**
 * Text decode (pattern 8): resolves left to right from scrambled glyphs over
 * `ticks` ticks. For labels and headings only, never for numbers that carry meaning.
 */
export function useDecodedText(text: string, ticks = 6): string {
  const [step, setStep] = useState(() => (isReducedMotion() ? ticks : 0));

  useEffect(() => {
    if (isReducedMotion()) {
      setStep(ticks);
      return;
    }
    setStep(0);
    let current = 0;
    const id = window.setInterval(() => {
      current += 1;
      setStep(current);
      if (current >= ticks) window.clearInterval(id);
    }, motionMs("tick") || 50);
    return () => window.clearInterval(id);
  }, [text, ticks]);

  if (step >= ticks) return text;
  const resolved = Math.floor((text.length * step) / ticks);
  let out = text.slice(0, resolved);
  for (let i = resolved; i < text.length; i++) {
    const ch = text[i];
    out += ch === " " || ch === "·" ? ch : GLYPHS[(i * 7 + step * 13) % GLYPHS.length];
  }
  return out;
}
