import { countUnreadNotifications, listJobs, listNotifications, listNotificationsSince } from '@fetcharr/db'
import type { Db, Job, Notification } from '@fetcharr/db'

const POLL_MS = 1000

export interface NotificationUpdate {
  notifications: Notification[]
  unread: number
  cursor: number
}

/**
 * Live-Stream der Queue. Statt eines Event-Bus zwischen zwei Prozessen pollt
 * der Stream die Jobs über `updated_at` — jede Mutation setzt die Spalte, also
 * deckt der Cursor auch `cancelled` und Abschlüsse ab.
 */
export default defineEventHandler(async (event) => {
  const db = await useDb()
  const stream = createEventStream(event)

  let cursor = 0
  let lastPayload = ''

  // Was vor dem Verbindungsaufbau lag, ist keine Neuigkeit mehr: die Liste holt
  // der Client über /api/notifications, der Stream liefert nur, was danach kommt.
  let notificationCursor = latestNotificationId(db)
  // Ein frisch verbundener Client steht auf 0 — deshalb ist eine leere Glocke
  // nichts, was gemeldet werden müsste.
  let lastUnread = 0

  const tick = async (): Promise<void> => {
    const update = collectUpdates(db, cursor)
    cursor = update.cursor
    if (!update.jobs.length) return

    // `updated_at` hat Sekundenauflösung, deshalb liest der Cursor inklusive und
    // kann dieselbe Sekunde erneut liefern — unveränderte Payloads fliegen raus.
    const payload = JSON.stringify(update.jobs)
    if (payload === lastPayload) return
    lastPayload = payload

    await stream.push({ event: 'jobs', data: payload })
  }

  /** Gemeldet wird nur, was neu ist oder den Zähler verändert. */
  const tickNotifications = async (): Promise<void> => {
    const update = collectNotifications(db, notificationCursor)
    notificationCursor = update.cursor
    if (!update.notifications.length && update.unread === lastUnread) return
    lastUnread = update.unread

    await stream.push({ event: 'notifications', data: JSON.stringify(update) })
  }

  const timer = setInterval(() => {
    void tick()
    void tickNotifications()
  }, POLL_MS)

  stream.onClosed(async () => {
    clearInterval(timer)
    await stream.close()
  })

  // Reihenfolge ist zwingend: `send()` setzt die Header und hängt den Leser an den
  // internen TransformStream. Ein `push()` davor wartet ewig auf Backpressure —
  // der Handler käme nie bis `send()` und die Antwort bliebe komplett leer.
  const sending = stream.send()
  void tick()
  void tickNotifications()

  return sending
})

/** Alle Jobs, die seit dem Cursor angefasst wurden, plus dem neuen Cursor (ms). */
export function collectUpdates(db: Db, cursor: number): { jobs: Job[]; cursor: number } {
  const jobs = listJobs(db).filter((job) => job.updatedAt.getTime() >= cursor)
  const newest = jobs.reduce((max, job) => Math.max(max, job.updatedAt.getTime()), cursor)

  return { jobs, cursor: newest }
}

/** Neue Notifications seit dem Cursor plus dem aktuellen Ungelesen-Zähler. */
export function collectNotifications(db: Db, cursor: number): NotificationUpdate {
  const fresh = listNotificationsSince(db, cursor)
  const newest = fresh.reduce((max, entry) => Math.max(max, entry.id), cursor)

  return { notifications: fresh, unread: countUnreadNotifications(db), cursor: newest }
}

function latestNotificationId(db: Db): number {
  return listNotifications(db, { limit: 1 }).notifications[0]?.id ?? 0
}
