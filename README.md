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
- `WS  http://127.0.0.1:3000/ws/game-room`

The default environment template is [`.env.example`](./.env.example). The Redis container definition lives in [`docker-compose.yml`](./docker-compose.yml).

## Delivery Notes

- `apps/channel-web` is the initial passenger entry surface for the game channel.
- `apps/platform-api` is the initial Game Platform service shell.
- `packages/game-sdk` defines the integration contract for onboard game packages.
- `packages/shared-observability` is created at project bootstrap time, per the observability wiki requirements.
- `apps/platform-api` can now switch between in-memory state and Redis-backed state through `STATE_STORE_BACKEND`.

## Observability and Rollback

- HTTP access logs, room lifecycle logs, realtime logs, points logs, and rewards logs all use the shared JSON Lines logger with `trace_id/span_id`.
- `GET /api/health` is the liveness check.
- `GET /api/health/ready` validates readiness against the configured state store backend.
- `GET /api/metrics` exposes the current room count, websocket connections, HTTP QPS, and average websocket RTT.
- Release and rollback steps are documented in [`docs/release-playbook.md`](./docs/release-playbook.md).

## Test Baseline

- `pnpm test` covers unit and integration cases.
- `pnpm test:smoke` validates the Docker-backed API and websocket core flow against a running local stack.
- Compatibility, weak-network, and release-gate expectations are documented in [`docs/test-strategy.md`](./docs/test-strategy.md).
- The 25-game candidate inventory, rollout waves, and acceptance matrix are documented in [`docs/game-rollout-plan.md`](./docs/game-rollout-plan.md).
