import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { motionMs } from "@/lib/motion";
import { DecodeText } from "./primitives";

type Toast = { id: number; message: string; decode: boolean; leaving: boolean };
type ToastFn = (message: string, options?: { safety?: boolean }) => void;

const ToastContext = createContext<ToastFn>(() => {});

/** Status line (pattern 16). Comms or safety messages skip the text decode. */
export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback<ToastFn>((message, options) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, decode: !options?.safety, leaving: false }]);
    window.setTimeout(() => {
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      window.setTimeout(
        () => setToasts((list) => list.filter((t) => t.id !== id)),
        motionMs("duration-exit"),
      );
    }, motionMs("duration-toast-hold"));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-lg bottom-xl z-50 flex flex-col items-center gap-sm text-center"
      >
        {toasts.map((t) => (
          <p
            key={t.id}
            className={cn(
              "rounded-sm border border-line-subtle bg-panel px-lg py-md t-label-m text-fg",
              t.leaving ? "mw-collapse" : "mw-flash-in",
            )}
          >
            {t.decode ? <DecodeText text={t.message} ticks={3} /> : t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
