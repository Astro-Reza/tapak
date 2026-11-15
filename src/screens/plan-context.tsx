import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScreenHeading, StatList, StatRow } from "@/components/marswalk/primitives";
import { cn } from "@/lib/utils";
import {
  BAND_LABEL,
  ELEVATION_IDS,
  ELEVATION_LABEL,
  compare,
  covers,
  fmtKm,
  fmtLat,
  fmtLon,
  fmtValue,
  pixelAt,
  sample,
  type GlossaryEntry,
  type Profile,
  type ProfileBand,
  type Raster,
  type RasterMeta,
  type Region,
  type Rover,
  type Weather,
} from "@/sim/context";
import type { StatView } from "@/sim/view";

/**
 * The dataset GUI's side tabs (gui/app.py: Probe, Profile, Compare, Rovers, Weather, Search) for the Plan rail.
 * Layer visibility and opacity stay in the map's layer panel, so these tabs only read and explain.
 */

export type LonLat = [number, number];
export type GetRaster = (meta: RasterMeta) => Promise<Raster>;

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-control min-w-0 rounded-sm border border-line-subtle bg-panel px-sm t-body-s text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        className,
      )}
      {...props}
    />
  );
}

function Panel({ title, sub = "", children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <ScrollArea className="min-h-0 flex-1" fill aria-label={title}>
      <div className="flex flex-1 flex-col gap-lg px-lg py-xl">
        <ScreenHeading title={title} sub={sub} />
        {children}
      </div>
    </ScrollArea>
  );
}

const Hint = ({ children }: { children: ReactNode }) => <p className="t-body-s text-fg-muted">{children}</p>;
const Credit = ({ children }: { children: ReactNode }) => <p className="t-caption text-fg-muted">{children}</p>;

/* ---------- a small line chart ---------- */

const CW = 296, CH = 132, PL = 8, PR = 8, PT = 20, PB = 22;

/** Line over x with gaps for missing values. `tone` splits the line into coloured runs (profile bands). */
function Chart({
  x,
  y,
  label,
  xFmt,
  yFmt,
  tone,
  mark,
  markLabel,
}: {
  x: ArrayLike<number>;
  y: ArrayLike<number | null>;
  label: string;
  xFmt: (v: number) => string;
  yFmt: (v: number) => string;
  tone?: (i: number) => string;
  mark?: number;
  markLabel?: string;
}) {
  const { paths, x0, x1, y0, y1 } = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < x.length; i++) {
      const v = y[i];
      if (v == null || !Number.isFinite(v)) continue;
      x0 = Math.min(x0, x[i]);
      x1 = Math.max(x1, x[i]);
      y0 = Math.min(y0, v);
      y1 = Math.max(y1, v);
    }
    if (y1 === y0) (y0 -= 1), (y1 += 1);
    if (x1 === x0) x1 = x0 + 1;
    const px = (v: number) => PL + ((v - x0) / (x1 - x0)) * (CW - PL - PR);
    const py = (v: number) => PT + (1 - (v - y0) / (y1 - y0)) * (CH - PT - PB);
    const paths: { d: string; tone: string }[] = [];
    let cur: { d: string; tone: string } | null = null;
    let last: string | null = null;
    for (let i = 0; i < x.length; i++) {
      const v = y[i];
      if (v == null || !Number.isFinite(v)) {
        cur = null;
        last = null;
        continue;
      }
      const t = tone?.(i) ?? "text-fg";
      const pt = `${px(x[i]).toFixed(1)} ${py(v).toFixed(1)}`;
      if (!cur || cur.tone !== t) {
        // continue from the previous point so runs of different tone join up
        cur = { d: last ? `M${last} L${pt}` : `M${pt}`, tone: t };
        paths.push(cur);
      } else cur.d += ` L${pt}`;
      last = pt;
    }
    return { paths, x0, x1, y0, y1 };
  }, [x, y, tone]);
  if (!Number.isFinite(x0)) return <Hint>No data along this line</Hint>;
  const mx = mark != null ? PL + ((mark - x0) / (x1 - x0)) * (CW - PL - PR) : null;
  return (
    <figure className="flex flex-col gap-xs">
      <figcaption className="t-body-s text-fg-secondary">{label}</figcaption>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full rounded-sm bg-panel" role="img" aria-label={`${label}, ${yFmt(y0)} to ${yFmt(y1)}`}>
        <g className="text-line-subtle" stroke="currentColor" strokeWidth={1}>
          <line x1={PL} x2={CW - PR} y1={PT} y2={PT} />
          <line x1={PL} x2={CW - PR} y1={CH - PB} y2={CH - PB} />
        </g>
        {paths.map((p, i) => (
          <path key={i} d={p.d} className={p.tone} stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinejoin="round" />
        ))}
        {mx != null && mx >= PL && mx <= CW - PR ? (
          <g className="text-brand">
            <line x1={mx} x2={mx} y1={PT} y2={CH - PB} stroke="currentColor" strokeWidth={1.5} />
            {markLabel ? (
              <text x={Math.min(mx + 4, CW - 60)} y={PT - 6} className="t-data-telemetry" fill="currentColor">
                {markLabel}
              </text>
            ) : null}
          </g>
        ) : null}
        <g className="t-data-telemetry text-fg-muted" fill="currentColor">
          <text x={PL} y={PT - 6}>{yFmt(y1)}</text>
          <text x={PL} y={CH - PB + 14}>{yFmt(y0)}</text>
          <text x={CW - PR} y={CH - 4} textAnchor="end">{`${xFmt(x0)} – ${xFmt(x1)}`}</text>
        </g>
      </svg>
    </figure>
  );
}

/* ---------- Probe ---------- */

type ProbeRow = { id: string; name: string; value: string; pixel: string };

/** Every catalog layer at the clicked point, finest first, with the best elevation on top (the GUI's Probe tab). */
export function ProbePanel({
  point,
  metas,
  getRaster,
  siteRows,
}: {
  point: LonLat | null;
  metas: RasterMeta[];
  getRaster: GetRaster;
  siteRows: StatView[] | null;
}) {
  const [rows, setRows] = useState<ProbeRow[] | null>(null);
  const [best, setBest] = useState<{ value: number; id: string } | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!point) return;
    const [lon, lat] = point;
    const n = ++seq.current;
    const hits = metas.filter((m) => covers(m.bounds, lon, lat)).sort((a, b) => a.res_m - b.res_m);
    setRows(null);
    Promise.allSettled(hits.map(getRaster)).then((res) => {
      if (n !== seq.current) return;
      const out: ProbeRow[] = [];
      const elev: Record<string, number> = {};
      res.forEach((r, i) => {
        const m = hits[i];
        if (r.status !== "fulfilled") return out.push({ id: m.id, name: m.name, value: "failed to load", pixel: "—" });
        const v = sample(r.value, lon, lat);
        const p = pixelAt(r.value, lon, lat);
        if (m.kind === "scalar" && Number.isFinite(v)) elev[m.id] = v;
        const unit = m.kind === "scalar" ? m.units : m.kind === "rgb" ? "grey" : "DN";
        out.push({ id: m.id, name: m.name, value: Number.isFinite(v) ? `${fmtValue(v)} ${unit}`.trim() : "no data", pixel: p ? `${p[0]}, ${p[1]}` : "—" });
      });
      const id = ELEVATION_IDS.find((k) => k in elev);
      setBest(id ? { value: elev[id], id } : null);
      setRows(out);
    });
  }, [point, metas, getRaster]);

  if (!point)
    return (
      <Panel title="Probe" sub="Every layer at one point">
        <Hint>Click the map with Pan selected to read every layer under that point</Hint>
      </Panel>
    );
  return (
    <Panel title="Probe" sub={`${fmtLat(point[1])}  ${fmtLon(point[0])}`}>
      {rows === null ? (
        <Hint>Loading the layers that cover this point</Hint>
      ) : (
        <>
          <p className="t-body-m text-fg">
            {best ? (
              <>
                Best elevation <span className="t-data-coordinate">{best.value.toFixed(best.id === "mola" ? 0 : 1)} m</span>
                <span className="block t-body-s text-fg-secondary">from the {ELEVATION_LABEL[best.id]}</span>
              </>
            ) : (
              "No elevation here"
            )}
          </p>
          <table className="w-full border-collapse t-body-s">
            <thead>
              <tr className="border-b border-line-subtle text-left text-fg-muted">
                <th className="py-xs pr-sm font-normal">Layer</th>
                <th className="py-xs pr-sm text-right font-normal">Value</th>
                <th className="py-xs text-right font-normal">Pixel</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-subtle align-baseline">
                  <td className="py-xs pr-sm text-fg-secondary">{r.name}</td>
                  <td className="py-xs pr-sm text-right whitespace-nowrap text-fg tabular-nums">{r.value}</td>
                  <td className="py-xs text-right whitespace-nowrap t-data-telemetry text-fg-muted">{r.pixel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {siteRows ? (
        <section className="flex flex-col gap-xs">
          <h3 className="t-label-m text-fg">Planning grid at this point</h3>
          <StatList>
            {siteRows.map((r) => (
              <StatRow key={r.label} {...r} />
            ))}
          </StatList>
        </section>
      ) : null}
    </Panel>
  );
}

/* ---------- Profile ---------- */

const BAND_TONE: Record<ProfileBand, string> = { fine: "text-brand", ctx: "text-fg", mid: "text-fg-secondary", coarse: "text-fg-muted" };

/** Elevation along the line drawn with the Profile tool, each run coloured by the DEM it came from. */
export function ProfilePanel({ ends, prof }: { ends: [LonLat, LonLat] | null; prof: Profile | null }) {
  const km = useMemo(() => (prof ? Float64Array.from(prof.d, (v) => v / 1000) : null), [prof]);
  const tone = useMemo(() => (prof ? (i: number) => BAND_TONE[prof.band[i]] : undefined), [prof]);
  if (!ends)
    return (
      <Panel title="Profile" sub="Elevation along a line">
        <Hint>Choose Profile on the map toolbar, then drag from A to B</Hint>
      </Panel>
    );
  const used = prof ? (Object.keys(BAND_LABEL) as ProfileBand[]).filter((b) => prof.band.includes(b)) : [];
  return (
    <Panel title="Profile" sub={`${fmtLat(ends[0][1], 3)} ${fmtLon(ends[0][0], 3)} → ${fmtLat(ends[1][1], 3)} ${fmtLon(ends[1][0], 3)}`}>
      {prof && km ? (
        <>
          <Chart x={km} y={prof.z} label="Elevation" xFmt={(v) => `${v.toFixed(v >= 10 ? 0 : 2)} km`} yFmt={(v) => `${v.toFixed(0)} m`} tone={tone} />
          <ul className="flex flex-wrap gap-x-lg gap-y-xs">
            {used.map((b) => (
              <li key={b} className={cn("flex items-center gap-sm t-body-s", BAND_TONE[b])}>
                <span aria-hidden="true" className="h-[2px] w-lg bg-current" />
                <span className="text-fg-secondary">{BAND_LABEL[b]}</span>
              </li>
            ))}
          </ul>
          <StatList className="rounded-sm bg-panel px-md py-sm">
            <StatRow label="Length" value={fmtKm(prof.length)} />
            <StatRow label="Lowest" value={prof.min.toFixed(0)} unit="m" />
            <StatRow label="Highest" value={prof.max.toFixed(0)} unit="m" />
            <StatRow label="Climb" value={prof.gain.toFixed(0)} unit="m" />
            <StatRow label="Descent" value={prof.loss.toFixed(0)} unit="m" />
            <StatRow label="Steepest grade" value={prof.maxGrade.toFixed(1)} unit="°" />
          </StatList>
          <Hint>Each sample takes the finest elevation model that covers it; grade is between neighbouring samples</Hint>
        </>
      ) : (
        <Hint>Loading the elevation models along the line</Hint>
      )}
    </Panel>
  );
}

/* ---------- Compare ---------- */

/** Two layers over the region drawn with the Region tool: density plot, correlation and a fit (the GUI's Compare tab). */
export function ComparePanel({ region, metas, getRaster }: { region: Region | null; metas: RasterMeta[]; getRaster: GetRaster }) {
  const overlapping = useMemo(
    () => (region ? metas.filter((m) => m.bounds[0] < region.e && m.bounds[1] > region.w && m.bounds[2] < region.n && m.bounds[3] > region.s) : []),
    [region, metas],
  );
  const [ax, setAx] = useState<string | null>(null);
  const [ay, setAy] = useState<string | null>(null);
  const xId = overlapping.some((m) => m.id === ax) ? ax! : overlapping[0]?.id;
  const yId = overlapping.some((m) => m.id === ay) ? ay! : overlapping.find((m) => m.id !== xId)?.id;
  const [result, setResult] = useState<{ key: string; cmp: ReturnType<typeof compare> } | null>(null);
  const key = region && xId && yId ? `${xId}|${yId}|${region.w}|${region.e}|${region.s}|${region.n}` : "";
  useEffect(() => {
    if (!key || !region) return;
    let live = true;
    const mx = metas.find((m) => m.id === xId)!, my = metas.find((m) => m.id === yId)!;
    Promise.all([getRaster(mx), getRaster(my)]).then(
      ([a, b]) => live && setResult({ key, cmp: compare(a, b, region) }),
      () => live && setResult({ key, cmp: null }),
    );
    return () => {
      live = false;
    };
  }, [key, region, metas, xId, yId, getRaster]);

  if (!region)
    return (
      <Panel title="Compare" sub="Two layers over one region">
        <Hint>Choose Region on the map toolbar, then drag a box</Hint>
      </Panel>
    );
  const mx = metas.find((m) => m.id === xId), my = metas.find((m) => m.id === yId);
  const cmp = result?.key === key ? result.cmp : undefined;
  const sub = `${fmtLat(region.s, 2)} to ${fmtLat(region.n, 2)} · ${fmtLon(region.w, 2)} to ${fmtLon(region.e, 2)}`;
  return (
    <Panel title="Compare" sub={sub}>
      {overlapping.length < 2 ? (
        <Hint>Fewer than two data layers cover this region. Draw it over Jezero, where the CRISM, THEMIS and CTX layers overlap</Hint>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-sm">
            <label className="flex flex-col gap-xs t-body-s text-fg-secondary">
              Across
              <NativeSelect value={xId} onChange={(e) => setAx(e.target.value)}>
                {overlapping.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-xs t-body-s text-fg-secondary">
              Up
              <NativeSelect value={yId} onChange={(e) => setAy(e.target.value)}>
                {overlapping.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </NativeSelect>
            </label>
          </div>
          {cmp === undefined ? (
            <Hint>Loading and sampling both layers</Hint>
          ) : cmp === null ? (
            <Hint>The two layers share fewer than 10 valid pixels here</Hint>
          ) : (
            <>
              <Density cmp={cmp} xName={mx!.name} yName={my!.name} />
              <StatList className="rounded-sm bg-panel px-md py-sm">
                <StatRow label="Pearson r" value={cmp.r.toFixed(3)} />
                <StatRow label="Spearman ρ" value={cmp.rho.toFixed(3)} />
                <StatRow label="Fit" value={`y = ${fmtValue(cmp.fit.slope)} x ${cmp.fit.intercept < 0 ? "−" : "+"} ${fmtValue(Math.abs(cmp.fit.intercept))}`} />
                <StatRow label="Samples" value={cmp.n.toLocaleString("en-US")} />
              </StatList>
              <table className="w-full border-collapse t-body-s">
                <thead>
                  <tr className="border-b border-line-subtle text-left text-fg-muted">
                    <th className="py-xs pr-sm font-normal" />
                    <th className="py-xs pr-sm text-right font-normal">Across</th>
                    <th className="py-xs text-right font-normal">Up</th>
                  </tr>
                </thead>
                <tbody>
                  {(["min", "median", "mean", "max", "std"] as const).map((k) => (
                    <tr key={k} className="border-b border-line-subtle">
                      <td className="py-xs pr-sm text-fg-secondary">{k === "std" ? "Std dev" : k[0].toUpperCase() + k.slice(1)}</td>
                      <td className="py-xs pr-sm text-right text-fg tabular-nums">{fmtValue(cmp.x[k])}</td>
                      <td className="py-xs text-right text-fg tabular-nums">{fmtValue(cmp.y[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Hint>Sampled on a 256 × 256 lattice where both layers have data, clipped to their 0.5–99.5 percentiles</Hint>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

function Density({ cmp, xName, yName }: { cmp: NonNullable<ReturnType<typeof compare>>; xName: string; yName: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { size, bins } = cmp;
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(size, size);
    let max = 0;
    for (const b of bins) max = Math.max(max, b);
    for (let i = 0; i < bins.length; i++) {
      const t = max ? bins[i] / max : 0;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = bins[i] > 0 ? Math.round(40 + t * 215) : 0;
    }
    ctx.putImageData(img, 0, 0);
  }, [cmp]);
  const [x0, x1] = cmp.xRange, [y0, y1] = cmp.yRange;
  const fy = (x: number) => 1 - (cmp.fit.slope * x + cmp.fit.intercept - y0) / (y1 - y0 || 1);
  return (
    <figure className="flex flex-col gap-xs">
      <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-panel">
        <canvas ref={ref} role="img" aria-label={`Density of ${yName} against ${xName}`} className="absolute inset-0 size-full [image-rendering:pixelated]" />
        <svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 size-full text-brand">
          <line x1={0} y1={fy(x0)} x2={1} y2={fy(x1)} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <figcaption className="flex justify-between gap-sm t-data-telemetry text-fg-muted">
        <span>{`${xName} ${fmtValue(x0)} – ${fmtValue(x1)}`}</span>
      </figcaption>
      <p className="t-data-telemetry text-fg-muted">{`${yName} ${fmtValue(y0)} – ${fmtValue(y1)} (bottom to top) · brand line: least-squares fit`}</p>
    </figure>
  );
}

/* ---------- Rovers ---------- */

export function RoversPanel({ rovers, onShow }: { rovers: Rover[]; onShow: (r: Rover) => void }) {
  return (
    <Panel title="Rovers" sub="Perseverance and Curiosity traverses">
      {rovers.map((r) => (
        <RoverCard key={r.id} rover={r} onShow={() => onShow(r)} />
      ))}
      {rovers[0] ? <Credit>{[...new Set(rovers.map((r) => r.credit))].join(" · ")}</Credit> : null}
    </Panel>
  );
}

function RoverCard({ rover, onShow }: { rover: Rover; onShow: () => void }) {
  const km = useMemo(() => rover.dist_total_m.map((d) => (d == null ? NaN : d / 1000)), [rover]);
  const elev = rover.elev.filter((v): v is number => v != null);
  const total = km.reduce((m, v) => (Number.isFinite(v) ? Math.max(m, v) : m), 0);
  const kmFmt = (v: number) => `${v.toFixed(v >= 10 ? 0 : 1)} km`;
  return (
    <section className="flex flex-col gap-md border-b border-line-subtle pb-lg last:border-0">
      <div className="flex items-start justify-between gap-sm">
        <div className="min-w-0">
          <h3 className="t-label-m text-fg">{rover.name}</h3>
          <p className="t-body-s text-fg-secondary">
            {`${rover.count.toLocaleString("en-US")} waypoints · sols ${rover.sol[0]}–${rover.sol[rover.sol.length - 1]} · ${total.toFixed(1)} km`}
            {elev.length ? ` · ${Math.min(...elev).toFixed(0)} to ${Math.max(...elev).toFixed(0)} m` : ""}
          </p>
        </div>
        <Button size="control" variant="secondary" onClick={onShow}>
          Show
        </Button>
      </div>
      <Chart x={km} y={rover.elev} label="Elevation along the drive" xFmt={kmFmt} yFmt={(v) => `${v.toFixed(0)} m`} />
      <Chart x={rover.sol} y={km} label="Odometry by sol" xFmt={(v) => `sol ${v.toFixed(0)}`} yFmt={kmFmt} />
    </section>
  );
}

/* ---------- Weather ---------- */

const HOURS = Array.from({ length: 24 }, (_, i) => i + 0.5);

/** MEDA hourly medians at Jezero, with the planned EVA start marked. */
export function WeatherPanel({ weather, startLmst }: { weather: Weather; startLmst: number }) {
  const [sol, setSol] = useState("typical");
  const day = sol === "typical" ? weather.typical_day : weather.by_sol[sol];
  const hh = (v: number) => `${String(Math.floor(v)).padStart(2, "0")}:00`;
  const at = `EVA ${hh(startLmst).slice(0, 2)}:${String(Math.round((startLmst % 1) * 60)).padStart(2, "0")}`;
  return (
    <Panel title="Weather" sub="Jezero surface, by local solar hour">
      <label className="flex flex-col gap-xs t-body-s text-fg-secondary">
        Sol
        <NativeSelect value={sol} onChange={(e) => setSol(e.target.value)}>
          <option value="typical">Typical day ({weather.sols.length} sols)</option>
          {weather.sols.map((s) => (
            <option key={s} value={String(s)}>
              Sol {s}
            </option>
          ))}
        </NativeSelect>
      </label>
      {day ? (
        <>
          <Chart x={HOURS} y={day.air_temp_k} label="Air temperature" xFmt={hh} yFmt={(v) => `${(v - 273.15).toFixed(0)} °C`} mark={startLmst} markLabel={at} />
          <Chart x={HOURS} y={day.ground_temp_k} label="Ground temperature" xFmt={hh} yFmt={(v) => `${(v - 273.15).toFixed(0)} °C`} mark={startLmst} />
          <Chart x={HOURS} y={day.pressure_pa} label="Pressure" xFmt={hh} yFmt={(v) => `${v.toFixed(0)} Pa`} mark={startLmst} />
        </>
      ) : (
        <Hint>No records for this sol</Hint>
      )}
      <Credit>{`${weather.products} · ${weather.stat} · ${weather.credit}`}</Credit>
    </Panel>
  );
}

/* ---------- Search ---------- */

/** The GUI's glossary: layers, instruments, terms and places, with a jump to the map where an entry has one. */
export function SearchPanel({
  entries,
  kinds,
  onGoto,
  onLayer,
}: {
  entries: GlossaryEntry[];
  kinds: string[];
  onGoto: (g: [number, number, number]) => void;
  onLayer: (id: string) => boolean;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (kind === "all" || e.kind === kind) &&
        (!t || e.title.toLowerCase().includes(t) || e.summary.toLowerCase().includes(t) || e.aliases.some((a) => a.toLowerCase().includes(t))),
    );
  }, [entries, q, kind]);
  return (
    <Panel title="Search" sub={`${entries.length} layers, instruments, terms and places`}>
      <div className="flex flex-col gap-sm">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search the glossary" />
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
          <option value="all">All kinds</option>
          {kinds.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </NativeSelect>
      </div>
      <ul className="flex flex-col">
        {hits.slice(0, 60).map((e) => {
          const expanded = open === e.id;
          return (
            <li key={e.id} className="border-b border-line-subtle">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : e.id)}
                className="flex w-full flex-col items-start gap-xs py-sm text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fg"
              >
                <span className="flex w-full items-baseline justify-between gap-sm">
                  <span className="t-label-m text-fg">{e.title}</span>
                  <span className="t-data-telemetry text-fg-muted">{e.kind}</span>
                </span>
                <span className="t-body-s text-fg-secondary">{e.summary}</span>
              </button>
              {expanded ? (
                <div className="flex flex-col gap-sm pb-md">
                  {e.body.map((p, i) => (
                    <p key={i} className="t-body-s text-fg-secondary">{p}</p>
                  ))}
                  {e.facts.length ? (
                    <StatList>
                      {e.facts.map(([k, v]) => (
                        <StatRow key={k} label={k} value={v} />
                      ))}
                    </StatList>
                  ) : null}
                  <div className="flex flex-wrap gap-sm">
                    {e.goto ? (
                      <Button size="control" variant="secondary" onClick={() => onGoto(e.goto!)}>
                        Show on map
                      </Button>
                    ) : null}
                    {e.layers.map((id) => (
                      <LayerButton key={id} id={id} onLayer={onLayer} />
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hits.length > 60 ? <Hint>{`${hits.length - 60} more · narrow the search`}</Hint> : hits.length === 0 ? <Hint>Nothing matches</Hint> : null}
    </Panel>
  );
}

function LayerButton({ id, onLayer }: { id: string; onLayer: (id: string) => boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="control" variant="secondary" disabled={done} onClick={() => setDone(onLayer(id))}>
      {done ? "Layer on the map" : "Add layer to map"}
    </Button>
  );
}
