import type { CSSProperties } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { CommsToggle } from "@/components/marswalk/comms";
import { Fit } from "@/components/marswalk/fit";
import { Icon } from "@/components/marswalk/icons";
import { LayerRow, SatelliteMarker, WaypointDot } from "@/components/marswalk/map";
import {
  Brackets,
  MapTag,
  ScreenHeading,
  StatList,
  StatRow,
  StatusChip,
} from "@/components/marswalk/primitives";
import { BUDGETS, LINK, type Budget } from "@/data/mission";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

/* ---------- Sky dome ---------- */

/** Dome geometry in chart pixels: site at (440, 396), horizon to zenith = 360 px. */
const DOME = { cx: 440, cy: 396, r: 360, step: 3 };
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Point on the dome edge; `sweep` runs 0° (west horizon) over the zenith to 180°. */
const edge = (sweep: number) =>
  `${(DOME.cx - DOME.r * Math.cos(rad(sweep))).toFixed(2)} ${(DOME.cy - DOME.r * Math.sin(rad(sweep))).toFixed(2)}`;

const ELEVATION_LABELS = [
  { label: "0°", left: 51, top: 387.5 },
  { label: "0°", left: 815, top: 387.5 },
  { label: "15°", left: 62.02, top: 290.18 },
  { label: "15°", left: 799.98, top: 290.18 },
  { label: "30°", left: 98.68, top: 199.5 },
  { label: "30°", left: 760.32, top: 199.5 },
  { label: "45°", left: 159.39, top: 121.63 },
  { label: "45°", left: 699.61, top: 121.63 },
  { label: "60°", left: 238, top: 61.87 },
  { label: "60°", left: 620, top: 61.87 },
  { label: "75°", left: 330.63, top: 24.31 },
  { label: "75°", left: 528.37, top: 24.31 },
  { label: "90°", left: 429, top: 11.5 },
];

/**
 * Half-dome from horizon to zenith. Each 3° wedge is shaded on the link ramp by
 * the uplink margin at that elevation; below θmin it is shaded as outage, with a
 * dashed danger boundary. The live relay carries the signature brackets.
 */
function SkyDome({ className }: { className?: string }) {
  const wedges = Array.from({ length: 180 / DOME.step }, (_, i) => {
    const shade = LINK.wedgeShade[i < 30 ? i : 59 - i];
    return (
      <path
        key={i}
        d={`M${edge(i * DOME.step)}A${DOME.r} ${DOME.r} 0 0 1 ${edge((i + 1) * DOME.step)}L${DOME.cx} ${DOME.cy}Z`}
        fill={shade === null ? "var(--status-danger)" : "var(--data-link-high)"}
        opacity={shade ?? 0.22}
      />
    );
  });
  const spokes = Array.from({ length: 13 }, (_, i) => i * 15);
  const thetaMin = LINK.uplinkThetaMin;

  return (
    <Fit width={878} height={432} className={className}>
      <svg width={878} height={432} viewBox="0 0 878 432" fill="none" aria-hidden="true" className="absolute top-0 left-0">
        <path d={`M${edge(0)}A${DOME.r} ${DOME.r} 0 0 1 ${edge(180)}Z`} fill="var(--data-link-low)" />
      </svg>
      {/* margin wedges reveal with the layer scan */}
      <svg width={878} height={432} viewBox="0 0 878 432" fill="none" aria-hidden="true" className="mw-scan-in absolute top-0 left-0">
        {wedges}
      </svg>
      <svg width={878} height={432} viewBox="0 0 878 432" fill="none" aria-hidden="true" className="absolute top-0 left-0">
        <g opacity={0.18}>
          {spokes.map((sweep) => (
            <path key={sweep} d={`M${DOME.cx} ${DOME.cy}L${edge(sweep)}`} stroke="var(--text-primary)" />
          ))}
        </g>
        {[thetaMin, 180 - thetaMin].map((sweep) => (
          <path
            key={sweep}
            d={`M${DOME.cx} ${DOME.cy}L${edge(sweep)}`}
            stroke="var(--status-danger)"
            strokeWidth={2}
            strokeDasharray="6 5"
          />
        ))}
        {/* MRS-L1 pass track, max 29° */}
        <path
          d="M732.327 354.916C537.442 185.505 343.095 182.113 149.285 344.739"
          stroke="var(--text-primary)"
          strokeWidth={1.5}
          strokeDasharray="4 6"
          opacity={0.8}
        />
      </svg>

      {ELEVATION_LABELS.map((l) => (
        <span
          key={`${l.label}-${l.left}`}
          className="absolute whitespace-nowrap t-data-telemetry text-fg-secondary"
          style={{ left: l.left, top: l.top }}
        >
          {l.label}
        </span>
      ))}

      <MapTag className="absolute top-[352px] left-xl">
        θmin {thetaMin}° · below it the uplink does not close
      </MapTag>
      <span className="absolute top-[396px] left-0 h-(--stroke-default) w-full bg-fg-secondary" />

      <SatelliteMarker label="MRS-L1 · el 25°" style={{ left: 695.54, top: 257.24 }} />
      <Brackets className="top-[251.24px] left-[688.54px] size-[40px]" delay={motionMs("duration-build")} />

      <WaypointDot size={12} className="absolute top-[390px] left-[434px]" />
      <span className="absolute top-[408px] left-[387px] whitespace-nowrap t-data-telemetry text-fg-secondary">
        You · Jezero West
      </span>

      <LayerRow layer="link" active className="absolute top-xs left-[664px] w-[200px]" />
    </Fit>
  );
}

/* ---------- Gamma PDF of pass elevation ---------- */

const PDF = { x0: 24, x1: 390, base: 150, peak: 98.5 };

function GammaPdf({ className }: { className?: string }) {
  const { k, lambda, meanElevation, uplinkThetaMin } = LINK;
  const f = (theta: number) => (theta <= 0 ? 0 : theta ** (k - 1) * Math.exp(-theta / lambda));
  const fMax = f((k - 1) * lambda);
  const x = (theta: number) => PDF.x0 + (theta / 90) * (PDF.x1 - PDF.x0);
  const y = (theta: number) => PDF.base - (PDF.peak * f(theta)) / fMax;
  const curve = (to: number) => {
    const pts: string[] = [];
    for (let theta = 0; theta < to; theta += 1) pts.push(`${x(theta).toFixed(1)} ${y(theta).toFixed(1)}`);
    pts.push(`${x(to).toFixed(1)} ${y(to).toFixed(1)}`);
    return pts.join("L");
  };

  return (
    <Fit width={413} height={180} className={className}>
      <svg width={413} height={180} viewBox="0 0 413 180" fill="none" aria-hidden="true" className="absolute top-0 left-0">
        {/* P_out = F(θmin): share of in-view time below threshold */}
        <path
          d={`M${curve(uplinkThetaMin)}V${PDF.base}H${PDF.x0}Z`}
          fill="var(--status-danger)"
          opacity={0.35}
        />
        <path
          d={`M${curve(90)}`}
          pathLength={1}
          className="mw-route-draw"
          stroke="var(--text-primary)"
          strokeWidth={2}
          style={{ "--route-steps": 12, "--d": `${headerDelay()}ms` } as CSSProperties}
        />
        <path d={`M${x(meanElevation)} 30V${PDF.base}`} stroke="var(--text-secondary)" strokeDasharray="3 4" />
        <path d={`M${PDF.x0} ${PDF.base}H${PDF.x1}`} stroke="var(--text-muted)" />
      </svg>
      {[0, 30, 60, 90].map((deg) => (
        <span
          key={deg}
          className="absolute top-[156px] whitespace-nowrap t-data-telemetry text-fg-muted"
          style={{ left: x(deg) - 8 }}
        >
          {deg}°
        </span>
      ))}
      <span
        className="absolute top-xl whitespace-nowrap t-data-telemetry text-fg-secondary"
        style={{ left: x(meanElevation) + 6 }}
      >
        E[θ] {meanElevation}°
      </span>
      <span className="absolute top-[104px] left-[40px] whitespace-nowrap t-data-telemetry text-fg">P_out</span>
    </Fit>
  );
}

/* ---------- Candlestick link budget ---------- */

const candleTone = {
  gain: { body: "bg-budget-gain", text: "text-budget-gain", wick: "bg-budget-gain" },
  loss: { body: "bg-budget-loss", text: "text-budget-loss", wick: "bg-budget-loss" },
  result: { body: "border-2 border-fg bg-panel", text: "text-fg", wick: "bg-fg" },
};

/**
 * One direction of the link. Each stage is a candle, read left to right; the
 * body is the stage value at E[θ], the wick its spread over Q1–Q3. Candle colors
 * mean "adds dB" or "removes dB" only; the verdict is the status chip.
 */
function BudgetCard({ budget, className, delay }: { budget: Budget; className?: string; delay: number }) {
  const build = delay + headerDelay();
  return (
    <Card className={cn("min-h-0", className)}>
      <CardHeader title={budget.title} meta={`body at E[θ] ${LINK.meanElevation}° · wick Q1–Q3`} delay={delay} />
      <div className="flex min-h-0 flex-1 flex-col gap-lg px-lg py-md sm:flex-row sm:items-start">
        <Fit
          width={452}
          height={268}
          className="aspect-[452/268] w-full sm:w-auto sm:min-w-0 sm:flex-1 lg:aspect-auto lg:self-stretch"
        >
          {budget.grid.map((line) => (
            <span key={line.label}>
              <span className="absolute left-[40px] h-px w-[412px] bg-line-subtle" style={{ top: line.y }} />
              <span
                className="absolute whitespace-nowrap t-data-telemetry text-fg-muted"
                style={{ left: line.labelX, top: line.y - 9 }}
              >
                {line.label}
              </span>
            </span>
          ))}
          <span className="absolute left-[40px] h-px w-[412px] bg-fg" style={{ top: budget.pth }} />
          <span className="absolute left-[14px] whitespace-nowrap t-data-telemetry text-fg" style={{ top: budget.pth - 9 }}>
            Pth
          </span>

          {budget.nodes.map((node) => (
            <span key={node.label}>
              <span className="absolute top-0 h-[236px] w-px bg-fg-muted" style={{ left: node.x }} />
              <span
                className="absolute top-[94px] flex size-2xl items-center justify-center bg-panel text-fg"
                style={{ left: node.x - 16 }}
              >
                <Icon name={node.icon} />
              </span>
              <span
                className="absolute top-[248px] whitespace-nowrap t-data-telemetry text-fg-secondary"
                style={{ left: node.labelX }}
              >
                {node.label}
              </span>
            </span>
          ))}

          {/* Candles build left to right with flash-in, 50 ms stagger */}
          {budget.stages.map((stage, i) => {
            const tone = candleTone[stage.kind];
            return (
              <span key={stage.label}>
                {stage.wick ? (
                  <span
                    className={cn("mw-reveal absolute w-(--stroke-default)", tone.wick)}
                    style={{ left: stage.x + 11, top: stage.wick.top, height: stage.wick.height, ...stagger(i, build) }}
                  />
                ) : null}
                <span
                  className={cn("mw-flash-in absolute w-xl rounded-candle", tone.body)}
                  style={{ left: stage.x, top: stage.top, height: stage.height, ...stagger(i, build) }}
                />
                {stage.label === "FSPL" ? (
                  <svg
                    width={36}
                    height={12}
                    viewBox="0 0 36 12"
                    fill="none"
                    aria-label="Axis break"
                    className="mw-reveal absolute top-[96px] left-[166px]"
                    style={stagger(i, build)}
                  >
                    <path d="M0 2L6 10L12 2L18 10L24 2L30 10L36 2" stroke="var(--surface-panel)" strokeWidth={2} />
                  </svg>
                ) : null}
                {stage.value ? (
                  <span
                    className={cn("mw-reveal absolute whitespace-nowrap t-data-telemetry", tone.text)}
                    style={{ left: stage.value.x, top: stage.value.y, ...stagger(i, build) }}
                  >
                    {stage.value.text}
                  </span>
                ) : null}
                <span
                  className="absolute top-[248px] whitespace-nowrap t-data-telemetry text-fg-secondary"
                  style={{ left: stage.labelX }}
                >
                  {stage.label}
                </span>
              </span>
            );
          })}
        </Fit>

        <div className="flex shrink-0 flex-col items-start gap-sm">
          <p className="t-body-s text-fg-secondary">Margin</p>
          <p className="flex items-baseline gap-xs whitespace-nowrap">
            <span className="t-display-metric text-fg">{budget.margin}</span>
            <span className="t-label-unit text-fg-secondary">dB</span>
          </p>
          {budget.lines.map((line) => (
            <p key={line} className="whitespace-nowrap t-data-telemetry text-fg-secondary">
              {line}
            </p>
          ))}
          <StatusChip status={budget.status} />
        </div>
      </div>
    </Card>
  );
}

/** 05 · Comms · Link Budget. All values are modelled, not measured. */
export function CommsLinkScreen() {
  const group = motionMs("stagger-group");
  return (
    <div className="flex min-h-full flex-col gap-lg p-lg md:p-xl lg:h-full lg:min-h-[760px]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-md">
        <ScreenHeading
          inline
          title="Relay link · MRS constellation"
          sub="Elevation-based statistical link budget · UHF 401.6 MHz · relays at 400 km · site Jezero West"
          className="shrink"
        />
        <CommsToggle />
      </div>

      <div className="grid gap-lg lg:min-h-0 lg:flex-[480_1_0%] lg:grid-cols-[minmax(0,880fr)_minmax(0,414fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-xl">
        <Card className="min-h-0">
          <CardHeader title="Uplink margin across the sky" meta="suit → relay · Pr(θ) − Pth · simulated" />
          <SkyDome className="aspect-[878/432] w-full lg:aspect-auto lg:min-h-0 lg:flex-1" />
        </Card>

        <Card className="min-h-0">
          <CardHeader title="Elevation statistics" meta="gamma fit · 214 simulated passes" delay={group} />
          <GammaPdf className="aspect-[413/180] w-full lg:aspect-auto lg:min-h-[96px] lg:flex-1" />
          <div className="flex shrink-0 flex-col px-lg py-sm">
            <StatList>
              {LINK.stats.map((row) => (
                <StatRow key={row.label} {...row} />
              ))}
            </StatList>
            <p className="t-caption text-fg-secondary">
              P_out = F(θmin): share of in-view time the link is below threshold
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-lg lg:min-h-0 lg:flex-[348_1_0%] lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:gap-xl">
        <BudgetCard budget={BUDGETS[0]} delay={group * 2} />
        <BudgetCard budget={BUDGETS[1]} delay={group * 3} />
      </div>
    </div>
  );
}
