# Fetcharr

Fetcharr is a self-hosted media downloader built on top of [yt-dlp](https://github.com/yt-dlp/yt-dlp).
You paste a URL, Fetcharr queues it, a background worker runs yt-dlp and the finished file lands in
your library. The web interface is a Nuxt 4 app, downloads are executed by a separate worker process,
and all state lives in a single SQLite database. It is meant to run as a Docker container, with
Unraid as the primary deployment target.

## Run with Docker

The image bundles the web interface, the worker, yt-dlp and ffmpeg in a single container. It listens
on port 3000 and uses two volumes: `/config` for the database and runtime configuration, `/downloads`
for finished files.

```bash
docker run -d \
  --name fetcharr \
  -p 3000:3000 \
  -v /path/to/appdata/fetcharr:/config \
  -v /path/to/media:/downloads \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=Europe/Berlin \
  ghcr.io/ll0rd/fetcharr:latest
```

The same as a Compose file:

```yaml
services:
  fetcharr:
    image: ghcr.io/ll0rd/fetcharr:latest
    container_name: fetcharr
    ports:
      - "3000:3000"
    volumes:
      - ./appdata:/config
      - ./media:/downloads
    environment:
      PUID: "1000"
      PGID: "1000"
      TZ: Europe/Berlin
      UMASK: "022"
    restart: unless-stopped
```

`PUID` and `PGID` decide which user owns the downloaded files, `UMASK` their permissions, and `TZ`
the timezone used for schedules and timestamps. Open `http://<host>:3000` afterwards to create the
first account.

## Images

Every push to `master` publishes `latest`, every `v*` tag publishes the matching version tags.

| Registry | Image | Availability |
| --- | --- | --- |
| GitHub Container Registry | `ghcr.io/ll0rd/fetcharr` | always published |
| Docker Hub | `ll0rd/fetcharr` | only when Docker Hub credentials are configured |

Both registries carry the same `linux/amd64` and `linux/arm64` manifests.

## Unraid

Fetcharr ships a Community Applications template in `unraid/fetcharr.xml`. If the template is not
listed in Community Applications yet, add the repository under *Apps → Settings → Template
Repositories*, or install the container manually and point it at the template URL:

```
https://raw.githubusercontent.com/LL0rd/fetcharr/master/unraid/fetcharr.xml
```

The template defaults to:

| Setting | Value |
| --- | --- |
| WebUI | `http://[IP]:3000` |
| `/config` | `/mnt/user/appdata/fetcharr` |
| `/downloads` | `/mnt/user/media/fetcharr` |
| `PUID` / `PGID` | `99` / `100` |

Adjust the `/downloads` path to the share your media library actually lives on.

## Subtitle-only downloads

Picking **subtitle** as the format in the add dialog fetches the subtitle track without any video or
audio. yt-dlp runs with `--skip-download --write-subs`, so only the timed text, the thumbnail and the
metadata sidecar are written. The dialog exposes three settings:

| Setting | yt-dlp flag | Default |
| --- | --- | --- |
| Languages | `--sub-langs` | `en` |
| File format | `--convert-subs` | `srt` |
| Include auto-generated | `--write-auto-subs` | on |

Languages take the yt-dlp syntax — a comma-separated list such as `de,en.*`, or `all`. Requesting
several languages writes one file per language; the library entry points at the first of them, the
rest sit next to it in the same folder.

Finished subtitles land under `<DOWNLOADS_DIR>/subtitle/` instead of `video/`, appear in the library
behind the **Subs** filter, and open as readable text instead of a player. Subscriptions accept
`subtitle` as their media type too, which keeps a channel's subtitles in sync without storing a
single video file.

## Project structure

This is a pnpm workspace monorepo.

| Package | Path | Purpose |
| --- | --- | --- |
| `@fetcharr/web` | `apps/web` | Nuxt 4 app: UI and the `/api` routes (Nitro server) |
| `@fetcharr/worker` | `apps/worker` | Long-running process that claims jobs and runs yt-dlp |
| `@fetcharr/db` | `packages/db` | SQLite schema, Drizzle migrations and job repository |
| `@fetcharr/shared` | `packages/shared` | Zod schemas and types shared by web and worker |

Web and worker do not talk to each other directly — the database is the queue. The API writes jobs,
the worker claims them, and the worker's heartbeat in the `settings` table tells the API whether the
worker is alive.

## Development setup

Requires Node.js 22 or newer, pnpm, and `yt-dlp` plus `ffmpeg` on your `PATH`.

```bash
pnpm install
pnpm dev:web     # Nuxt dev server on http://localhost:3000
pnpm dev:worker  # worker loop, in a second terminal
```

Both processes need to point at the same directories:

| Variable | Default | Meaning |
| --- | --- | --- |
| `CONFIG_DIR` | `./data/config` | SQLite database, `cookies.txt` and other runtime config |
| `DOWNLOADS_DIR` | `./data/downloads` | Target directory for finished downloads |

The database file is created and migrated automatically on first start.

`GET /api/health` is the only route reachable without authentication and reports database and worker
status:

```json
{ "status": "ok", "db": true, "worker": true }
```

## Tests

```bash
pnpm test
```

This runs the Vitest suites of every workspace package.

## Enable Docker Hub publishing

The `Docker` workflow always pushes to GHCR and additionally pushes to Docker Hub as soon as both
credentials exist as repository secrets. Without them the Docker Hub steps are skipped, so no fork
fails because of missing credentials.

1. Create an access token on Docker Hub under *Account settings → Personal access tokens* with
   *Read & Write* permission.
2. In the GitHub repository, open *Settings → Secrets and variables → Actions → New repository
   secret*.
3. Add `DOCKERHUB_USERNAME` with your Docker Hub username.
4. Add `DOCKERHUB_TOKEN` with the token from step 1.
5. Push to `master` or push a `v*` tag. The workflow then publishes to
   `docker.io/<DOCKERHUB_USERNAME>/fetcharr` with the same tags as GHCR.

Removing either secret disables the Docker Hub push again.

## Documentation

- `docs/superpowers/specs` — feature specification
- `docs/superpowers/plans` — implementation plans per phase
- `docs/design` — design system and UI reference
