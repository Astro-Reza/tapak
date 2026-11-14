import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { POLICY_PROFILES, SCIENCE_PROFILES, windowOptions, type Mode, type PolicyId, type ScienceId } from "@/engine";
import { cn } from "@/lib/utils";
import { useMission } from "./mission";
import { fmtLmst } from "./view";

/** Segmented control with glove-size (56 px) items. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-xs">
      <p className="t-data-telemetry text-fg-muted">{label}</p>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
        aria-label={label}
        className="flex w-full"
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className="h-auto min-h-control min-w-0 flex-1 px-sm py-xs whitespace-normal">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** Route mode, rules and suit profile, EVA start. Every assumption the plan depends on is visible here. */
export function PlanControls() {
  const { settings, update, busy, data, ev } = useMission();
  const win = data ? windowOptions(data.hourly, ev?.end?.t ?? 217) : null;
  const hours = win?.opts.map((o) => o.hour) ?? [];
  const i = hours.indexOf(settings.startLmst);
  return (
    <div className={cn("flex flex-col gap-sm", busy && "opacity-60")} aria-busy={busy}>
      <Segmented<Mode>
        label="Route mode"
        value={settings.mode}
        options={[
          { value: "efficient", label: "Efficient" },
          { value: "balanced", label: "Balanced" },
          { value: "safest", label: "Safest" },
        ]}
        onChange={(mode) => update({ mode })}
      />
      <Segmented<PolicyId>
        label="Mission rules (not yet agreed)"
        value={settings.policyId}
        options={Object.entries(POLICY_PROFILES).map(([value, p]) => ({ value: value as PolicyId, label: p.label }))}
        onChange={(policyId) => update({ policyId })}
      />
      <Segmented<ScienceId>
        label="Suit model (not yet agreed)"
        value={settings.scienceId}
        options={Object.entries(SCIENCE_PROFILES).map(([value, p]) => ({ value: value as ScienceId, label: p.label }))}
        onChange={(scienceId) => update({ scienceId })}
      />
      <div className="flex flex-col gap-xs">
        <p className="t-data-telemetry text-fg-muted">
          EVA start · MEDA daylight window{win?.best != null ? ` · warmest ${fmtLmst(win.best)}` : ""}
        </p>
        <div className="flex items-center gap-sm">
          <Button variant="secondary" aria-label="Earlier start" disabled={i <= 0} onClick={() => update({ startLmst: hours[i - 1] })}>
            −1 h
          </Button>
          <p className="min-w-0 flex-1 text-center t-data-coordinate text-fg">{fmtLmst(settings.startLmst)} LMST</p>
          <Button variant="secondary" aria-label="Later start" disabled={i < 0 || i >= hours.length - 1} onClick={() => update({ startLmst: hours[i + 1] })}>
            +1 h
          </Button>
        </div>
      </div>
      {settings.kSuit !== 1 ? (
        <div className="flex items-center gap-sm">
          <p className="min-w-0 flex-1 t-data-telemetry text-fg-secondary">k_suit {settings.kSuit.toFixed(3)} from debrief</p>
          <Button variant="secondary" onClick={() => update({ kSuit: 1 })}>
            Reset k_suit
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Loading / error state that keeps the screen layout. */
export function MissionGate({ children }: { children: ReactNode }) {
  const { data, result, error } = useMission();
  if (error) return <p role="alert" className="p-xl t-body-m text-danger">{error}</p>;
  if (!data || !result) return <p role="status" className="p-xl t-body-m text-fg-secondary">Loading Jezero terrain and planning the route…</p>;
  return <>{children}</>;
}
