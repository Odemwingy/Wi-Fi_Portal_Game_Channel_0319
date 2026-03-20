FROM node:20-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

ARG VITE_API_BASE_URL=http://127.0.0.1:3000/api
ARG VITE_WS_BASE_URL=ws://127.0.0.1:3000

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/channel-web/package.json apps/channel-web/package.json
COPY packages/game-sdk/package.json packages/game-sdk/package.json

RUN pnpm install --frozen-lockfile

COPY apps/channel-web apps/channel-web
COPY packages/game-sdk packages/game-sdk

RUN VITE_API_BASE_URL="$VITE_API_BASE_URL" \
    VITE_WS_BASE_URL="$VITE_WS_BASE_URL" \
    pnpm --filter @wifi-portal/game-sdk build \
    && pnpm --filter @wifi-portal/channel-web build

FROM nginx:1.27-alpine AS runner

COPY docker/channel-web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/channel-web/dist /usr/share/nginx/html

EXPOSE 80
