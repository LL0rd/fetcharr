import type { Db } from './index.ts'
import type { taskRuns } from './schema.ts'

/**
 * Task-Repository für die Wartungs-Engine im Worker. Die Tabelle ist zugleich
 * Steuerpult: die Web-App setzt `run_requested`/`confirm_requested` sowie
 * Zeitplan und Optionen, der Worker holt beides im Poll ab. `updated_at` fasst
 * nur an, was den Zeitplan betrifft — ein Lauf selbst darf keinen Reload der
 * Cron-Jobs auslösen.
 */

export type TaskSchedule =
  | { type: 'recurring'; cron: string }
  | { type: 'once'; timestamp: number }

export interface Task {
  key: string
  schedule: TaskSchedule | null
  options: Record<string, unknown>
  running: boolean
  confirming: boolean
  runRequested: boolean
  confirmRequested: boolean
  confirmPayload: unknown
  lastRanAt: Date | null
  lastConfirmedAt: Date | null
  updatedAt: Date
}

export type TaskRun = typeof taskRuns.$inferSelect
export type TaskPhase = TaskRun['phase']

export interface TaskSeed {
  key: string
  schedule?: TaskSchedule | null
  options?: Record<string, unknown>
}

export interface RecordTaskRunInput {
  taskKey: string
  phase: TaskPhase
  durationMs?: number | null
  summary?: string | null
  error?: string | null
  startedAt?: Date
}

export interface ListTaskRunsOptions {
  key?: string
  limit?: number
}

type Row = Record<string, unknown>

export const TASK_KEYS = [
  'backup_db',
  'missing_files_check',
  'import_missing_files',
  'duplicate_files_check',
  'update_ytdlp',
  'delete_old_files',
  'rebuild_database',
  'import_youtubedl_material',
] as const

export type TaskKey = (typeof TASK_KEYS)[number]

/** Auslieferungszustand: nur `update_ytdlp` läuft ungefragt und bestätigt sich selbst. */
export const TASK_DEFAULTS: TaskSeed[] = [
  { key: 'backup_db', options: { keep: 7 } },
  { key: 'missing_files_check', options: { auto_confirm: false } },
  { key: 'import_missing_files', options: {} },
  { key: 'duplicate_files_check', options: { auto_confirm: false } },
  {
    key: 'update_ytdlp',
    schedule: { type: 'recurring', cron: '0 4 * * *' },
    options: { auto_confirm: true },
  },
  {
    key: 'delete_old_files',
    options: { threshold_days: 30, keep_favorites: true, keep_subscriptions: true },
  },
  { key: 'rebuild_database', options: {} },
  { key: 'import_youtubedl_material', options: { path: '' } },
]

const TASK_RUNS_DEFAULT_LIMIT = 100

export function seedTasks(db: Db, seeds: TaskSeed[] = TASK_DEFAULTS): Task[] {
  return seeds.map((seed) => ensureTask(db, seed))
}

/** Legt den Task an, falls er fehlt; ein vorhandener bleibt unverändert. */
export function ensureTask(db: Db, seed: TaskSeed): Task {
  db.$client
    .prepare(
      `INSERT INTO tasks (key, schedule, options, updated_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(key) DO NOTHING`,
    )
    .run(seed.key, json(seed.schedule ?? null), json(seed.options ?? {}))

  return getTask(db, seed.key)!
}

export function getTask(db: Db, key: string): Task | null {
  const row = db.$client.prepare('SELECT * FROM tasks WHERE key = ?').get(key) as Row | undefined
  return mapTask(row)
}

export function listTasks(db: Db): Task[] {
  const rows = db.$client.prepare('SELECT * FROM tasks ORDER BY key').all() as Row[]
  return rows.map((row) => mapTask(row)!)
}

export function setTaskSchedule(db: Db, key: string, schedule: TaskSchedule | null): Task | null {
  const row = db.$client
    .prepare('UPDATE tasks SET schedule = ?, updated_at = unixepoch() WHERE key = ? RETURNING *')
    .get(json(schedule), key) as Row | undefined

  return mapTask(row)
}

export function setTaskOptions(
  db: Db,
  key: string,
  options: Record<string, unknown>,
): Task | null {
  const row = db.$client
    .prepare('UPDATE tasks SET options = ?, updated_at = unixepoch() WHERE key = ? RETURNING *')
    .get(json(options), key) as Row | undefined

  return mapTask(row)
}

export function requestTaskRun(db: Db, key: string): boolean {
  return db.$client.prepare('UPDATE tasks SET run_requested = 1 WHERE key = ?').run(key).changes > 0
}

export function requestTaskConfirm(db: Db, key: string): boolean {
  return (
    db.$client.prepare('UPDATE tasks SET confirm_requested = 1 WHERE key = ?').run(key).changes > 0
  )
}

/** Holt die angeforderten Läufe ab und löscht die Flags im selben Statement. */
export function takeRunRequests(db: Db): string[] {
  const rows = db.$client
    .prepare('UPDATE tasks SET run_requested = 0 WHERE run_requested = 1 RETURNING key')
    .all() as { key: string }[]

  return rows.map((row) => row.key)
}

export function takeConfirmRequests(db: Db): string[] {
  const rows = db.$client
    .prepare('UPDATE tasks SET confirm_requested = 0 WHERE confirm_requested = 1 RETURNING key')
    .all() as { key: string }[]

  return rows.map((row) => row.key)
}

/** Schloss gegen Doppelläufe: schlägt fehl, solange der Task noch läuft. */
export function beginTaskRun(db: Db, key: string): boolean {
  return (
    db.$client.prepare('UPDATE tasks SET running = 1 WHERE key = ? AND running = 0').run(key)
      .changes > 0
  )
}

export function endTaskRun(
  db: Db,
  key: string,
  result: { confirmPayload?: unknown } = {},
): void {
  db.$client
    .prepare(
      `UPDATE tasks SET running = 0, last_ran_at = unixepoch(), confirm_payload = ? WHERE key = ?`,
    )
    .run(json(result.confirmPayload ?? null), key)
}

export function beginTaskConfirm(db: Db, key: string): boolean {
  return (
    db.$client.prepare('UPDATE tasks SET confirming = 1 WHERE key = ? AND confirming = 0').run(key)
      .changes > 0
  )
}

export function endTaskConfirm(db: Db, key: string): void {
  db.$client
    .prepare(
      `UPDATE tasks SET confirming = 0, confirm_payload = NULL, last_confirmed_at = unixepoch()
       WHERE key = ?`,
    )
    .run(key)
}

/**
 * Gibt den Task nach einer gescheiterten Bestätigung wieder frei. Das Ergebnis
 * bleibt liegen: der zweite Versuch soll denselben Stand bestätigen können.
 */
export function cancelTaskConfirm(db: Db, key: string): void {
  db.$client.prepare('UPDATE tasks SET confirming = 0 WHERE key = ?').run(key)
}

/** „Reset stuck tasks": nach einem Worker-Absturz stehen Flags ohne Prozess. */
export function resetStuckTasks(db: Db): number {
  return db.$client
    .prepare('UPDATE tasks SET running = 0, confirming = 0 WHERE running = 1 OR confirming = 1')
    .run().changes
}

export function recordTaskRun(db: Db, input: RecordTaskRunInput): TaskRun {
  const startedAt = input.startedAt ? Math.floor(input.startedAt.getTime() / 1000) : null
  const row = db.$client
    .prepare(
      `INSERT INTO task_runs (task_key, phase, started_at, duration_ms, summary, error)
       VALUES (?, ?, COALESCE(?, unixepoch()), ?, ?, ?)
       RETURNING *`,
    )
    .get(
      input.taskKey,
      input.phase,
      startedAt,
      input.durationMs ?? null,
      input.summary ?? null,
      input.error ?? null,
    ) as Row

  return mapTaskRun(row)
}

export function listTaskRuns(db: Db, options: ListTaskRunsOptions = {}): TaskRun[] {
  const where = options.key ? 'WHERE task_key = ?' : ''
  const params = options.key ? [options.key] : []
  const limit = options.limit ?? TASK_RUNS_DEFAULT_LIMIT

  const rows = db.$client
    .prepare(`SELECT * FROM task_runs ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params, limit) as Row[]

  return rows.map(mapTaskRun)
}

/**
 * Reload-Signal für den Task-Scheduler. Wie bei den Subscriptions steckt der
 * Zeitplan selbst mit in der Signatur: `updated_at` zählt in Sekunden und würde
 * zwei Änderungen in derselben Sekunde verschlucken.
 */
export function tasksRevision(db: Db): string {
  const row = db.$client
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS latest,
              (SELECT COALESCE(group_concat(sig, '|'), '')
                 FROM (SELECT key || ':' || COALESCE(schedule, '-') AS sig
                         FROM tasks ORDER BY key)) AS shape
         FROM tasks`,
    )
    .get() as { n: number; latest: number; shape: string }

  return `${String(row.n)}:${String(row.latest)}:${row.shape}`
}

function json(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value)
}

function parse(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function mapTask(row: Row | undefined): Task | null {
  if (!row) return null

  const options = parse(row.options)

  return {
    key: row.key as string,
    schedule: (parse(row.schedule) as TaskSchedule | null) ?? null,
    options: options && typeof options === 'object' ? (options as Record<string, unknown>) : {},
    running: Boolean(row.running),
    confirming: Boolean(row.confirming),
    runRequested: Boolean(row.run_requested),
    confirmRequested: Boolean(row.confirm_requested),
    confirmPayload: parse(row.confirm_payload),
    lastRanAt: toDate(row.last_ran_at),
    lastConfirmedAt: toDate(row.last_confirmed_at),
    updatedAt: toDate(row.updated_at)!,
  }
}

function mapTaskRun(row: Row): TaskRun {
  return {
    id: row.id as number,
    taskKey: row.task_key as string,
    phase: row.phase as TaskPhase,
    startedAt: toDate(row.started_at)!,
    durationMs: (row.duration_ms as number | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    error: (row.error as string | null) ?? null,
  }
}

function toDate(value: unknown): Date | null {
  return typeof value === 'number' ? new Date(value * 1000) : null
}
