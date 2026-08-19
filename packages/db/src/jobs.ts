import { nanoid } from 'nanoid'

import type { Db } from './index.ts'
import type { Job, MediaType } from './schema.ts'

/**
 * Job-Repository. Alle Mutationen laufen als einzelnes SQL-Statement und setzen
 * `updated_at = unixepoch()` — der SSE-Cursor der Web-App hängt an dieser Invariante.
 */

export interface CreateJobInput {
  url: string
  type: MediaType
  options: unknown
  priority?: number
  title?: string | null
  uploader?: string | null
  maxAttempts?: number
}

export interface ProgressInput {
  pct?: number | null
  speed?: string | null
  eta?: string | null
  sizeBytes?: number | null
}

type Row = Record<string, unknown>

const CANCELLABLE = "('queued', 'running', 'paused')"

export function createJob(db: Db, input: CreateJobInput): Job {
  const row = db.$client
    .prepare(
      `INSERT INTO jobs (uid, url, type, status, priority, options, title, uploader, max_attempts, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, unixepoch(), unixepoch())
       RETURNING *`,
    )
    .get(
      nanoid(),
      input.url,
      input.type,
      input.priority ?? 0,
      JSON.stringify(input.options ?? {}),
      input.title ?? null,
      input.uploader ?? null,
      input.maxAttempts ?? 3,
    ) as Row

  return mapJobRow(row)!
}

/**
 * Nimmt den nächsten wartenden Job atomar in Besitz — ein einziges Statement,
 * damit parallele Worker denselben Job nie doppelt bekommen.
 */
export function claimNextJob(db: Db): Job | null {
  const row = db.$client
    .prepare(
      `UPDATE jobs SET status = 'running', started_at = unixepoch(), updated_at = unixepoch()
       WHERE uid = (
         SELECT uid FROM jobs WHERE status = 'queued'
         ORDER BY priority ASC, created_at ASC LIMIT 1
       )
       RETURNING *`,
    )
    .get() as Row | undefined

  return mapJobRow(row)
}

export function updateProgress(db: Db, uid: string, progress: ProgressInput): Job | null {
  const row = db.$client
    .prepare(
      `UPDATE jobs SET
         progress_pct = COALESCE(?, progress_pct),
         progress_speed = COALESCE(?, progress_speed),
         progress_eta = COALESCE(?, progress_eta),
         size_bytes = COALESCE(?, size_bytes),
         updated_at = unixepoch()
       WHERE uid = ?
       RETURNING *`,
    )
    .get(
      progress.pct ?? null,
      progress.speed ?? null,
      progress.eta ?? null,
      progress.sizeBytes ?? null,
      uid,
    ) as Row | undefined

  return mapJobRow(row)
}

export function setJobMeta(
  db: Db,
  uid: string,
  meta: { title?: string | null; uploader?: string | null; pid?: number | null },
): Job | null {
  const row = db.$client
    .prepare(
      `UPDATE jobs SET
         title = COALESCE(?, title),
         uploader = COALESCE(?, uploader),
         pid = COALESCE(?, pid),
         updated_at = unixepoch()
       WHERE uid = ?
       RETURNING *`,
    )
    .get(meta.title ?? null, meta.uploader ?? null, meta.pid ?? null, uid) as Row | undefined

  return mapJobRow(row)
}

export function finishJob(db: Db, uid: string): Job | null {
  const row = db.$client
    .prepare(
      `UPDATE jobs SET
         status = 'finished', progress_pct = 100, pid = NULL, stderr = NULL,
         finished_at = unixepoch(), updated_at = unixepoch()
       WHERE uid = ?
       RETURNING *`,
    )
    .get(uid) as Row | undefined

  return mapJobRow(row)
}

/**
 * Zählt den Versuch hoch: solange Versuche übrig sind zurück in die Queue,
 * danach endgültig `errored`.
 */
export function failJob(db: Db, uid: string, stderr: string | null): Job | null {
  const row = db.$client
    .prepare(
      `UPDATE jobs SET
         attempts = attempts + 1,
         stderr = ?,
         pid = NULL,
         status = CASE WHEN attempts + 1 >= max_attempts THEN 'errored' ELSE 'queued' END,
         started_at = CASE WHEN attempts + 1 >= max_attempts THEN started_at ELSE NULL END,
         finished_at = CASE WHEN attempts + 1 >= max_attempts THEN unixepoch() ELSE NULL END,
         progress_pct = CASE WHEN attempts + 1 >= max_attempts THEN progress_pct ELSE 0 END,
         updated_at = unixepoch()
       WHERE uid = ?
       RETURNING *`,
    )
    .get(stderr, uid) as Row | undefined

  return mapJobRow(row)
}

export function cancelJob(db: Db, uid: string): Job | null {
  const row = db.$client
    .prepare(
      `UPDATE jobs SET
         status = 'cancelled', pid = NULL, finished_at = unixepoch(), updated_at = unixepoch()
       WHERE uid = ? AND status IN ${CANCELLABLE}
       RETURNING *`,
    )
    .get(uid) as Row | undefined

  return mapJobRow(row)
}

export function retryJob(db: Db, uid: string): Job | null {
  const row = db.$client
    .prepare(
      `UPDATE jobs SET
         status = 'queued', attempts = 0, stderr = NULL, pid = NULL,
         progress_pct = 0, progress_speed = NULL, progress_eta = NULL,
         started_at = NULL, finished_at = NULL, updated_at = unixepoch()
       WHERE uid = ? AND status = 'errored'
       RETURNING *`,
    )
    .get(uid) as Row | undefined

  return mapJobRow(row)
}

export function pauseJob(db: Db, uid: string): Job | null {
  const row = db.$client
    .prepare(
      `UPDATE jobs SET status = 'paused', updated_at = unixepoch()
       WHERE uid = ? AND status = 'queued'
       RETURNING *`,
    )
    .get(uid) as Row | undefined

  return mapJobRow(row)
}

export function resumeJob(db: Db, uid: string): Job | null {
  const row = db.$client
    .prepare(
      `UPDATE jobs SET status = 'queued', updated_at = unixepoch()
       WHERE uid = ? AND status = 'paused'
       RETURNING *`,
    )
    .get(uid) as Row | undefined

  return mapJobRow(row)
}

/** Crash-Recovery beim Worker-Start: verwaiste `running`-Jobs zurück in die Queue. */
export function requeueRunning(db: Db): number {
  const result = db.$client
    .prepare(
      `UPDATE jobs SET
         status = 'queued', pid = NULL, started_at = NULL,
         progress_pct = 0, progress_speed = NULL, progress_eta = NULL,
         updated_at = unixepoch()
       WHERE status = 'running'`,
    )
    .run()

  return result.changes
}

export function clearFinished(db: Db): number {
  const result = db.$client
    .prepare("DELETE FROM jobs WHERE status IN ('finished', 'errored', 'cancelled')")
    .run()

  return result.changes
}

export function getJob(db: Db, uid: string): Job | null {
  const row = db.$client.prepare('SELECT * FROM jobs WHERE uid = ?').get(uid) as Row | undefined
  return mapJobRow(row)
}

export function listJobs(db: Db): Job[] {
  const rows = db.$client
    .prepare('SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC')
    .all() as Row[]

  return rows.map((row) => mapJobRow(row)!)
}

function mapJobRow(row: Row | undefined): Job | null {
  if (!row) return null

  return {
    uid: row.uid as string,
    url: row.url as string,
    type: row.type as Job['type'],
    status: row.status as Job['status'],
    priority: row.priority as number,
    options: row.options == null ? null : JSON.parse(row.options as string),
    title: (row.title as string | null) ?? null,
    uploader: (row.uploader as string | null) ?? null,
    progressPct: row.progress_pct as number,
    progressSpeed: (row.progress_speed as string | null) ?? null,
    progressEta: (row.progress_eta as string | null) ?? null,
    sizeBytes: (row.size_bytes as number | null) ?? null,
    stderr: (row.stderr as string | null) ?? null,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    pid: (row.pid as number | null) ?? null,
    createdAt: toDate(row.created_at)!,
    updatedAt: toDate(row.updated_at)!,
    startedAt: toDate(row.started_at),
    finishedAt: toDate(row.finished_at),
  }
}

function toDate(value: unknown): Date | null {
  return typeof value === 'number' ? new Date(value * 1000) : null
}
