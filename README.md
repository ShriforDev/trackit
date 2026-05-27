# trackit

A multi-tenant device tracking app with isolated tenancy, real-time location streaming, and historical route playback.

## Stack

- **Frontend:** Vite + React 19 + TypeScript + Tailwind v4 + shadcn (`base-lyra`)
- **Backend:** Bun + Hono *(Step 3)*
- **Auth:** Better Auth with the organization plugin and scope-based access control *(Step 6+)*
- **Realtime store:** Tile38 — running locally
- **Historical store:** PostgreSQL 17 + TimescaleDB — running locally
- **Map:** Leaflet + react-leaflet, public OpenStreetMap tiles *(Step 14)*
- **Live transport:** WebSocket *(Step 13)*

## Repository layout

```
trackit/
├── apps/
│   ├── web/              # React frontend (Vite)
│   └── api/              # Bun + Hono backend (stubbed)
├── packages/
│   └── shared/           # Shared types and zod schemas (stubbed)
├── docker-compose.yml    # postgres + tile38
├── .env.example          # template (committed)
├── .env                  # local dev values (gitignored)
└── package.json          # bun workspaces root
```

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.3
- [Docker](https://docs.docker.com/get-docker/) ≥ 24 with Docker Compose v2

## First-time setup

```bash
cp .env.example .env       # then edit if you want to change defaults
bun install                # install all workspace deps
bun run infra:up           # boot postgres + tile38
```

That's it. Verify both services are healthy:

```bash
docker compose ps
# postgres   running   healthy   0.0.0.0:5432->5432/tcp
# tile38     running   healthy   0.0.0.0:9851->9851/tcp
```

## App commands

```bash
bun run dev:web            # start the web app (Vite)
bun run dev:api            # placeholder until Step 3
bun run build:web          # build the web app
bun run lint:web           # lint the web app
bun run typecheck          # typecheck every workspace
bun run format             # prettier across the repo
```

## Infrastructure commands

```bash
bun run infra:up           # docker compose up -d
bun run infra:down         # docker compose down (data persists)
bun run infra:logs         # tail logs from all services
bun run infra:reset        # docker compose down -v (DESTROYS volumes)
```

## Connecting to local services

| Service     | Host          | Port  | Notes                                    |
| ----------- | ------------- | ----- | ---------------------------------------- |
| Postgres    | `localhost`   | 5433  | `postgres://trackit:<pwd>@localhost:5433/trackit` (5433 to avoid clashing with a host-installed Postgres) |
| Tile38      | `localhost`   | 9851  | Redis-protocol; use `tile38-cli` or `redis-cli` |

Quick sanity checks:

```bash
# Postgres — list installed extensions (should include timescaledb)
docker compose exec -T postgres psql -U trackit -d trackit \
  -c "SELECT extname, extversion FROM pg_extension;"

# Tile38 — ping
docker compose exec -T tile38 tile38-cli PING
```

## Roadmap

The build is incremental. We're currently between **Step 2: docker-compose infra** and **Step 3: API skeleton (Bun + Hono)**.
