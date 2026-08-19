# Fetcharr

Fetcharr is a self-hosted media downloader built on top of [yt-dlp](https://github.com/yt-dlp/yt-dlp).
You paste a URL, Fetcharr queues it, a background worker runs yt-dlp and the finished file lands in
your library. The web interface is a Nuxt 4 app, downloads are executed by a separate worker process,
and all state lives in a single SQLite database. It is meant to run as a Docker container, with
Unraid as the primary deployment target.

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

## Documentation

- `docs/superpowers/specs` — feature specification
- `docs/superpowers/plans` — implementation plans per phase
- `docs/design` — design system and UI reference
