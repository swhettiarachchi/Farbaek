# syntax=docker/dockerfile:1.7
#
# Farbaek's production image (ADR 0035). scripts/vps/deploy.sh builds it on
# the VPS:
#   docker build --secret id=env,src=/opt/farbaek/env/production.env \
#     --build-arg FARBAEK_COMMIT=<sha> -t farbaek-app:<sha> .
#
# The env file is mounted as a build secret: `next build` reads it as
# .env.production to inline the NEXT_PUBLIC_* values, and it's never written
# into a layer. Server secrets reach the running container from compose's
# env_file, not from the image.

ARG NODE_IMAGE=node:24.13.1-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Electron is only for the desktop app; the server never downloads its binary.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN --mount=type=secret,id=env,target=/app/.env.production,required=true \
    NODE_OPTIONS=--max-old-space-size=4096 pnpm build

FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app /app
ARG FARBAEK_COMMIT=""
ENV FARBAEK_COMMIT=${FARBAEK_COMMIT}
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
