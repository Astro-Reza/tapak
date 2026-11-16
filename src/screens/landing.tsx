import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import tapakWordmark from "@/icon/TAPAK_LOGO_WORDMARK.svg";
import "@/styles/landing.css";

const REPO_URL = "https://github.com/Astro-Reza/marswalk";
const PAPER_DOI = "10.1109/ACCESS.2022.3147829";

const NAV = [
  { id: "walking-cost", label: "Walking cost" },
  { id: "screens", label: "Screens" },
  { id: "link-budget", label: "Link budget" },
  { id: "jezero", label: "Jezero data" },
  { id: "verdict", label: "Verdict" },
  { id: "references", label: "References" },
] as const;

const SCREENS = [
  { key: "hub", label: "Hub", alt: "Hub screen: mission presets, pre-EVA checklist, hold and abort criteria and the mission timeline" },
  { key: "plan", label: "Plan", alt: "Plan screen: route list, layers and route profile" },
  { key: "eva", label: "EVA map", alt: "EVA map screen: live position on the route with oxygen, dose and next stop" },
  { key: "fov", label: "Field of view", alt: "Field of view screen: 3D terrain from eye height with the route ahead" },
  { key: "comms", label: "Comms", alt: "Comms screen: relay passes over Jezero West and link prediction" },
  { key: "debrief", label: "Debrief", alt: "Debrief screen: planned route, walking oxygen per leg, samples and events" },
] as const;
type ScreenKey = (typeof SCREENS)[number]["key"];

/** Sample loop: values read from the Plan screen with the default profiles (efficient mode). */
const READOUTS = [
  { label: "Distance", num: "1.33", unit: "km" },
  { label: "Time on surface", num: "3:37", unit: "h" },
  { label: "Oxygen used", num: "127.8", unit: "L" },
  { label: "Walk-back margin", num: "+193", unit: "L" },
  { label: "Radiation dose", num: "0.106", unit: "mSv" },
] as const;

/** Counts a readout up from zero, keeping its format ("+193", "0.106", "3:37"). */
function CountUp({ value }: { value: string }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    if (reduced) return;
    const clock = value.includes(":");
    const target = clock ? value.split(":").reduce((a, p) => a * 60 + +p, 0) : parseFloat(value);
    const dec = clock ? 0 : (value.split(".")[1]?.length ?? 0);
    const sign = value.startsWith("+") ? "+" : "";
    const fmt = (v: number) => clock ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` : sign + v.toFixed(dec);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / 1800, 1);
      setText(p < 1 ? fmt(target * (1 - (1 - p) ** 3)) : value);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{text}</>;
}

/** Elevation-based link budget, demo scenario of the Comms screen (modelled, not measured). */
const LINK_ROWS = [
  { label: "Expected received power E[Pr]", down: "−127.0", up: "−131.0", unit: "dBW" },
  { label: "Spread", down: "±3.4", up: "±3.4", unit: "dB" },
  { label: "Margin", down: "+4.0", up: "+2.0", unit: "dB" },
  { label: "Lowest usable elevation θmin", down: "12.9", up: "19.9", unit: "°" },
  { label: "Outage probability P_out", down: "13.7", up: "28.5", unit: "%" },
] as const;

const REFS: { who: string; text: string; doi?: string }[] = [
  { who: "Caggiano, V., et al. (2022).", text: "MyoSuite: A contact-rich simulation suite for musculoskeletal motor control. Learning for Dynamics and Control Conference." },
  { who: "Christensen, P. R., et al. (2004).", text: "The Thermal Emission Imaging System (THEMIS) for the Mars 2001 Odyssey Mission. Space Science Reviews, 110, 85–130." },
  { who: "Edwards, C. S., and Buz, J. (2021).", text: "THEMIS-derived Thermal Inertia of Jezero Crater, Mars (v1). Zenodo.", doi: "10.5281/zenodo.4931348" },
  { who: "Gongora-Torres, J. M., Vargas-Rosales, C., Aragón-Zavala, A., and Villalpando-Hernandez, R. (2022).", text: "Link budget analysis for LEO satellites based on the statistics of the elevation angle. IEEE Access, 10.", doi: PAPER_DOI },
  { who: "Guo, J., et al. (2017).", text: "Dependence of the Martian radiation environment on atmospheric depth. Journal of Geophysical Research: Planets, 122, 329." },
  { who: "Hassler, D. M., et al. (2014).", text: "Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover. Science, 343." },
  { who: "Hof, A. L., Gazendam, M. G. J., and Sinke, W. E. (2005).", text: "The condition for dynamic stability. Journal of Biomechanics, 38(1), 1–8." },
  { who: "Minetti, A. E., et al. (2002).", text: "Energy cost of walking and running at extreme uphill and downhill slopes. Journal of Applied Physiology, 93(3), 1039–1046." },
  { who: "Murchie, S., et al. (2007).", text: "Compact Reconnaissance Imaging Spectrometer for Mars (CRISM) on Mars Reconnaissance Orbiter. Journal of Geophysical Research, 112, E05S03." },
  { who: "Pandolf, K. B., Givoni, B., and Goldman, R. F. (1977).", text: "Predicting energy expenditure with loads while standing or walking very slowly. Journal of Applied Physiology, 43(4), 577–581." },
  { who: "Santee, W. R., et al. (2003).", text: "A proposed model for load carriage on sloped terrain. Aviation, Space, and Environmental Medicine, 74(6), 597–603." },
  { who: "Schulman, J., et al. (2017).", text: "Proximal policy optimization algorithms. arXiv:1707.06347." },
  { who: "Schumacher, P., et al. (2023).", text: "DEP-RL: Embodied exploration for reinforcement learning in overactuated and musculoskeletal systems. ICLR." },
  { who: "Simos, M., Chiappa, A. S., and Mathis, A. (2026).", text: "KINESIS. IEEE International Conference on Robotics and Automation." },
  { who: "Viviano-Beck, C. E., et al. (2014).", text: "Revised CRISM spectral parameters and summary products based on the currently detected mineral diversity on Mars. Journal of Geophysical Research: Planets, 119, 1403–1431." },
];

/** Stagger index and the resting colors a flash-in ends on, passed as CSS variables. */
const at = (i: number, rest?: { bg?: string; fg?: string }): CSSProperties =>
  ({ "--i": i, ...(rest?.bg ? { "--rest-bg": rest.bg } : {}), ...(rest?.fg ? { "--rest-fg": rest.fg } : {}) }) as CSSProperties;

function Section({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) return setSeen(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} id={id} className={`block${seen ? " seen" : ""}`}>
      <div className="wrap">{children}</div>
    </section>
  );
}

export function LandingScreen() {
  const root = useRef<HTMLDivElement>(null);
  const [built, setBuilt] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [shot, setShot] = useState<ScreenKey>("plan");
  const [swapKey, setSwapKey] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Hero build starts once the fonts are ready (flash-in, reading order).
  useEffect(() => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        setBuilt(true);
      }
    };
    (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(go));
    const t = window.setTimeout(go, 1200);
    return () => window.clearTimeout(t);
  }, []);

  const onScroll = () => setScrolled((root.current?.scrollTop ?? 0) > 8);

  const scrollTo = (id: string) => (e: { preventDefault: () => void }) => {
    e.preventDefault(); // the app uses the URL hash for screens, so in-page links must not touch it
    const el = root.current?.querySelector<HTMLElement>(`#${id}`);
    if (!el) return;
    const reduced = document.documentElement.dataset.motion === "reduced";
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const pick = (key: ScreenKey, focus = false) => {
    setShot(key);
    setSwapKey((n) => n + 1);
    if (focus) tabRefs.current[key]?.focus();
  };
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    pick(SCREENS[(i + d + SCREENS.length) % SCREENS.length].key, true);
  };
  const active = SCREENS.find((s) => s.key === shot)!;

  // #root renders the app at 75% zoom for the tablet UI; the landing page is a normal 100% document, so it mounts on <body>.
  return createPortal(
    <div ref={root} onScroll={onScroll} className={`landing js${built ? " built" : ""}`}>
      <header className={`top${scrolled ? " scrolled" : ""}`}>
        <div className="wrap">
          <a className="wordmark" href="#/" onClick={(e) => { e.preventDefault(); root.current?.scrollTo({ top: 0 }); }} aria-label="TAPAK home">
            <img src={tapakWordmark} alt="TAPAK" height={24} />
          </a>
          <nav className="nav" aria-label="Sections">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} onClick={scrollTo(n.id)}>{n.label}</a>
            ))}
          </nav>
          <div className="top-actions">
            <a className="btn btn-secondary btn-sm" href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
            <a className="btn btn-primary btn-sm" href="#/hub">Open planner</a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <video className="hero-bg" src="/landing/hero.mp4" autoPlay muted loop playsInline aria-hidden="true" />
          <div className="wrap">
            <div className="hero-grid">
              <div className="hero-copy">
                <h1 className="lp lp-text" style={at(0)}>Plan a crewed walk on Mars, <span className="soft">and the walk back</span></h1>
                <p className="lede lp lp-text" style={at(1)}>
                  TAPAK is a route planner for single crewed surface excursions. It pairs stochastic route planning with <strong>Damon</strong>, a biomechanical walking model fine-tuned from KINESIS for Martian conditions. Set a base, science goals and mission limits, and TAPAK returns an optimized route with an oxygen budget, radiation dose, walk-back margin and an explained GO, CAUTION or NO-GO verdict.
                </p>
                <div className="actions">
                  <a className="btn btn-primary lp lp-block" style={at(2, { bg: "var(--brand)", fg: "var(--surface-base)" })} href="#/hub">Open the Software</a>
                </div>
              </div>
            </div>

            <div className="readouts" aria-label="Sample route readouts">
              {READOUTS.map((r, i) => (
                <div key={r.label} className="readout lp lp-text" style={at(4 + i)}>
                  <span className="readout-label">{r.label}</span>
                  <span className="readout-value"><span className="num"><CountUp value={r.num} /></span><span className="unit">{r.unit}</span></span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Section id="walking-cost">
          <div className="block-head">
            <h2>Walking cost learned from a simulated, suited leg in Mars gravity</h2>
            <div>
              <p>The usual energy equations for walking were fitted to people in street clothes at 1 g. A suited astronaut at 3.71 m/s² carries more mass with less weight, and steps differently on loose, tilted ground.</p>
              <p>TAPAK trains a leg to walk in those conditions and keeps what it learns as a cost the route search can ask for at every step.</p>
            </div>
          </div>
          <ol className="chain" aria-label="From simulation to route">
            <li className="link lp lp-text" style={at(0)}><span className="node lp-data">01</span><h3>Damon</h3><p>Walking policy fine-tuned from KINESIS with reinforcement learning</p></li>
            <li className="link lp lp-text" style={at(1)}><span className="node lp-data">02</span><h3>80-muscle leg</h3><p>Crosses synthetic terrain patches at Mars gravity with spacesuit mass</p></li>
            <li className="link lp lp-text" style={at(2)}>
              <span className="node lp-data">03</span><h3>Surrogate</h3><p>Gradient-boosted model that turns each simulated step into numbers</p>
              <dl className="out">
                <div><dt>Energy</dt><dd className="lp-data">per step</dd></div>
                <div><dt>Fall probability</dt><dd className="lp-data">per step</dd></div>
                <div><dt>Stability</dt><dd className="lp-data">per step</dd></div>
              </dl>
            </li>
            <li className="link lp lp-text" style={at(3)}><span className="node node-end lp-data">04</span><h3>Route search</h3><p>Stochastic planner that walks the per-step costs between your stops</p></li>
          </ol>
        </Section>

        <Section id="screens">
          <div className="screens-head">
            <h2>From plan to debrief</h2>
            <div className="tabs" role="tablist" aria-label="Planner screens">
              {SCREENS.map((s, i) => (
                <button
                  key={s.key}
                  ref={(el) => { tabRefs.current[s.key] = el; }}
                  role="tab"
                  aria-selected={shot === s.key}
                  tabIndex={shot === s.key ? 0 : -1}
                  onClick={() => pick(s.key)}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <figure key={swapKey} className={`shot${swapKey ? " swap" : ""}`}>
            <img src={`/landing/${active.key}.jpg`} width={1366} height={1024} alt={active.alt} loading="lazy" />
          </figure>
        </Section>

        <Section id="link-budget">
          <div className="block-head">
            <h2>Proven in Earth orbit, rebuilt for Mars</h2>
            <div>
              <p>Radio links to low orbit satellites used to be judged by a best case and a worst case, which says little about how often either happens. Gongora-Torres and colleagues instead treat the elevation angle of a pass as a random variable. That gives the expected received power, its spread and the probability of an outage.</p>
              <p>A relay orbiter at 400 km over Jezero West has the same geometry: a moving transmitter and a path length that keeps changing. TAPAK applies the method to the suit radio, so a crew can see when the link closes and how often it will not. The figures below come from the app's demo scenario of UHF at 401.6 MHz, four relays and 214 simulated passes. They are modelled, not measured.</p>
            </div>
          </div>

          <div className="paper lp lp-block" style={at(0, { bg: "var(--surface-raised)", fg: "var(--text-primary)" })}>
            <div>
              <div className="paper-title">Link budget analysis for LEO satellites based on the statistics of the elevation angle</div>
              <div className="paper-by">Gongora-Torres, Vargas-Rosales, Aragón-Zavala and Villalpando-Hernandez · IEEE Access, 2022</div>
            </div>
            <a className="doi" href={`https://doi.org/${PAPER_DOI}`} target="_blank" rel="noopener noreferrer">{PAPER_DOI}</a>
          </div>

          <figure className="shot">
            <img src="/landing/link-budget.jpg" width={1366} height={1024} loading="lazy" alt="TAPAK Comms screen, relay link view: uplink margin across the sky, gamma fit of the elevation statistics, and the receive and transmit link budget as candles" />
          </figure>

          <ol className="chain c3 steps-after" aria-label="Elevation based calculation">
            <li className="link lp lp-text" style={at(0)}><span className="node lp-data">01</span><h3>Fit the elevation</h3><p>Simulated relay passes over the site give a maximum elevation each. A gamma distribution is fitted to them.</p><div className="formula">k 2.40 · λ 14.8° · E[θ] 33.4°</div></li>
            <li className="link lp lp-text" style={at(1)}><span className="node lp-data">02</span><h3>Budget at the mean elevation</h3><p>Transmit power and antenna gains, minus free-space, atmosphere, dust and pointing losses, taken at the mean elevation.</p><div className="formula">margin = E[Pr] − Pth</div></li>
            <li className="link lp lp-text" style={at(2)}><span className="node node-end lp-data">03</span><h3>Outage probability</h3><p>θmin is the lowest elevation where the margin is 0 dB. The outage is the fitted distribution's value there.</p><div className="formula">P_out = F(θmin)</div></li>
          </ol>

          <table className="dtable">
            <thead><tr><th scope="col">Result</th><th scope="col">Downlink, relay to suit</th><th scope="col">Uplink, suit to relay</th></tr></thead>
            <tbody>
              {LINK_ROWS.map((r, i) => (
                <tr key={r.label} className="lp lp-text" style={at(i)}>
                  <td>{r.label}</td>
                  <td className="lp-data">{r.down}<span className="u">{r.unit}</span></td>
                  <td className="lp-data">{r.up}<span className="u">{r.unit}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="jezero">
          <div className="block-head">
            <h2>Jezero Crater, layered from NASA data</h2>
            <div><p>Three NASA sources describe the ground, the air and the sky over the planning patch. Each one feeds a different part of the verdict.</p></div>
          </div>
          <div className="layers">
            <div className="layer">
              <div><h3>HiRISE terrain model and orthoimage</h3></div>
              <div><p>A 1-meter elevation model gives slope and roughness for every step; the orthoimage is the map you plan on.</p></div>
              <div className="layer-ramp"><div className="legend-head"><span>Slope</span><span>deg</span></div><div className="ramp ramp-slope" /><div className="ramp-ends lp-data"><span>0</span><span>35</span></div></div>
            </div>
            <div className="layer">
              <div><h3>Perseverance MEDA temperature and pressure</h3></div>
              <div><p>Hourly medians over eight sols set air and ground temperature for the time of day you walk, and the pressure that shields you.</p></div>
              <div className="layer-ramp"><div className="legend-head"><span>Air temperature</span><span>°C</span></div><div className="ramp ramp-thermal" /><div className="ramp-ends lp-data"><span>−75</span><span>−37</span></div></div>
            </div>
            <div className="layer">
              <div><h3>Galactic cosmic ray dose, scaled by sky view</h3></div>
              <div><p>A dose model scaled to local pressure, then reduced where crater walls and ridges hide part of the sky.</p></div>
              <div className="layer-ramp"><div className="legend-head"><span>Sky view</span><span>fraction</span></div><div className="ramp ramp-rad" /><div className="ramp-ends lp-data"><span>0</span><span>1</span></div></div>
            </div>
          </div>
        </Section>

        <Section id="verdict">
          <div className="block-head">
            <h2>Three verdicts, each with its reasons</h2>
            <div><p>The planner checks the route against the mission limits and writes down what it found, with the number behind each line.</p></div>
          </div>
          <table className="vtable">
            <thead><tr><th scope="col">Verdict</th><th scope="col">When</th><th scope="col">Reasons the engine writes</th></tr></thead>
            <tbody>
              <tr className="lp lp-text" style={at(0)}><td><span className="chip"><span className="dot safe" />GO</span></td><td>Every limit is met</td><td className="muted">No reasons, no cautions</td></tr>
              <tr className="lp lp-text" style={at(1)}><td><span className="chip"><span className="dot caution" />CAUTION</span></td><td>Within limits, something to watch</td><td><span className="q">Slope up to 18.8° on the route, above the 15° caution level (limit 20°)</span><span className="q">Ground down to −75 °C during the walk: limit glove contact</span></td></tr>
              <tr className="lp lp-text" style={at(2)}><td><span className="chip"><span className="dot danger" />NO-GO</span></td><td>A hard limit is broken</td><td><span className="q">Outside the 7:00–17:00 LMST daylight window (ends 17:31)</span></td></tr>
            </tbody>
          </table>
        </Section>

        <Section id="references">
          <div className="block-head">
            <h2>References</h2>
            <div><p>Published models and data behind the walking cost, the link budget, the radiation dose and the map layers.</p></div>
          </div>
          <ol className="refs">
            {REFS.map((r) => (
              <li key={r.who}>
                <span className="who">{r.who}</span> {r.text}
                {r.doi ? <> <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer">doi:{r.doi}</a></> : null}
              </li>
            ))}
          </ol>
        </Section>
      </main>

      <footer>
        <div className="wrap foot">
          <img className="foot-logo" src={tapakWordmark} alt="TAPAK" />
          <div className="credit">
            <p>
              HiRISE imagery NASA/JPL-Caltech/University of Arizona. Terrain model: USGS Mars 2020 TRN HiRISE DTM mosaic, doi:10.5066/P9REJ9JN. MEDA data NASA/JPL-Caltech/CAB(CSIC-INTA), sols 1349 to 1368. Dose model: MSL RAD Gale average scaled to MEDA pressure (Guo et al. 2017) and terrain sky view. Route figures and link budget values are planning outputs and simulations from the TAPAK app, not Mars measurements or guarantees
            </p>
          </div>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
