# Fetcharr Phase 1 — Foundation & Download-Kern

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lauffähiges Monorepo, in dem ein Download E2E funktioniert: URL im UI einwerfen → Worker lädt via yt-dlp → Job-Fortschritt live in der Queue-Ansicht → fertige Datei registriert.

**Architecture:** pnpm-Monorepo. `packages/db` (Drizzle+SQLite/WAL, geteilt von Web und Worker), `packages/shared` (Zod-Schemas/Types), `apps/worker` (Queue-Consumer, yt-dlp-Runner), `apps/web` (Nuxt 4: Auth, API, SSE, Queue-UI nach Mockup `docs/design/Fetcharr.dc.html`). IPC ausschließlich über SQLite.

**Tech Stack:** Node 22, TypeScript, pnpm, Nuxt 4, Drizzle ORM + better-sqlite3, Zod, Vitest, argon2 (via `@node-rs/argon2`), croner (erst Phase 3/4), execa.

**Spec:** `docs/superpowers/specs/2026-08-19-fetcharr-design.md` — bei Widerspruch gewinnt die Spec.

**Konventionen für alle Tasks:**
- TDD: Test zuerst, rot sehen, implementieren, grün sehen, committen.
- Commits ohne jeden Claude-/AI-Hinweis, Autor Dimitri Roschkowski.
- Pfade für Laufzeitdaten kommen IMMER aus `env`: `CONFIG_DIR` (Default `./data/config`), `DOWNLOADS_DIR` (Default `./data/downloads`). Nie hartkodieren.
- Keine Datei > ~300 Zeilen; bei Wachstum aufteilen.

---

### Task 1: Monorepo-Gerüst

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.npmrc`, `vitest.config.ts` (Root, mit `test.projects` auf alle Pakete — `vitest.workspace.ts` ist deprecated)
- Create: `apps/web/package.json` (Platzhalter, Task 11), `apps/worker/package.json`, `packages/db/package.json`, `packages/shared/package.json`

- [ ] **Step 1: Workspace-Dateien anlegen**

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
```

Root-`package.json`:
```json
{
  "name": "fetcharr",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "dev:worker": "pnpm --filter @fetcharr/worker dev",
    "dev:web": "pnpm --filter @fetcharr/web dev"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.base.json`: `strict: true`, `module: "ESNext"`, `moduleResolution: "bundler"`, `target: "ES2023"`, `types: ["node"]`.

`.gitignore`: `node_modules`, `dist`, `.nuxt`, `.output`, `data/`, `*.db*`.

Paket-Namen: `@fetcharr/db`, `@fetcharr/shared`, `@fetcharr/worker`, `@fetcharr/web`. Alle `"type": "module"`.

- [ ] **Step 2: Installieren und verifizieren**

Run: `pnpm install && pnpm exec tsc --noEmit -p tsconfig.base.json 2>&1 | head -5`
Expected: keine Fehler (noch kein Code).

- [ ] **Step 3: Commit** — `chore: scaffold pnpm monorepo`

---

### Task 2: DB-Package — Schema & Factory

**Files:**
- Create: `packages/db/src/schema.ts`, `packages/db/src/index.ts`, `packages/db/drizzle.config.ts`
- Test: `packages/db/test/db.test.ts`

- [ ] **Step 1: Failing Test — DB-Factory öffnet In-Memory-DB mit WAL und migriert**

```ts
import { describe, it, expect } from 'vitest'
import { createDb } from '../src/index'

describe('createDb', () => {
  it('opens an in-memory db, runs migrations, WAL on file dbs', () => {
    const db = createDb(':memory:')
    const row = db.$client.prepare('SELECT name FROM sqlite_master WHERE name = ?').get('jobs')
    expect(row).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rot laufen lassen** — `pnpm --filter @fetcharr/db test` → FAIL (createDb fehlt)

- [ ] **Step 3: Schema implementieren (Phase-1-Umfang)**

`schema.ts` — nur die Tabellen, die Phase 1 braucht; weitere Tabellen kommen in ihren Phasen per Migration:

```ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
})

export const auth = sqliteTable('auth', {
  id: integer('id').primaryKey(),          // immer 1 — Single-Admin
  passwordHash: text('password_hash').notNull(),
  apiKey: text('api_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const jobs = sqliteTable('jobs', {
  uid: text('uid').primaryKey(),           // nanoid
  url: text('url').notNull(),
  type: text('type', { enum: ['video', 'audio'] }).notNull(),
  status: text('status', {
    enum: ['queued', 'running', 'paused', 'finished', 'errored', 'cancelled'],
  }).notNull().default('queued'),
  priority: integer('priority').notNull().default(0), // 0 manual, 1 bulk, 2 subscription
  options: text('options', { mode: 'json' }).notNull(), // JobOptions (shared)
  title: text('title'),
  uploader: text('uploader'),
  progressPct: real('progress_pct').notNull().default(0),
  progressSpeed: text('progress_speed'),
  progressEta: text('progress_eta'),
  sizeBytes: integer('size_bytes'),
  stderr: text('stderr'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  pid: integer('pid'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(), // JEDE Statusänderung setzt updatedAt — SSE-Cursor hängt daran
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
})

export const files = sqliteTable('files', {
  uid: text('uid').primaryKey(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  uploader: text('uploader'),
  type: text('type', { enum: ['video', 'audio'] }).notNull(),
  path: text('path').notNull(),            // relativ zu DOWNLOADS_DIR
  sizeBytes: integer('size_bytes'),
  durationSec: real('duration_sec'),
  thumbnailPath: text('thumbnail_path'),
  uploadDate: text('upload_date'),
  infoJson: text('info_json', { mode: 'json' }),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  viewCount: integer('view_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
```

`index.ts`: `createDb(path)` — better-sqlite3 öffnen, bei Datei-DB `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;`, Drizzle-Instanz mit Schema, Migrationen aus `packages/db/migrations/` via `migrate()` ausführen. Migrations mit `pnpm --filter @fetcharr/db drizzle-kit generate` erzeugen und einchecken.

- [ ] **Step 4: Grün laufen lassen** — `pnpm --filter @fetcharr/db test` → PASS

- [ ] **Step 5: Commit** — `feat(db): schema and db factory with WAL + migrations`

---

### Task 3: DB-Package — atomares Job-Claiming

**Files:**
- Create: `packages/db/src/jobs.ts` (Job-Repository: `createJob`, `claimNextJob`, `updateProgress`, `finishJob`, `failJob`, `cancelJob`, `retryJob`, `requeueRunning`, `clearFinished`)

Invariante: JEDE Mutation setzt `updated_at = unixepoch()` — darauf stützt sich der SSE-Cursor (Task 13). `retryJob` setzt `status='queued', attempts=0, stderr=NULL`. `cancelJob` erlaubt nur `queued/running/paused` → `cancelled`.
- Test: `packages/db/test/jobs.test.ts`

- [ ] **Step 1: Failing Tests**

Kernfälle:
```ts
it('claims the oldest queued job by priority and sets it running', ...)
it('returns null when nothing is queued', ...)
it('two sequential claims never return the same job', () => {
  // 1 queued Job, zweimal claimNextJob → erst Job, dann null
})
it('requeueRunning resets running jobs to queued (crash recovery)', ...)
it('failJob increments attempts; requeues while attempts < maxAttempts, errored afterwards', ...)
```

- [ ] **Step 2: Rot** — `pnpm --filter @fetcharr/db test` → FAIL

- [ ] **Step 3: Implementieren**

`claimNextJob` MUSS ein einzelnes atomares Statement sein (kein select-then-update):

```ts
export function claimNextJob(db: Db): Job | null {
  const row = db.$client.prepare(`
    UPDATE jobs SET status = 'running', started_at = unixepoch()
    WHERE uid = (
      SELECT uid FROM jobs WHERE status = 'queued'
      ORDER BY priority ASC, created_at ASC LIMIT 1
    )
    RETURNING *
  `).get()
  return row ? mapJobRow(row) : null
}
```

- [ ] **Step 4: Grün** — PASS
- [ ] **Step 5: Commit** — `feat(db): job repository with atomic claim and crash recovery`

---

### Task 4: Shared-Package — JobOptions & Validierung

**Files:**
- Create: `packages/shared/src/job-options.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/test/job-options.test.ts`

- [ ] **Step 1: Failing Test** — Zod-Schema akzeptiert gültige Optionen, verwirft Unsinn (negativer Crop, unbekanntes Format)

- [ ] **Step 2: Rot, dann implementieren**

```ts
import { z } from 'zod'

export const JobOptionsSchema = z.object({
  format: z.enum(['best', '1080p', '720p', 'audio']).default('best'),
  sponsorblock: z.enum(['remove', 'mark', 'off']).default('off'),
  customArgs: z.string().max(2000).optional(),
  outputTemplate: z.string().max(500).optional(),
  targetFolder: z.string().max(500).optional(),
  cropStart: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
  cropEnd: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
})
export type JobOptions = z.infer<typeof JobOptionsSchema>
```

- [ ] **Step 3: Grün, Commit** — `feat(shared): job options schema`

---

### Task 5: Shared — Args-Generator (TDD-Matrix)

**Files:**
- Create: `packages/shared/src/args.ts` (direkt in shared — Web braucht ihn in Task 12 für die Args-Preview, kein späterer Umzug)
- Test: `packages/shared/test/args.test.ts`

- [ ] **Step 1: Failing Tests — die Matrix aus der Spec**

Fälle (jeweils exaktes erwartetes Array prüfen):
- `format: 'best'` → `-f bv*+ba/b --merge-output-format mp4`
- `format: '1080p'` → `-S res:1080 --merge-output-format mp4`
- `format: 'audio'` → `-x --audio-format mp3 --embed-thumbnail --add-metadata`
- `sponsorblock: 'remove'` → `--sponsorblock-remove default`; `'mark'` → `--sponsorblock-mark default`; `'off'` → nichts
- Output: `-o <DOWNLOADS_DIR>/<type>/<template>.%(ext)s` mit Default-Template `%(uploader)s/%(title)s [%(id)s]`; `targetFolder`/`outputTemplate` überschreiben
- immer: `--write-info-json --write-thumbnail --no-clean-info-json -j --no-simulate --progress --newline` (WICHTIG: `-j` impliziert Quiet-Mode — ohne `--progress` gibt yt-dlp keine `[download]`-Zeilen aus und der Progress-Parser aus Task 6 bekommt nichts; `--newline` erzwingt zeilenweise Ausgabe statt CR-Überschreiben)
- globale Settings: `rateLimit` → `-r <wert>`; globale customArgs werden angehängt; job-customArgs zuletzt (gewinnen)
- Cookies: wenn `<CONFIG_DIR>/cookies.txt` existiert → `--cookies <pfad>` (im Test per tmp-dir)

- [ ] **Step 2: Rot** — `pnpm --filter @fetcharr/shared test` → FAIL
- [ ] **Step 3: Implementieren** — reine Funktion `buildArgs(job: Job, settings: GlobalSettings, env: Paths): string[]`. Keine I/O außer dem Cookies-Existenz-Check (als Parameter `cookiesPath: string | null` reinreichen, damit die Funktion pur bleibt).
- [ ] **Step 4: Grün, Commit** — `feat(shared): yt-dlp args generator`

---

### Task 6: Worker — Progress-Parser

**Files:**
- Create: `apps/worker/src/progress.ts`
- Test: `apps/worker/test/progress.test.ts`, Fixtures: `apps/worker/test/fixtures/ytdlp-progress.txt`

- [ ] **Step 1: Fixture anlegen** — echte yt-dlp-Zeilen (aus einem lokalen Lauf kopieren), inkl. `[download]  62.4% of  312.00MiB at    8.40MiB/s ETA 00:41` und Fragment-Varianten.

- [ ] **Step 2: Failing Tests** — `parseProgressLine(line)` liefert `{pct, speed, eta, sizeBytes} | null`; Fragment-Zeilen und Nicht-Progress-Zeilen → null bzw. korrekt.

- [ ] **Step 3: Rot → implementieren → Grün** (Regex, `MiB/GiB` → Bytes)
- [ ] **Step 4: Commit** — `feat(worker): yt-dlp progress parser`

---

### Task 7: Worker — yt-dlp-Manager (Binary-Beschaffung)

**Files:**
- Create: `apps/worker/src/ytdlp.ts`
- Test: `apps/worker/test/ytdlp.test.ts`

- [ ] **Step 1: Failing Tests** (fetch gemockt via `vi.stubGlobal`):
- `ensureYtdlp()` lädt Binary nach `<CONFIG_DIR>/bin/yt-dlp` wenn nicht vorhanden, `chmod 755`
- vorhandenes Binary → kein Download
- `getVersion()` ruft `yt-dlp --version` (execa gemockt)

- [ ] **Step 2: Rot → implementieren → Grün.** Download-URL arch-abhängig: `yt-dlp_linux` (x64) bzw. `yt-dlp_linux_aarch64` (arm64) von `https://github.com/yt-dlp/yt-dlp/releases/latest/download/` — die PyInstaller-Standalone-Binaries. NICHT das Asset `yt-dlp` (Zipimport): das braucht ein System-Python, das im Zielcontainer `node:22-bookworm-slim` nicht existiert.
- [ ] **Step 3: Commit** — `feat(worker): yt-dlp binary manager`

---

### Task 8: Worker — Download-Runner

**Files:**
- Create: `apps/worker/src/runner.ts`
- Test: `apps/worker/test/runner.test.ts` mit Stub-Skript `apps/worker/test/fixtures/fake-ytdlp.sh`

- [ ] **Step 1: Stub schreiben** — `fake-ytdlp.sh`: gibt 3 Progress-Zeilen auf stderr, ein Info-JSON auf stdout aus, legt `<out>.mp4` + `<out>.info.json` an, exit 0. Zweiter Modus (`FAKE_FAIL=1`): stderr-Fehler, exit 1.

- [ ] **Step 2: Failing Tests**
- `runDownload(job, ...)` ruft onProgress mit geparsten Werten auf. Drosselung (max 1×/s) NICHT hier testen: `createThrottle(nowFn)` als pure Funktion in `apps/worker/src/throttle.ts` mit eigenem Unit-Test (injizierte Clock; keine fake timers gegen echte Child-Prozesse — das wird flaky). Der Runner-Test prüft nur, dass onProgress mit korrekten Werten gerufen wird
- Erfolg: Datei wird aus `.tmp/` ins Ziel verschoben, Rückgabe enthält Pfad + Info-JSON
- Fehler: stderr wird gesammelt zurückgegeben, `.tmp/` aufgeräumt
- Cancel: `abort()` killt den Prozess (tree-kill), Status-Callback `cancelled`

- [ ] **Step 3: Rot → implementieren → Grün**

Kernpunkte der Implementierung: sobald das Info-JSON auf stdout eintrifft (kommt früh im Lauf), onInfo-Callback mit {title, uploader} feuern — die Loop (Task 9) schreibt damit `jobs.title/uploader` für die Live-Anzeige zurück; execa-spawn des Binaries mit Args aus Task 5 aber `-o` in `<DOWNLOADS_DIR>/.tmp/<uid>/`-Verzeichnis; nach Exit 0 alle erzeugten Dateien (Media, .info.json, Thumbnail) per `fs.rename`/Copy-Fallback ins endgültige Ziel gemäß Template verschieben; Info-JSON von stdout parsen.

- [ ] **Step 4: Commit** — `feat(worker): download runner with tmp-dir staging and cancellation`

---

### Task 9: Worker — Hauptschleife

**Files:**
- Create: `apps/worker/src/index.ts`, `apps/worker/src/loop.ts`
- Test: `apps/worker/test/loop.test.ts`

- [ ] **Step 1: Failing Tests** (runner gemockt):
- Loop pollt alle 500 ms, respektiert `maxConcurrent` aus settings (Default 3)
- claim → runDownload → onInfo aktualisiert `jobs.title/uploader` → bei Erfolg `finishJob` + `files`-Insert (Metadaten aus Info-JSON)
- bei Fehler `failJob` (Requeue/Backoff-Delay: `min(2^attempts * 30s, 15min)` als `not_before`-Spalte? — NEIN, YAGNI: Requeue mit `attempts`-Zähler reicht in Phase 1; Backoff kommt mit Phase 4)
- Cancel-Signal: Job-Status in DB `cancelled` (von API gesetzt) → Loop killt laufenden Prozess (prüft laufende Jobs 1×/s gegen DB)
- SIGTERM: laufende Prozesse killen, deren Jobs → `queued`, Loop-Ende

- [ ] **Step 2: Rot → implementieren → Grün**

`index.ts`: env lesen, `createDb(<CONFIG_DIR>/fetcharr.db)`, `requeueRunning()`, `ensureYtdlp()`, Loop starten, Signal-Handler.

- [ ] **Step 3: Manuell verifizieren** — `CONFIG_DIR=./data/config DOWNLOADS_DIR=./data/downloads pnpm dev:worker`, per SQL einen Job einfügen (echte YouTube-URL), Log beobachten, Datei erscheint unter `data/downloads/video/<uploader>/…`, `files`-Row existiert.
Expected: Download läuft durch; bei Abbruch mit Ctrl-C wird der Job wieder `queued`.

- [ ] **Step 4: Commit** — `feat(worker): main loop with concurrency, cancellation and graceful shutdown`

---

### Task 10: Web — Nuxt-Gerüst mit Modernist-Tokens

**Files:**
- Create: `apps/web/nuxt.config.ts`, `apps/web/app/app.vue`, `apps/web/app/assets/styles.css` (Kopie von `docs/design/styles.css`), `apps/web/app/layouts/default.vue`
- Create: `apps/web/server/utils/db.ts` (Singleton: `useDb()` → createDb aus env)

- [ ] **Step 1: Nuxt 4 minimal aufsetzen** — kein UI-Framework; `styles.css` global einbinden; Layout = Sidebar + Header nach Mockup (Nav-Einträge Queue/Library/Subscriptions/Tasks/Storage/Settings, nicht implementierte Ziele führen auf Platzhalter-Seite „Phase N"). Archivo via `@fontsource/archivo` (self-hosted, kein Google-CDN — Container läuft offline-fähig).

- [ ] **Step 2: Verifizieren** — `pnpm dev:web`, `http://localhost:3000` zeigt Layout im Modernist-Look.

- [ ] **Step 3: Commit** — `feat(web): nuxt scaffold with modernist design tokens and app shell`

---

### Task 11: Web — Auth (Setup, Login, Session, Guard)

**Files:**
- Create: `apps/web/server/api/auth/status.get.ts`, `setup.post.ts`, `login.post.ts`, `logout.post.ts`
- Create: `apps/web/server/middleware/auth.ts` (schützt `/api/*` außer auth/health; akzeptiert Session ODER `X-Api-Key`/`?apiKey`)
- Create: `apps/web/app/pages/login.vue` (Setup/Login-Karte nach Mockup), `apps/web/app/middleware/auth.global.ts`
- Test: `apps/web/test/auth.test.ts` (nitro-test-utils oder Unit auf Handler-Ebene)

- [ ] **Step 1: Failing Tests**
- `setup` nur möglich, wenn noch kein Admin existiert; Passwort < 12 Zeichen → 400
- `login` mit falschem Passwort → 401; richtig → Session-Cookie (h3 `useSession`, sealed, Secret aus `<CONFIG_DIR>` generiert/persistiert)
- Guard: `/api/jobs` ohne Session → 401, mit API-Key → 200

- [ ] **Step 2: Rot → implementieren (argon2id) → Grün**
- [ ] **Step 3: Commit** — `feat(web): single-admin auth with sealed sessions and api key`

---

### Task 12: Web — Jobs-API + Probe

**Files:**
- Create: `apps/web/server/api/jobs/index.get.ts`, `index.post.ts`, `clear-finished.post.ts`, `[uid]/cancel.post.ts`, `[uid]/retry.post.ts`, `[uid]/pause.post.ts`, `[uid]/resume.post.ts`
- Create: `apps/web/server/api/probe.post.ts` (ruft `yt-dlp -J --flat-playlist <url>` direkt, 20s-Timeout — Probe ist kurzlebig und read-only, darf im Web-Prozess laufen; fehlt `<CONFIG_DIR>/bin/yt-dlp` noch → 503 mit Meldung ‚Worker not ready — yt-dlp binary missing‘, das Binary beschafft allein der Worker)
- Create: `apps/web/server/api/args-preview.post.ts` (nutzt `buildArgs` aus `@fetcharr/shared`)
- Test: `apps/web/test/jobs-api.test.ts`

- [ ] **Step 1: Failing Tests**
- create validiert via JobOptionsSchema (400 bei Müll) und übernimmt `title`/`uploader` aus dem mitgesendeten Probe-Ergebnis (Body-Felder), damit die Queue sofort Titel statt URL zeigt
- cancel: `cancelled` nur aus `queued/running/paused` (setzt `updatedAt` — SSE)
- retry: nur aus `errored`, setzt `attempts=0` zurück (sonst wäre der nächste Fehler sofort final)
- **pause/resume gelten in Phase 1 NUR für `queued`-Jobs** (`queued→paused→queued`); ein laufender yt-dlp-Prozess ist nicht sauber pausierbar — 409 bei `running`
- clear-finished löscht alle Jobs mit Status `finished/errored/cancelled`
- list liefert nach `createdAt desc`
- [ ] **Step 2: Rot → implementieren → Grün**
- [ ] **Step 3: Commit** — `feat(web): jobs api, url probe and args preview`

---

### Task 13: Web — SSE-Livestream

**Files:**
- Create: `apps/web/server/api/events.get.ts`
- Create: `apps/web/app/composables/useJobsStream.ts`

- [ ] **Step 1: Implementieren** — `createEventStream(event)`; serverseitig alle 1 s `jobs` mit `updated_at > cursor` lesen (Cursor = höchstes bisher gesehenes `updated_at`) und als `jobs`-Event pushen — deckt alle Übergänge inkl. `cancelled` ab, weil jede Mutation `updated_at` setzt (Invariante aus Task 3). Client-Composable hält reaktive Job-Map aktuell, Fallback: Refetch bei `error`.

- [ ] **Step 2: Manuell verifizieren** — `curl -N localhost:3000/api/events` (mit API-Key) zeigt periodische Events.
- [ ] **Step 3: Commit** — `feat(web): job event stream via sse`

---

### Task 14: Web — Queue-Seite + Add-Download-Dialog

**Files:**
- Create: `apps/web/app/pages/index.vue` (Queue nach Mockup: Tabelle, Status-Punkte, Progress-Balken, Prioritäts- und Status-Tags, expandierbare Zeile mit Args + stderr, Pause all / Clear finished)
- Create: `apps/web/app/components/AddDownloadDialog.vue` (Probe-Ergebnis, Format-Segmente, Advanced-Bereich mit Args/Output/Crop/Folder/SponsorBlock, Args-Preview live via `/api/args-preview`, „Add to queue")
- Create: `apps/web/app/components/JobRow.vue`

Markup/Styling 1:1 am Mockup ausrichten (`docs/design/Fetcharr.dc.html` ist die Referenz — Klassen und Inline-Styles daraus übernehmen, in Komponenten-CSS überführen).

- [ ] **Step 1: Bauen, dann manuell verifizieren (kein Component-Test in Phase 1):**
Ablauf: Login → URL einfügen → Fetch → Dialog zeigt Titel/Kanal/Dauer → Format wählen → Add to queue → Zeile erscheint, Fortschritt läuft live, fertiger Job wird „finished".
- [ ] **Step 2: Fehlerfall verifizieren** — ungültige URL → Job wird `errored`, stderr in expandierter Zeile sichtbar, Retry-Button requeued.
- [ ] **Step 3: Commit** — `feat(web): queue page and add-download dialog`

---

### Task 15: Health-Endpoint + Abschluss-Verifikation

**Files:**
- Create: `apps/web/server/api/health.get.ts` (ohne Auth: `{status:'ok', db:true, worker:<heartbeat < 5s>}` — Worker schreibt 1×/2s `unixepoch()` in `settings.worker_heartbeat`)
- Create: `README.md` (Kurz: was ist Fetcharr, dev-Setup, env-Variablen)

- [ ] **Step 1: Heartbeat im Worker-Loop ergänzen (Test in loop.test.ts erweitern)**
- [ ] **Step 2: Voller Durchlauf** — `pnpm test` (alle Pakete) → PASS; beide dev-Prozesse starten, E2E-Ablauf aus Task 14 mit echter YouTube-URL einmal komplett.
- [ ] **Step 3: Commit** — `feat: health endpoint with worker heartbeat; project readme`

---

## Roadmap der Folgephasen (je ein eigener Plan bei Phasenstart)

2. **Library & Player:** files-API, Grid/List-UI, Range-Streaming-Endpoint, HTML5-Player, Favoriten/Views/Resume, Löschen, ZIP-Download, NFO/Thumbnail-Schreiber, Crop-Ausführung (ffmpeg)
3. **Subscriptions & Archiv:** subscriptions/archive-Tabellen, croner-Scheduler im Worker, Check-Flow (`-j --flat-playlist` + Archiv-Diff), Sub-UI, Archiv-UI mit Import/Export, Podcast-RSS
4. **Tasks, Notifications, Settings:** tasks/task_runs/notifications-Tabellen, die 8 Tasks aus der Spec (inkl. Migration aus YoutubeDL-Material), Zeitplan-UI, Notification-Center + ntfy/Gotify/Discord/Webhook, Settings-Seiten komplett, Logs-Viewer, Backoff für Job-Retries
5. **Storage, Metrics, Extras:** Storage-Dashboard, `/metrics` (prom-client), Bulk-Import, Livestream-Aufnahme, PWA + Share Target, i18n (DE/EN)
6. **Docker & Unraid:** Multi-Stage-Dockerfile (node:22-bookworm-slim, ffmpeg static, deno, s6-overlay, PUID/PGID/UMASK), Healthcheck, Unraid-Template-XML + Icon, GitHub Actions (amd64+arm64 → ghcr.io), E2E-Smoke im CI mit yt-dlp-Stub, Versions-Check „new image available"
