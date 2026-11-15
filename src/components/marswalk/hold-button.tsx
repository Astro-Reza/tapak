import { useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { isReducedMotion, motionMs } from "@/lib/motion";

type HoldState = "idle" | "holding" | "release";

/**
 * Hold to confirm (pattern 7) for committing actions. Press and hold: a 4 px
 * edge bar fills top to bottom over `hold-confirm`; releasing early snaps it
 * back in two steps. Keyboard and switch users get a confirm dialog instead.
 * Pass `danger` only when the action is genuinely dangerous.
 */
export function HoldButton({
  label,
  confirmTitle,
  confirmDescription,
  onConfirm,
  onShortPress,
  danger = false,
  size,
  className,
}: {
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  onConfirm: () => void;
  onShortPress?: () => void;
  danger?: boolean;
  size?: "glove" | "control" | "icon";
  className?: string;
}) {
  const [state, setState] = useState<HoldState>("idle");
  const [flash, setFlash] = useState(false);
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(100);
  const startedAt = useRef(0);

  const complete = () => {
    setFlash(true);
    window.setTimeout(() => {
      setFlash(false);
      setState("idle");
      onConfirm();
    }, motionMs("duration-flash"));
  };

  const start = (e: React.PointerEvent) => {
    if (e.button !== 0 || state !== "idle") return;
    if (isReducedMotion()) {
      setOpen(true);
      return;
    }
    startedAt.current = performance.now();
    setState("holding");
  };

  const cancel = () => {
    if (state !== "holding") return;
    const held = performance.now() - startedAt.current;
    const total = motionMs("duration-hold-confirm");
    setRemaining(Math.max(0, 100 - (held / total) * 100));
    setState("release");
    if (held < total / 4) onShortPress?.();
    window.setTimeout(() => setState("idle"), motionMs("duration-micro"));
  };

  return (
    <>
      <Button
        size={size}
        className={className}
        data-flash={flash}
        aria-description="Press and hold to confirm. With a keyboard, press Enter to open a confirmation."
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          // detail === 0 means the click came from the keyboard or assistive tech
          if (e.detail === 0) setOpen(true);
        }}
      >
        <span
          aria-hidden="true"
          className="mw-hold-bar"
          data-state={state}
          style={
            {
              "--hold-left": `${remaining}%`,
              "--hold-color": danger ? "var(--status-danger)" : undefined,
            } as CSSProperties
          }
          onAnimationEnd={() => {
            if (state === "holding") complete();
          }}
        />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{confirmTitle}</DialogTitle>
          <DialogDescription>{confirmDescription}</DialogDescription>
          <div className="flex gap-md">
            <DialogClose asChild>
              <Button variant="secondary" className="flex-1">
                Cancel
              </Button>
            </DialogClose>
            <Button
              className="flex-1"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {label}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
