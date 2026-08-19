import { listJobs } from '@fetcharr/db'
import type { Db, Job } from '@fetcharr/db'

const POLL_MS = 1000

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

  await tick()
  const timer = setInterval(() => {
    void tick()
  }, POLL_MS)

  stream.onClosed(async () => {
    clearInterval(timer)
    await stream.close()
  })

  return stream.send()
})

/** Alle Jobs, die seit dem Cursor angefasst wurden, plus dem neuen Cursor (ms). */
export function collectUpdates(db: Db, cursor: number): { jobs: Job[]; cursor: number } {
  const jobs = listJobs(db).filter((job) => job.updatedAt.getTime() >= cursor)
  const newest = jobs.reduce((max, job) => Math.max(max, job.updatedAt.getTime()), cursor)

  return { jobs, cursor: newest }
}
