# SimpleProp — Cesium Satellite Globe

Open demo: a React + CesiumJS globe that loads a fixed TLE catalog from Postgres through a TypeScript UI backend, propagates each satellite with **SGP4 in the browser** (`satellite.js`), and supports visibility toggles, play/pause, a sliding **1-day** scrubber over a **±7.5 day** simulation window, and one-revolution orbit trails.

No auth. Session view state (visible set, clock, trails) lives **only in the browser tab** — closing the tab discards it; nothing is written back to Postgres.

## Architecture

```
Postgres (TLE catalog) → Fastify UI backend → React + Cesium SPA
                              ↑
                     GET /api/satellites
```

- **Browser never talks to Postgres.** Only the UI backend has `DATABASE_URL`.
- **Shared data:** one TLE catalog; every client fetches the same list on load.
- **Session-local UI state:** toggles, play/pause, scrubber time, and trails are in-memory per tab.

### Backend ↔ database practice

| Approach | Verdict |
|---|---|
| Browser → Postgres | **Bad.** Exposes credentials and couples the client to schema. |
| UI backend (Node/TS) → Postgres | **Good for v1.** Standard BFF: one server owns SQL and returns JSON. |
| Extra microservice between UI backend and DB | Not required for many browsers. Add later only if another product needs a shared data API. |

## Repo layout

```
apps/web          Vite + React + TypeScript + CesiumJS SPA
apps/api          Fastify TypeScript UI backend (queries Postgres)
db/init.sql       Schema + seeded public TLEs (includes ISS)
docker-compose.yml
```

## Prerequisites

- Node.js 22+ and npm
- Docker + Docker Compose (for the full stack)
- A free [Cesium ion](https://cesium.com/ion/signup) access token (for default imagery/terrain)

## Cesium ion token

1. Create a free account at [cesium.com/ion](https://cesium.com/ion/signup).
2. Copy your default access token.
3. For local Vite:

```bash
cp apps/web/.env.example apps/web/.env
# edit apps/web/.env and set:
# VITE_CESIUM_ION_TOKEN=your_token_here
```

4. For Docker Compose, export before `up`:

```bash
export VITE_CESIUM_ION_TOKEN=your_token_here
docker compose up --build
```

The app builds and runs without a token, but Cesium’s default ion imagery may fail to load until one is set.

## Run with Docker Compose

```bash
export VITE_CESIUM_ION_TOKEN=your_token_here   # optional but recommended
docker compose up --build
```

| Service | URL |
|---|---|
| Web UI | http://localhost:8080 |
| API | http://localhost:3001/api/satellites |
| Postgres | localhost:5433 → container 5432 (`simpleprop` / `simpleprop` / db `simpleprop`) |

`db/init.sql` runs on first Postgres volume create. Schema and seed are
fresh-start only: satellite metadata lives in `satellites` (NORAD IDs are not
unique), and epoch-ordered element sets live in `satellite_tles`.

To wipe and re-seed:

```bash
docker compose down -v
docker compose up --build
```

## Local development (npm workspaces)

```bash
# Terminal 1 — Postgres (host port 5433)
docker compose up db

# Terminal 2 — API
cp apps/api/.env.example apps/api/.env   # DATABASE_URL uses localhost:5433
npm install
npm run dev:api

# Terminal 3 — Web (proxies /api → :3001)
cp apps/web/.env.example apps/web/.env   # set VITE_CESIUM_ION_TOKEN
npm run dev:web
```

Open http://localhost:5173.

Useful scripts from the repo root:

```bash
npm run typecheck
npm run build
```

## API

`GET /api/satellites` — returns an array of enabled satellites:

```json
[
  {
    "id": 1,
    "noradId": 25544,
    "name": "ISS (ZARYA)",
    "tles": [
      {
        "id": "1",
        "epoch": "2026-07-21T04:27:10.177Z",
        "tleLine1": "1 25544U ...",
        "tleLine2": "2 25544 ..."
      }
    ]
  }
]
```

Read-only; no write endpoints.

## Frontend behavior

1. Fetch catalog once on mount.
2. Parse each satellite's epoch-ordered TLE history with `satellite.js`. At a newer TLE's exact epoch, propagation switches to that TLE; times before the first epoch use the earliest available TLE.
3. Cesium `Clock` spans a configurable simulation window (**±7.5 days** by default, 15 days total) centered on session “Now.” Playback direction and speed are user-controlled (default **1×** real-time).
4. The scrubber shows only a **1-day** sliding view (±12 hours). Playing or dragging against an edge pans that view across the full simulation; position samples are **not** preloaded for the whole span.
5. The browser keeps roughly one day of inertial SGP4 samples around the playhead. When the clock leaves that buffer (scrub or play), samples are rebuilt and only TLEs that overlap the local window are used.
6. Cesium interpolates piecewise within each TLE segment without interpolating across an epoch switch.
7. Orbit paths show one period (`2π / n` from the active TLE's mean motion). When an ion token is configured, Cesium World Terrain is enabled.
8. Checklist toggles show/hide point + trail without refetching.

Window sizes live in `apps/web/src/lib/timeConfig.ts` (`SIM_HALF_MINUTES`, `SCRUB_VIEW_HALF_MINUTES`, `SAMPLE_HALF_MINUTES`).

See [`TLE_TRANSITIONS.md`](TLE_TRANSITIONS.md) for the current hard-switch
semantics and a future display-only blending design.

## Alternative: server-side propagation (not implemented)

For later, if catalogs grow large, you need validated/force-model propagators, or you want to keep TLEs off the client:

- API (or worker) runs SGP4 and exposes time-sampled positions or a WebSocket/stream of ECEF states.
- UI becomes a thin Cesium renderer (no `satellite.js`).
- Suggested sketches:
  - `GET /api/satellites/:id/ephemeris?t0=&t1=&step=`
  - Tick stream: `{ satId, time, x, y, z }`

Client-side SGP4 (this repo) is preferred for dozens–~100 satellites and many concurrent browsers: the backend stays a thin TLE read; animation cost stays on each client.

## Out of scope (v1)

Auth, persisted satellite sets, multi-tenant catalogs, TLE admin UI, synced multi-user views, ground tracks, sensor FOV, non-SGP4 force models, cloud deploy beyond Compose.

## Data source note

Seed TLEs in `db/init.sql` are public two-line elements (e.g. CelesTrak-style station/visual/GPS/weather/science/Starlink samples, including ISS). Refresh the seed periodically for better accuracy; SGP4 error grows as TLEs age.
