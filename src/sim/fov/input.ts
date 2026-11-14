import { useEffect, useRef, useState, type RefObject } from "react";

import { clampPitch, type Look } from "./camera-rig.ts";
import { NO_MOVE, type MoveInput } from "./explore.ts";

/**
 * Layer 5 · input (desktop / tablet simulation only; the AR app reads the device pose instead).
 * Look input turns the head and never moves the body; move input is only read in Free Explore.
 * Look: drag (mouse or touch) on the 3D view, mouse look via pointer lock, arrow keys.
 * Move: W A S D (Shift = fast) or the on-screen pad.
 */

const DEG = Math.PI / 180;
const DRAG_RAD_PER_PX = 0.25 * DEG;
const LOCK_RAD_PER_PX = 0.12 * DEG;
const KEY_LOOK_RAD_S = 90 * DEG;

export type InputState = {
  look: Look;
  keys: Set<string>;
  /** on-screen pad, set by press-and-hold buttons */
  pad: MoveInput;
};

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Wires look drag, pointer lock and keys to `host`. Returns mutable input state (read every frame) and the lock flag. */
export function useFovInput(host: RefObject<HTMLElement | null>): { input: RefObject<InputState>; locked: boolean } {
  const input = useRef<InputState>({ look: { yaw: 0, pitch: 0 }, keys: new Set(), pad: { ...NO_MOVE } });
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const st = input.current;
    let drag: { id: number; x: number; y: number } | null = null;

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || drag || document.pointerLockElement === el) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    };
    const move = (e: PointerEvent) => {
      if (document.pointerLockElement === el) {
        st.look.yaw += e.movementX * LOCK_RAD_PER_PX;
        st.look.pitch = clampPitch(st.look.pitch - e.movementY * LOCK_RAD_PER_PX);
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      // grab-the-world: drag left turns you right, drag down tilts the view up (as in 360° viewers)
      st.look.yaw -= (e.clientX - drag.x) * DRAG_RAD_PER_PX;
      st.look.pitch = clampPitch(st.look.pitch + (e.clientY - drag.y) * DRAG_RAD_PER_PX);
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    const lockChange = () => setLocked(document.pointerLockElement === el);
    const keyDown = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(e.code)) {
        st.keys.add(e.code);
        if (e.code.startsWith("Arrow")) e.preventDefault(); // no page scroll
      }
    };
    const keyUp = (e: KeyboardEvent) => st.keys.delete(e.code);
    const blur = () => st.keys.clear();

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    document.addEventListener("pointerlockchange", lockChange);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      document.removeEventListener("pointerlockchange", lockChange);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
  }, [host]);

  return { input, locked };
}

/** Per frame: applies arrow-key look and returns the combined move intent (keys + pad). */
export function readInput(st: InputState, dtSec: number): MoveInput {
  const k = st.keys;
  const turn = (k.has("ArrowRight") ? 1 : 0) - (k.has("ArrowLeft") ? 1 : 0);
  const tilt = (k.has("ArrowUp") ? 1 : 0) - (k.has("ArrowDown") ? 1 : 0);
  if (turn) st.look.yaw += turn * KEY_LOOK_RAD_S * dtSec;
  if (tilt) st.look.pitch = clampPitch(st.look.pitch + tilt * KEY_LOOK_RAD_S * dtSec);
  const forward = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0) + st.pad.forward;
  const right = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) + st.pad.right;
  return { forward, right, fast: k.has("ShiftLeft") || k.has("ShiftRight") || st.pad.fast };
}
