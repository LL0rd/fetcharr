import type { Db } from './index.ts'
import type { notifications } from './schema.ts'

/**
 * Notification-Center. Der Worker schreibt hier hinein, die Web-App liest und
 * quittiert. Der SSE-Stream pollt über `listNotificationsSince` — die
 * autoincrement-id ist der Cursor, weil `created_at` nur Sekunden auflöst.
 */

export type Notification = typeof notifications.$inferSelect

export type NotificationType =
  | 'download_finished'
  | 'download_error'
  | 'subscription_found'
  | 'task_confirm'
  | 'system'

export interface AddNotificationInput {
  type: NotificationType | string
  title: string
  body?: string | null
  url?: string | null
}

export interface ListNotificationsOptions {
  unreadOnly?: boolean
  limit?: number
  offset?: number
}

export interface ListNotificationsResult {
  notifications: Notification[]
  /** Treffer des aktuellen Filters. */
  total: number
  /** Ungelesene insgesamt — der Zähler an der Glocke. */
  unread: number
  limit: number
  offset: number
}

type Row = Record<string, unknown>

export const NOTIFICATIONS_DEFAULT_LIMIT = 20
export const NOTIFICATIONS_MAX_LIMIT = 200

export function addNotification(db: Db, input: AddNotificationInput): Notification {
  const row = db.$client
    .prepare(
      `INSERT INTO notifications (type, title, body, url, read, created_at)
       VALUES (?, ?, ?, ?, 0, unixepoch()) RETURNING *`,
    )
    .get(input.type, input.title, input.body ?? null, input.url ?? null) as Row

  return mapRow(row)!
}

export function listNotifications(
  db: Db,
  options: ListNotificationsOptions = {},
): ListNotificationsResult {
  const where = options.unreadOnly ? 'WHERE read = 0' : ''
  const limit = clampLimit(options.limit)
  const offset = Math.max(0, Math.floor(options.offset ?? 0))

  const rows = db.$client
    .prepare(`SELECT * FROM notifications ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as Row[]

  const total = db.$client.prepare(`SELECT COUNT(*) AS n FROM notifications ${where}`).get() as {
    n: number
  }

  return {
    notifications: rows.map((row) => mapRow(row)!),
    total: total.n,
    unread: countUnreadNotifications(db),
    limit,
    offset,
  }
}

/** Neue Einträge seit dem Cursor, älteste zuerst — Futter für den Event-Stream. */
export function listNotificationsSince(db: Db, sinceId: number): Notification[] {
  const rows = db.$client
    .prepare('SELECT * FROM notifications WHERE id > ? ORDER BY id ASC LIMIT ?')
    .all(sinceId, NOTIFICATIONS_MAX_LIMIT) as Row[]

  return rows.map((row) => mapRow(row)!)
}

export function countUnreadNotifications(db: Db): number {
  const row = db.$client.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read = 0').get() as {
    n: number
  }
  return row.n
}

/** Liefert die Zahl der tatsächlich umgestellten Einträge. */
export function markNotificationsRead(db: Db, ids: number[]): number {
  const valid = ids.filter((id) => Number.isInteger(id))
  if (!valid.length) return 0

  const placeholders = valid.map(() => '?').join(', ')
  return db.$client
    .prepare(`UPDATE notifications SET read = 1 WHERE read = 0 AND id IN (${placeholders})`)
    .run(...valid).changes
}

export function markAllNotificationsRead(db: Db): number {
  return db.$client.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run().changes
}

export function deleteAllNotifications(db: Db): number {
  return db.$client.prepare('DELETE FROM notifications').run().changes
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return NOTIFICATIONS_DEFAULT_LIMIT
  return Math.min(NOTIFICATIONS_MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

function mapRow(row: Row | undefined): Notification | null {
  if (!row) return null

  return {
    id: row.id as number,
    type: row.type as string,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    read: Boolean(row.read),
    createdAt: new Date((row.created_at as number) * 1000),
  }
}
