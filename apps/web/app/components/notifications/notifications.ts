/** Über die Leitung ist `createdAt` JSON, also ein ISO-String statt `Date`. */
export interface NotificationItem {
  id: number
  type: string
  title: string
  body: string | null
  url: string | null
  read: boolean
  createdAt: string
}

export interface NotificationPage {
  notifications: NotificationItem[]
  total: number
  unread: number
  limit: number
  offset: number
}

/** Was der Event-Stream unter `notifications` schickt. */
export interface NotificationUpdate {
  notifications: NotificationItem[]
  unread: number
  cursor: number
}

/** Das Dropdown zeigt die letzten zehn, die Seite blättert in größeren Schritten. */
export const DROPDOWN_LIMIT = 10
export const NOTIFICATIONS_PAGE_SIZE = 50

/** Kurzform wie im Mockup: „2 min", „4 h", „1 d". */
export function notificationAge(iso: string, now: number = Date.now()): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return '—'

  const seconds = Math.max(0, Math.round((now - time) / 1000))
  if (seconds < 60) return `${String(seconds)} s`
  if (seconds < 3600) return `${String(Math.round(seconds / 60))} min`
  if (seconds < 86_400) return `${String(Math.round(seconds / 3600))} h`
  return `${String(Math.round(seconds / 86_400))} d`
}

/** Dreistellige Zähler sprengen die Blase an der Glocke. */
export function badgeLabel(unread: number): string | null {
  if (unread <= 0) return null
  return unread > 99 ? '99+' : String(unread)
}

/**
 * Stream und Nachladen liefern sich überschneidende Listen; die id entscheidet,
 * und der jeweils zuletzt gesehene Stand gewinnt.
 */
export function mergeNotifications(
  current: NotificationItem[],
  incoming: NotificationItem[],
): NotificationItem[] {
  const byId = new Map(current.map((entry) => [entry.id, entry]))
  for (const entry of incoming) byId.set(entry.id, entry)

  return [...byId.values()].sort((a, b) => b.id - a.id)
}
