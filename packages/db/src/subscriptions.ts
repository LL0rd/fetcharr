import { nanoid } from 'nanoid'

import type { Db } from './index.ts'
import type { Job, MediaType, subscriptions } from './schema.ts'

/**
 * Subscription-Repository. `updated_at` ist das Reload-Signal für den Scheduler
 * im Worker: nur inhaltliche Änderungen fassen es an, ein Check selbst nicht.
 */

export type Subscription = typeof subscriptions.$inferSelect
export type SubscriptionType = Subscription['type']
export type Sponsorblock = Subscription['sponsorblock']

export interface CreateSubscriptionInput {
  url: string
  name: string
  type?: SubscriptionType
  mediaType?: MediaType
  cron?: string
  paused?: boolean
  timerangeFrom?: string | null
  titleRegex?: string | null
  maxQuality?: string | null
  customArgs?: string | null
  customOutput?: string | null
  sponsorblock?: Sponsorblock
  recordLivestreams?: boolean
  redownloadFreshUploads?: boolean
  rssEnabled?: boolean
}

export type UpdateSubscriptionInput = Partial<CreateSubscriptionInput>

export interface CreateSubscriptionJobInput {
  url: string
  type: MediaType
  options: unknown
  subId: string
  priority?: number
  title?: string | null
  uploader?: string | null
}

type Row = Record<string, unknown>

const DEFAULT_CRON = '0 */6 * * *'

/** Spalten, die `updateSubscription` schreiben darf — Reihenfolge egal, Namen fix. */
const UPDATABLE: Record<keyof UpdateSubscriptionInput, string> = {
  url: 'url',
  name: 'name',
  type: 'type',
  mediaType: 'media_type',
  cron: 'cron',
  paused: 'paused',
  timerangeFrom: 'timerange_from',
  titleRegex: 'title_regex',
  maxQuality: 'max_quality',
  customArgs: 'custom_args',
  customOutput: 'custom_output',
  sponsorblock: 'sponsorblock',
  recordLivestreams: 'record_livestreams',
  redownloadFreshUploads: 'redownload_fresh_uploads',
  rssEnabled: 'rss_enabled',
}

export function createSubscription(db: Db, input: CreateSubscriptionInput): Subscription {
  const row = db.$client
    .prepare(
      `INSERT INTO subscriptions (id, url, name, type, media_type, cron, paused, timerange_from,
                                  title_regex, max_quality, custom_args, custom_output, sponsorblock,
                                  record_livestreams, redownload_fresh_uploads, rss_enabled,
                                  checking, check_requested, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, unixepoch(), unixepoch())
       RETURNING *`,
    )
    .get(
      nanoid(),
      input.url,
      input.name,
      input.type ?? 'channel',
      input.mediaType ?? 'video',
      input.cron ?? DEFAULT_CRON,
      bool(input.paused),
      input.timerangeFrom ?? null,
      input.titleRegex ?? null,
      input.maxQuality ?? null,
      input.customArgs ?? null,
      input.customOutput ?? null,
      input.sponsorblock ?? 'off',
      bool(input.recordLivestreams),
      bool(input.redownloadFreshUploads),
      bool(input.rssEnabled),
    ) as Row

  return mapRow(row)!
}

export function updateSubscription(
  db: Db,
  id: string,
  patch: UpdateSubscriptionInput,
): Subscription | null {
  const assignments: string[] = []
  const params: unknown[] = []

  for (const [key, column] of Object.entries(UPDATABLE)) {
    const value = patch[key as keyof UpdateSubscriptionInput]
    if (value === undefined) continue

    assignments.push(`${column} = ?`)
    params.push(typeof value === 'boolean' ? bool(value) : value)
  }

  if (!assignments.length) return getSubscription(db, id)

  const row = db.$client
    .prepare(
      `UPDATE subscriptions SET ${assignments.join(', ')}, updated_at = unixepoch()
       WHERE id = ? RETURNING *`,
    )
    .get(...params, id) as Row | undefined

  return mapRow(row)
}

/** Löscht die Subscription samt ihrer Archiv-Einträge; Jobs und Dateien bleiben. */
export function deleteSubscription(db: Db, id: string): boolean {
  const deleted = db.$client.prepare('DELETE FROM subscriptions WHERE id = ?').run(id).changes > 0
  if (deleted) db.$client.prepare('DELETE FROM archive WHERE sub_id = ?').run(id)
  return deleted
}

export function getSubscription(db: Db, id: string): Subscription | null {
  const row = db.$client.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as
    | Row
    | undefined
  return mapRow(row)
}

export function listSubscriptions(db: Db): Subscription[] {
  const rows = db.$client
    .prepare('SELECT * FROM subscriptions ORDER BY name COLLATE NOCASE, rowid')
    .all() as Row[]

  return rows.map((row) => mapRow(row)!)
}

/**
 * Nimmt die Subscription für einen Check in Besitz. Ein zweiter Aufruf schlägt
 * fehl, solange der erste Lauf nicht mit `endCheck` abgeschlossen ist.
 */
export function beginCheck(db: Db, id: string): boolean {
  return (
    db.$client
      .prepare('UPDATE subscriptions SET checking = 1 WHERE id = ? AND checking = 0')
      .run(id).changes > 0
  )
}

export function endCheck(db: Db, id: string): void {
  db.$client
    .prepare('UPDATE subscriptions SET checking = 0, last_check_at = unixepoch() WHERE id = ?')
    .run(id)
}

/** Setzt das Flag, das die API für „jetzt prüfen" benutzt. */
export function requestCheck(db: Db, id: string): boolean {
  return (
    db.$client
      .prepare('UPDATE subscriptions SET check_requested = 1 WHERE id = ?')
      .run(id).changes > 0
  )
}

/** Holt alle angeforderten Checks ab und setzt die Flags im selben Statement zurück. */
export function takeCheckRequests(db: Db): string[] {
  const rows = db.$client
    .prepare('UPDATE subscriptions SET check_requested = 0 WHERE check_requested = 1 RETURNING id')
    .all() as { id: string }[]

  return rows.map((row) => row.id)
}

/**
 * Ändert sich, sobald Subscriptions angelegt, geändert oder gelöscht werden.
 * `updated_at` allein reicht nicht: es zählt in Sekunden, eine Änderung in
 * derselben Sekunde bliebe unsichtbar — deshalb steckt der Zeitplan selbst mit
 * in der Signatur.
 */
export function subscriptionsRevision(db: Db): string {
  const row = db.$client
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS latest,
              (SELECT COALESCE(group_concat(sig, '|'), '')
                 FROM (SELECT id || ':' || cron || ':' || paused AS sig
                         FROM subscriptions ORDER BY id)) AS shape
         FROM subscriptions`,
    )
    .get() as { n: number; latest: number; shape: string }

  return `${row.n}:${row.latest}:${row.shape}`
}

/**
 * Job aus einem Subscription-Fund. Bewusst hier statt in `createJob`: nur dieser
 * Weg setzt `sub_id`, und daran hängt der Archiv-Eintrag nach dem Download.
 */
export function createSubscriptionJob(db: Db, input: CreateSubscriptionJobInput): Job {
  const row = db.$client
    .prepare(
      `INSERT INTO jobs (uid, url, type, status, priority, options, title, uploader, sub_id,
                         max_attempts, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, 3, unixepoch(), unixepoch())
       RETURNING *`,
    )
    .get(
      nanoid(),
      input.url,
      input.type,
      input.priority ?? 2,
      JSON.stringify(input.options ?? {}),
      input.title ?? null,
      input.uploader ?? null,
      input.subId,
    ) as Row

  return mapJobRow(row)
}

export function getJobSubId(db: Db, uid: string): string | null {
  const row = db.$client.prepare('SELECT sub_id FROM jobs WHERE uid = ?').get(uid) as
    | { sub_id: string | null }
    | undefined
  return row?.sub_id ?? null
}

export function setFileSubscription(db: Db, uid: string, subId: string | null): boolean {
  return db.$client.prepare('UPDATE files SET sub_id = ? WHERE uid = ?').run(subId, uid).changes > 0
}

function bool(value: boolean | undefined): number {
  return value ? 1 : 0
}

function mapRow(row: Row | undefined): Subscription | null {
  if (!row) return null

  return {
    id: row.id as string,
    url: row.url as string,
    name: row.name as string,
    type: row.type as SubscriptionType,
    mediaType: row.media_type as MediaType,
    cron: row.cron as string,
    paused: Boolean(row.paused),
    timerangeFrom: (row.timerange_from as string | null) ?? null,
    titleRegex: (row.title_regex as string | null) ?? null,
    maxQuality: (row.max_quality as string | null) ?? null,
    customArgs: (row.custom_args as string | null) ?? null,
    customOutput: (row.custom_output as string | null) ?? null,
    sponsorblock: row.sponsorblock as Sponsorblock,
    recordLivestreams: Boolean(row.record_livestreams),
    redownloadFreshUploads: Boolean(row.redownload_fresh_uploads),
    rssEnabled: Boolean(row.rss_enabled),
    checking: Boolean(row.checking),
    checkRequested: Boolean(row.check_requested),
    lastCheckAt: toDate(row.last_check_at),
    createdAt: toDate(row.created_at)!,
    updatedAt: toDate(row.updated_at)!,
  }
}

function mapJobRow(row: Row): Job {
  return {
    uid: row.uid as string,
    url: row.url as string,
    type: row.type as MediaType,
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
    subId: (row.sub_id as string | null) ?? null,
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
