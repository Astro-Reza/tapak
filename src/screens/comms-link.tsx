import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Fit } from "@/components/marswalk/fit";
import { Icon } from "@/components/marswalk/icons";
import { LayerRow, SatelliteMarker, WaypointDot } from "@/components/marswalk/map";
import {
  Brackets,
  MapTag,
  StatList,
  StatRow,
  StatusChip,
} from "@/components/marswalk/primitives";
import type { CommsLinkData } from "@/data/comms";
import type { Budget } from "@/data/mission";
import { SOURCE_LABEL, useCommsLink } from "@/lib/comms-api";
import { CommsPassesScreen } from "@/screens/comms-passes";
import { headerDelay, motionMs, stagger } from "@/lib/motion";
import { useTour } from "@/tour";
import { cn } from "@/lib/utils";

type Link = CommsLinkData["link"];

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
function SkyDome({ link, className }: { link: Link; className?: string }) {
  const wedges = Array.from({ length: 180 / DOME.step }, (_, i) => {
    const shade = link.wedgeShade[i < 30 ? i : 59 - i];
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
  const thetaMin = link.uplinkThetaMin;

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

function GammaPdf({ link, className }: { link: Link; className?: string }) {
  const { k, lambda, meanElevation, uplinkThetaMin } = link;
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
function BudgetCard({
  budget,
  meanElevation,
  className,
  delay,
}: {
  budget: Budget;
  meanElevation: number;
  className?: string;
  delay: number;
}) {
  const build = delay + headerDelay();
  return (
    <section className={cn("min-h-0", className)}>
      <CardHeader title={budget.title} meta={`body at E[θ] ${meanElevation}° · wick Q1–Q3`} delay={delay} />
      <div role="group" aria-label={budget.title} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-lg px-lg py-md sm:flex-row sm:items-start">
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
      </div>
    </section>
  );
}

/** Collapsed drawer: only its grab line shows at the bottom edge. */
const PEEK = "40px";
/** Raised drawer: share of the viewport height it covers. The content is full height and the closed 1 - OPEN is padded off. */
const OPEN = 0.88;

/** Tailwind `lg`: below it the panels stack in a scrolling column instead of resizable rows. */
const WIDE = "(min-width: 1024px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

/** Panels stand clean in the drawer; only the resizable handles separate them. */
const PANEL = "flex size-full min-h-0 min-w-0 flex-col text-fg";

/**
 * 05 · Comms · Link Budget. All values are modelled, not measured. The view is
 * a drawer over the 3D relay-pass view. It rests as a thin line at the bottom edge;
 * drag or tap the line to raise it. Its panels are resizable like the Hub.
 */
export function CommsLinkScreen() {
  const { data, source } = useCommsLink();
  const { link, budgets } = data;
  const [snap, setSnap] = useState<number | string | null>(PEEK);
  const wide = useWide();
  const collapsed = snap !== OPEN;
  const group = motionMs("stagger-group");

  let tourTarget: string | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const tour = useTour();
    tourTarget = tour.activeStep?.targetSelector ?? null;
  } catch {
    // Tour may not be mounted in pure tests
  }

  // Drive the drawer from the tour step's *target* rather than its numeric id,
  // so renumbering the tour can't desync it. The sky map lives inside the
  // drawer, so it must be open; the comms-switch only renders while the drawer
  // is peeking and the pass list sits behind it, so those need it collapsed.
  // The drawer also collapses again when the tour ends.
  // `snap` is a dependency so the required state is re-asserted if the drawer
  // library overwrites it while it finishes initialising its snap points.
  const wantSnap =
    tourTarget === '[data-tour="sky-dome"]'
      ? OPEN
      : tourTarget === '[data-tour="comms-switch"]' || tourTarget === '[data-tour="pass-list"]'
        ? PEEK
        : null;
  const tourDrove = useRef(false);
  useEffect(() => {
    if (wantSnap !== null) {
      tourDrove.current = true;
      if (snap !== wantSnap) setSnap(wantSnap);
    } else if (tourDrove.current) {
      tourDrove.current = false;
      setSnap(PEEK);
    }
  }, [wantSnap, snap]);

  const sky = (
    <section className={PANEL} aria-label="Uplink margin across the sky" data-tour="sky-dome">
      <CardHeader title="Uplink margin across the sky" meta="suit → relay · Pr(θ) − Pth · simulated" />
      <div role="group" aria-label="Uplink margin across the sky" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SkyDome link={link} className="aspect-[878/432] w-full lg:aspect-auto lg:min-h-[200px] lg:flex-1" />
      </div>
    </section>
  );

  const stats = (
    <section className={PANEL} aria-label="Elevation statistics">
      <CardHeader title="Elevation statistics" meta={`gamma fit · ${data.passCount} simulated passes`} delay={group} />
      <div role="group" aria-label="Elevation statistics" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-full flex-1 flex-col lg:flex-row lg:items-stretch">
        <GammaPdf link={link} className="aspect-[413/180] w-full lg:aspect-auto lg:min-h-[96px] lg:min-w-0 lg:flex-1" />
        <div className="flex shrink-0 flex-col justify-center px-lg py-sm lg:w-[44%] lg:max-w-[280px]">
          <StatList>
            {link.stats.map((row) => (
              <StatRow key={row.label} {...row} />
            ))}
          </StatList>
          <p className="t-caption text-fg-secondary">
            P_out = F(θmin): share of in-view time the link is below threshold
          </p>
        </div>
        </div>
      </div>
    </section>
  );

  const budgetPanels = budgets.map((budget, i) => (
    <BudgetCard
      key={budget.title}
      budget={budget}
      meanElevation={link.meanElevation}
      delay={group * (i + 2)}
      className={PANEL}
    />
  ));

  return (
    <>
      {/* The pass prediction screen stays underneath the drawer. */}
      <div className="h-full" style={{ paddingBottom: PEEK }}>
        <CommsPassesScreen />
      </div>
      <Drawer
        open
        modal={false}
        dismissible={false}
        snapPoints={[PEEK, OPEN]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
      >
        <DrawerContent
          overlay={false}
          className="h-dvh max-h-none pb-[12dvh]"
          onHandleClick={() => setSnap(collapsed ? OPEN : PEEK)} aria-describedby="link-budget-sub">
          {collapsed ? (
            <div
              data-tour="comms-switch"
              className="flex h-[39px] shrink-0 cursor-pointer items-center justify-between gap-md px-lg md:px-xl"
              onClick={() => setSnap(OPEN)}
            >
              <dl className="flex items-baseline gap-xl" aria-label="Link margins">
                {budgets.slice(0, 2).map((budget) => (
                  <div key={budget.title} className="flex items-baseline gap-sm">
                    <dt className="t-body-s text-fg-secondary">{budget.title.split(" · ")[0]} margin</dt>
                    <dd className="flex items-baseline gap-xs">
                      <span className="t-label-m text-fg">{budget.margin}</span>
                      <span className="t-label-unit text-fg-secondary">dB</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <Button variant="ghost" size="control" className="h-[24px] px-md" onClick={() => setSnap(OPEN)}>
                More info
              </Button>
            </div>
          ) : null}
          <DrawerHeader>
            <div className="min-w-0">
              <DrawerTitle>Relay link · MRS constellation</DrawerTitle>
              <DrawerDescription id="link-budget-sub" className="sr-only">
                {`Elevation-based statistical link budget · UHF 401.6 MHz · relays at 400 km · site Jezero West · ${SOURCE_LABEL[source]}`}
              </DrawerDescription>
            </div>
            <Button
              size="icon"
              aria-label="Close"
              className="size-[28px] bg-danger text-canvas"
              onClick={() => setSnap(PEEK)}
            >
              <Icon name="close" size={16} />
            </Button>
          </DrawerHeader>

          {wide ? (
            <ScrollArea fill className="min-h-0 flex-1" aria-label="Link budget">
            <div className="flex min-h-[860px] flex-1 flex-col px-xl pb-xl">
              <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
                <ResizablePanel id="link-left" defaultSize="58%" minSize="30%">
                  <ResizablePanelGroup orientation="vertical">
                    <ResizablePanel id="link-sky" defaultSize="64%" minSize={120}>
                      {sky}
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel id="link-stats" defaultSize="36%" minSize={120}>
                      {stats}
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="link-right" defaultSize="42%" minSize="25%">
                  <ResizablePanelGroup orientation="vertical">
                    {budgetPanels.map((panel, i) => (
                      <Fragment key={budgets[i].title}>
                        {i > 0 ? <ResizableHandle withHandle /> : null}
                        <ResizablePanel id={`link-budget-${i}`} defaultSize="50%" minSize={120}>
                          {panel}
                        </ResizablePanel>
                      </Fragment>
                    ))}
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="min-h-0 flex-1" aria-label="Link budget">
              <div className="flex flex-col gap-lg p-lg">
                {sky}
                {stats}
                {budgetPanels}
              </div>
            </ScrollArea>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
