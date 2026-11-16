import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brackets } from "@/components/marswalk/primitives";
import { isReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useTour } from "./tour-context";

interface TargetRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const CARD_WIDTH = 380;
const CARD_HEIGHT = 290; // initial guess; the real height is measured at runtime
const TARGET_PADDING = 6;
const GAP = 16;

function getRootZoom(): number {
  if (typeof document === "undefined") return 1;
  const root = document.getElementById("root");
  if (!root) return 1;
  const zoomStr = window.getComputedStyle(root).zoom;
  const parsed = parseFloat(zoomStr);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function TourOverlay() {
  const {
    activeStep,
    isActive,
    isInterrupted,
    stepIndexInScreen,
    totalStepsInScreen,
    nextStep,
    prevStep,
    skipScreenTour,
    skipAllTours,
  } = useTour();

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [, setViewport] = useState({ w: 1024, h: 768 });
  const [cardHeight, setCardHeight] = useState(CARD_HEIGHT);
  const cardRef = useRef<HTMLDivElement>(null);

  // Measure target element position
  const measureTarget = () => {
    if (!activeStep || !activeStep.targetSelector) {
      setTargetRect((prev) => (prev === null ? prev : null));
      return;
    }

    const el = document.querySelector(activeStep.targetSelector);
    if (!el) {
      setTargetRect((prev) => (prev === null ? prev : null));
      return;
    }

    const r = el.getBoundingClientRect();
    const zoom = getRootZoom();

    // Divide viewport coordinates by zoom factor because overlay is mounted inside #root
    const next: TargetRect = {
      left: r.left / zoom - TARGET_PADDING,
      top: r.top / zoom - TARGET_PADDING,
      width: r.width / zoom + TARGET_PADDING * 2,
      height: r.height / zoom + TARGET_PADDING * 2,
      right: r.right / zoom + TARGET_PADDING,
      bottom: r.bottom / zoom + TARGET_PADDING,
    };
    setTargetRect((prev) =>
      prev &&
      Math.abs(prev.left - next.left) < 0.5 &&
      Math.abs(prev.top - next.top) < 0.5 &&
      Math.abs(prev.width - next.width) < 0.5 &&
      Math.abs(prev.height - next.height) < 0.5
        ? prev
        : next
    );
  };

  useLayoutEffect(() => {
    if (!isActive || !activeStep) {
      setTargetRect(null);
      return;
    }

    // Measure now, then track the target every frame: targets can sit inside
    // animating drawers/sheets, so fixed-delay retries end up stale. State only
    // updates when the rect actually changes (see measureTarget).
    measureTarget();

    let raf = 0;
    const measure = () => {
      measureTarget();
      // Use the card's real height (it varies with copy length and the glove-size
      // buttons) so placement/clamping never lets it overflow the viewport.
      const h = cardRef.current?.offsetHeight;
      if (h) setCardHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
    };
    const frame = () => {
      measure();
      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    // rAF is paused while the page is not being painted (background tab / hidden
    // pane); keep a slow timer so the spotlight still catches up.
    const interval = window.setInterval(measure, 150);

    const onResize = () => {
      setViewport({
        w: window.innerWidth / getRootZoom(),
        h: window.innerHeight / getRootZoom(),
      });
      measureTarget();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", measureTarget, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(interval);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [isActive, activeStep]);

  if (!isActive || !activeStep || isSafetyInterruptedSafe(isInterrupted)) {
    return null;
  }

  const isReduced = typeof document !== "undefined" && isReducedMotion();
  const zoom = getRootZoom();
  const viewportW = (typeof window !== "undefined" ? window.innerWidth : 1024) / zoom;
  const viewportH = (typeof window !== "undefined" ? window.innerHeight : 768) / zoom;

  // Calculate tip card position adjacent to target without obscuring it
  let cardStyle: CSSProperties;
  if (!targetRect || !activeStep.targetSelector) {
    // Step 1: Centered modal card
    cardStyle = {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: `${CARD_WIDTH}px`,
      zIndex: 60,
    };
  } else {
    // Candidate placements: bottom -> top -> right -> left
    const fitsBottom = targetRect.bottom + GAP + cardHeight <= viewportH - 16;
    const fitsTop = targetRect.top - GAP - cardHeight >= 16;
    const fitsRight = targetRect.right + GAP + CARD_WIDTH <= viewportW - 16;
    const fitsLeft = targetRect.left - GAP - CARD_WIDTH >= 16;

    let posX = 0;
    let posY = 0;

    if (fitsBottom) {
      posY = targetRect.bottom + GAP;
      posX = Math.max(16, Math.min(viewportW - CARD_WIDTH - 16, targetRect.left + (targetRect.width - CARD_WIDTH) / 2));
    } else if (fitsTop) {
      posY = targetRect.top - GAP - cardHeight;
      posX = Math.max(16, Math.min(viewportW - CARD_WIDTH - 16, targetRect.left + (targetRect.width - CARD_WIDTH) / 2));
    } else if (fitsRight) {
      posX = targetRect.right + GAP;
      posY = Math.max(16, Math.min(viewportH - cardHeight - 16, targetRect.top + (targetRect.height - cardHeight) / 2));
    } else if (fitsLeft) {
      posX = targetRect.left - GAP - CARD_WIDTH;
      posY = Math.max(16, Math.min(viewportH - cardHeight - 16, targetRect.top + (targetRect.height - cardHeight) / 2));
    } else {
      // Fallback: place below or clamped
      posY = Math.max(16, Math.min(viewportH - cardHeight - 16, targetRect.bottom + GAP));
      posX = Math.max(16, Math.min(viewportW - CARD_WIDTH - 16, targetRect.left));
    }

    cardStyle = {
      position: "fixed",
      left: `${posX}px`,
      top: `${posY}px`,
      width: `${CARD_WIDTH}px`,
      zIndex: 60,
    };
  }

  const isFirst = stepIndexInScreen === 1;
  const isLast = stepIndexInScreen === totalStepsInScreen;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Onboarding tour: ${activeStep.title}`}
      className={cn(
        // Above portaled drawers/dialogs (z-50), which mount later in the DOM.
        "fixed inset-0 z-[100] pointer-events-auto select-none",
        isReduced ? "transition-opacity duration-100" : "transition-opacity duration-200"
      )}
      data-testid="tour-overlay"
    >
      {/* SVG Mask Cutout over target area */}
      <svg
        className="fixed inset-0 size-full pointer-events-none"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <mask id="marswalk-tour-spotlight-mask">
            {/* White background: dim everything */}
            <rect width="100%" height="100%" fill="white" />
            {/* Black cutout: keeps target element bright */}
            {targetRect ? (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx={6}
                ry={6}
                fill="black"
              />
            ) : null}
          </mask>
        </defs>
        {/* Dark dim overlay (85% black) with mask */}
        <rect
          width="100%"
          height="100%"
          fill="#000000"
          fillOpacity={0.85}
          mask="url(#marswalk-tour-spotlight-mask)"
        />
      </svg>

      {/* Signature Marswalk Corner Brackets over the spotlight target */}
      {targetRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[100]"
          style={{
            left: `${targetRect.left}px`,
            top: `${targetRect.top}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
          }}
          data-testid="tour-brackets"
        >
          <Brackets className="size-full" />
        </div>
      ) : null}

      {/* Floating Tip Card */}
      <div
        ref={cardRef}
        style={cardStyle}
        data-testid="tour-tip-card"
        className={cn(
          "flex flex-col gap-md rounded-sm border border-line-subtle bg-panel p-lg shadow-2xl pointer-events-auto",
          isReduced ? "animate-none" : "mw-reveal"
        )}
      >
        {/* Header: step counter and simulated badge */}
        <div className="flex items-center justify-between gap-sm">
          <span className="t-data-telemetry text-fg-muted" data-testid="tour-step-counter">
            {stepIndexInScreen} of {totalStepsInScreen}
          </span>
          {activeStep.simulated ? (
            <Badge
              variant="tag"
              data-testid="tour-simulated-badge"
              className="border border-line-subtle bg-scrim text-brand t-data-telemetry"
            >
              simulated
            </Badge>
          ) : null}
        </div>

        {/* Title & Body Copy (<25 words) */}
        <div className="flex flex-col gap-xs">
          <h2 className="t-heading-m text-fg" data-testid="tour-title">
            {activeStep.title}
          </h2>
          <p className="t-body-m text-fg-secondary" data-testid="tour-body">
            {activeStep.text}
          </p>
        </div>

        {/* Controls: Next, Back, Skip tour, and Skip all — all with min 56px touch targets */}
        <div className="flex flex-col gap-sm pt-xs border-t border-line-subtle">
          <div className="flex items-center justify-between gap-sm">
            <Button
              variant="secondary"
              size="glove"
              data-testid="tour-back-button"
              className="min-h-[56px] min-w-[56px] px-lg"
              disabled={isFirst}
              onClick={prevStep}
              aria-label="Previous step"
            >
              Back
            </Button>
            <div className="flex items-center gap-sm">
              <Button
                variant="ghost"
                size="glove"
                data-testid="tour-skip-button"
                className="min-h-[56px] min-w-[56px] px-lg text-fg-secondary hover:text-fg"
                onClick={skipScreenTour}
                aria-label="Skip tour for this screen"
              >
                Skip tour
              </Button>
              <Button
                variant="primary"
                size="glove"
                data-testid="tour-next-button"
                className="min-h-[56px] min-w-[56px] px-xl"
                onClick={nextStep}
                aria-label={isLast ? "Done" : "Next step"}
              >
                {isLast ? "Done" : "Next"}
              </Button>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="tour-skip-all-button"
              onClick={skipAllTours}
              className="min-h-[56px] min-w-[56px] px-md py-sm t-body-s text-fg-muted hover:text-danger cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand flex items-center justify-end"
              aria-label="Skip all tours permanently"
            >
              Skip all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isSafetyInterruptedSafe(val?: boolean): boolean {
  return Boolean(val);
}
