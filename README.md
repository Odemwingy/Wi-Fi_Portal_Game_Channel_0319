# Wi-Fi Portal Game Channel

Monorepo scaffold for the onboard Wi-Fi Portal Game Channel platform.

## Workspace Layout

```text
apps/
  channel-web/           Passenger-facing game channel built with React + Vite
  platform-api/          NestJS platform API skeleton with trace-aware request logging
packages/
  game-sdk/              Game package metadata schema, launch contracts, and event protocol
  shared-observability/  Shared tracing, structured logging, and error primitives
docs/
  game-package-spec.md   Game package integration and SDK contract
examples/
  game-packages/
    quiz-duel/           Example metadata.yaml for a multiplayer game package
```

## Commands

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
pnpm dev:web
pnpm dev:api
pnpm infra:backend:up
pnpm infra:backend:down
pnpm infra:redis:up
pnpm dev:api:redis
pnpm test:smoke
```

## Local State Store Modes

The platform API supports two state store backends:

- `memory`: default local mode, no external dependency required
- `redis`: persistent local-dev mode backed by Docker Compose Redis

### Memory Mode

```bash
pnpm dev:api
```

### Redis Mode

```bash
pnpm infra:redis:up
pnpm dev:api:redis
```

### Docker Compose Backend

```bash
pnpm infra:backend:up
```

This starts:

- `redis` on `6379`
- `platform-api` on `3000`

The API container is wired to Redis by default and exposes:

- `GET http://127.0.0.1:3000/api/health`
- `GET http://127.0.0.1:3000/api/health/ready`
- `GET http://127.0.0.1:3000/api/metrics`
- `GET|PUT http://127.0.0.1:3000/api/admin/channel/content`
- `POST http://127.0.0.1:3000/api/admin/auth/login`
- `GET  http://127.0.0.1:3000/api/admin/auth/me`
- `POST http://127.0.0.1:3000/api/admin/auth/logout`
- `GET  http://127.0.0.1:3000/api/admin/audit/logs`
- `GET|PUT http://127.0.0.1:3000/api/admin/points-rules/config`
- `GET http://127.0.0.1:3000/api/admin/points-rules/audit`
- `GET|PUT http://127.0.0.1:3000/api/admin/airline-points/config`
- `GET  http://127.0.0.1:3000/api/admin/airline-points/sync-records`
- `POST http://127.0.0.1:3000/api/admin/airline-points/dispatch-pending`
- `POST http://127.0.0.1:3000/api/admin/airline-points/sync-records/:syncId/retry`
- `WS  http://127.0.0.1:3000/ws/game-room`

The default environment template is [`.env.example`](./.env.example). The Redis container definition lives in [`docker-compose.yml`](./docker-compose.yml).

## Delivery Notes

- `apps/channel-web` is the initial passenger entry surface for the game channel.
- `apps/channel-web` now also exposes a minimal content admin surface at `/admin/channel`.
- `apps/channel-web` now also exposes an operations admin surface at `/admin/operations` for points rules and airline sync management.
- `apps/platform-api` is the initial Game Platform service shell.
- `apps/platform-api` now includes a configurable airline points sync outbox with realtime and batch dispatch modes.
- `apps/platform-api` now includes a configurable points rules engine with audit ledger and per-game rule sets.
- `packages/game-sdk` defines the integration contract for onboard game packages.
- `packages/shared-observability` is created at project bootstrap time, per the observability wiki requirements.
- `apps/platform-api` can now switch between in-memory state and Redis-backed state through `STATE_STORE_BACKEND`.

## Demo Admin Accounts

- `content-admin / portal-content-123`
- `ops-admin / portal-ops-123`
- `super-admin / portal-super-123`

These are local demo credentials for the current implementation of `/admin/channel`, `/admin/operations`, and the protected `/api/admin/*` endpoints. They should be replaced by a real identity source before production use.

## Observability and Rollback

- HTTP access logs, room lifecycle logs, realtime logs, points logs, and rewards logs all use the shared JSON Lines logger with `trace_id/span_id`.
- `GET /api/health` is the liveness check.
- `GET /api/health/ready` validates readiness against the configured state store backend.
- `GET /api/metrics` exposes the current room count, websocket connections, HTTP QPS, and average websocket RTT.
- Release and rollback steps are documented in [`docs/release-playbook.md`](./docs/release-playbook.md).

## Test Baseline

- `pnpm test` covers unit and integration cases.
- `pnpm test:smoke` validates the Docker-backed API, websocket core flow, points rules audit path, and airline sync retry path against a running local stack.
- Compatibility, weak-network, and release-gate expectations are documented in [`docs/test-strategy.md`](./docs/test-strategy.md).
- The 25-game candidate inventory, rollout waves, and acceptance matrix are documented in [`docs/game-rollout-plan.md`](./docs/game-rollout-plan.md).
- The Spot the Difference Race research and implementation breakdown is documented in [`docs/spot-the-difference-race-plan.md`](./docs/spot-the-difference-race-plan.md).
