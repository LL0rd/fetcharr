# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: static ffmpeg/ffprobe and the deno runtime yt-dlp needs for YouTube.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS utils

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip xz-utils \
  && rm -rf /var/lib/apt/lists/*

COPY docker/fetch-ffmpeg.sh docker/fetch-deno.sh /usr/local/src/
RUN chmod +x /usr/local/src/fetch-*.sh \
  && /usr/local/src/fetch-ffmpeg.sh \
  && /usr/local/src/fetch-deno.sh

# ---------------------------------------------------------------------------
# Stage 2: Nuxt output and the bundled worker.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@10.14.0

WORKDIR /build

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY apps apps
COPY packages packages

RUN pnpm --filter @fetcharr/web build \
  && pnpm --filter @fetcharr/worker build

# The worker bundle keeps better-sqlite3 external; the package ships prebuilt
# binaries for every platform, so copying it is enough. Sources, the vendored
# sqlite amalgamation and the prebuilds of other platforms are dropped.
RUN mkdir -p /prod/worker/node_modules \
  && cp -RL packages/db/node_modules/better-sqlite3 /prod/worker/node_modules/ \
  && rm -rf /prod/worker/node_modules/better-sqlite3/deps \
    /prod/worker/node_modules/better-sqlite3/src \
    /prod/worker/node_modules/better-sqlite3/binding.gyp \
  && find /prod/worker/node_modules/better-sqlite3/prebuilds \
    -name '*.node' ! -name 'linux-x64.node' ! -name 'linux-arm64.node' -delete \
  && cp apps/worker/dist/index.mjs /prod/worker/index.mjs \
  && cp -R apps/web/.output /prod/web \
  && find /prod/web -name '*.map' -delete \
  && cp -R packages/db/migrations /prod/migrations

# ---------------------------------------------------------------------------
# Stage 3: runtime — s6 supervises the Nuxt server and the worker.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ARG TARGETARCH
ARG S6_OVERLAY_VERSION=3.2.1.0
# Overridable so the release workflow can stamp the real repository URL.
ARG IMAGE_SOURCE=https://github.com/roschkowski/fetcharr

LABEL org.opencontainers.image.title="Fetcharr" \
  org.opencontainers.image.description="Self-hosted media downloader built on yt-dlp." \
  org.opencontainers.image.source="${IMAGE_SOURCE}" \
  org.opencontainers.image.licenses="MIT"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    atomicparsley \
    ca-certificates \
    curl \
    passwd \
    tzdata \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
  case "$TARGETARCH" in \
    amd64) S6_ARCH=x86_64 ;; \
    arm64) S6_ARCH=aarch64 ;; \
    *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
  esac; \
  base="https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}"; \
  curl -fsSL -o /tmp/s6-noarch.tar.xz "${base}/s6-overlay-noarch.tar.xz"; \
  curl -fsSL -o /tmp/s6-arch.tar.xz "${base}/s6-overlay-${S6_ARCH}.tar.xz"; \
  tar -C / -Jxpf /tmp/s6-noarch.tar.xz; \
  tar -C / -Jxpf /tmp/s6-arch.tar.xz; \
  rm -f /tmp/s6-noarch.tar.xz /tmp/s6-arch.tar.xz; \
  apt-get purge -y xz-utils; apt-get autoremove -y; rm -rf /var/lib/apt/lists/*

# The node image already owns 1000:1000, so `abc` starts elsewhere and the
# init script moves it to PUID/PGID at container start.
RUN groupadd -g 911 abc \
  && useradd -u 911 -g abc -d /config -s /usr/sbin/nologin abc

COPY --from=utils /out/ /usr/local/bin/
COPY --from=build /prod/ /app/
COPY docker/root/ /
RUN chmod +x /etc/s6-overlay/scripts/init-fetcharr \
  /etc/s6-overlay/s6-rc.d/web/run \
  /etc/s6-overlay/s6-rc.d/worker/run

ENV NODE_ENV=production \
  CONFIG_DIR=/config \
  DOWNLOADS_DIR=/downloads \
  FETCHARR_MIGRATIONS_DIR=/app/migrations \
  NITRO_PORT=3000 \
  HOST=0.0.0.0 \
  PUID=1000 \
  PGID=1000 \
  UMASK=022 \
  TZ=Etc/UTC \
  S6_BEHAVIOUR_IF_STAGE2_FAILS=2 \
  S6_SERVICES_GRACETIME=30000

EXPOSE 3000
VOLUME ["/config", "/downloads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/init"]
