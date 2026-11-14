# Marswalk backend (Flask)

API for the Marswalk web GUI. It serves the two endpoints the Comms screens already call
(`src/lib/comms-api.ts`), and it can also serve the built front-end from `dist/`.

| Route | Returns | Front-end type |
| --- | --- | --- |
| `GET /health` | `{"status": "ok", "version": …}` | |
| `GET /comms/passes` | relay passes, sol summary, contact windows, site panel | `CommsPassesData` |
| `GET /comms/link` | gamma fit, θmin and outage, wedge shading, two link-budget waterfalls | `CommsLinkData` |
| `GET /`, `/<file>` | `../dist/` (when it exists and `MARSWALK_SERVE_DIST` is not `0`) | |

Optional query parameters on both comms routes: `lat`, `lon` (site, degrees), `now`, `eva_start`, `eva_end`
(LMST hours), `mask` (horizon mask, degrees). Example: `/comms/passes?now=10.5&eva_end=13`. Bad values return 400 with a
JSON `error`.

## Run

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows (source .venv/bin/activate elsewhere)
pip install -r requirements.txt
python app.py                     # dev server, http://127.0.0.1:5000
python -m pytest                  # tests
waitress-serve --port 5000 app:app   # production
```

Point the front-end at it with `marswalk/.env.local`:

```
VITE_MARSWALK_API_URL=http://localhost:5000
```

Then run `npm run dev`. The Comms sub-heading changes from "dummy data, backend not connected" to "modelled by the comms
backend". If the front-end is served by this backend (`npm run build`, then open http://localhost:5000), build with
`VITE_MARSWALK_API_URL=.` so the requests stay on the same origin.

| Env variable | Default | |
| --- | --- | --- |
| `MARSWALK_HOST` / `MARSWALK_PORT` | `127.0.0.1` / `5000` | `python app.py` only |
| `MARSWALK_CORS_ORIGINS` | `*` | comma-separated origins, e.g. `http://localhost:5173` |
| `MARSWALK_SERVE_DIST` | `1` | `0` = API only |
| `MARSWALK_DIST_DIR` | `../dist` | |
| `FLASK_DEBUG` | unset | `1` = debugger and reload |

## What is modelled

The values are **modelled, not measured**. Every assumption is in `marswalk_api/config.py`.

- **Relays** (`orbit.py`): four circular orbits at 400 km, with the elements from the front-end dummy data, so the
  globe and the pass list agree at t = 0. Keplerian mean motion and the rotation of Mars. No J2 precession, no drag.
  The frame conventions match `src/lib/orbit.ts`.
- **Passes** (`comms.py`): elevation is sampled every 10 s. A pass is a stretch above the horizon mask. A pass is
  usable when its maximum elevation reaches θmin of the limiting link direction (uplink, by default). Contact, gaps
  and EVA coverage count the time any relay is at or above θmin.
- **Link** (`link.py`): UHF 401.6 MHz. E[Pr] = Pt + Gt − FSPL − dust − pointing + Gr. FSPL is taken at the slant
  range of the mean pass elevation. The per-pass maximum elevations over 20 sols are fitted with a gamma distribution
  by method of moments. Outage is the gamma CDF at θmin, where θmin is the elevation at which the margin is 0 dB.
  The transmit powers, gains and thresholds are the values drawn in the Figma frame, not datasheet values.
- **Waterfall geometry** (`layout.py`): the front-end draws `Budget` objects as given, so the backend lays out the
  chart. It uses the frame's broken axis: 4 px/dB above 0 dBW and 8 px/dB below −125 dBW.

Not modelled: terrain masking beyond a flat horizon mask, antenna patterns, dust opacity from MEDA, and the
astronaut's movement during the EVA.

## Layout

```
backend/
  app.py                 entry point (python app.py, or app:app for a WSGI server)
  marswalk_api/
    __init__.py          create_app(): config, CORS, JSON errors, dist/ serving
    routes.py            /health, /comms/passes, /comms/link, query overrides
    config.py            Scenario, Site, Relay, LinkSide (all assumptions)
    orbit.py             relay propagation, elevation, slant range
    link.py              FSPL, margin, θmin, gamma fit and CDF
    comms.py             builds the two payloads (cached per scenario)
    layout.py            link-budget waterfall geometry
  tests/test_api.py      payload contract + model checks
```
