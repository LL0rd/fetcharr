/** Seconds a heartbeat may lag behind before the worker counts as down. */
const HEARTBEAT_MAX_AGE_SEC = 5

/**
 * Unauthenticated liveness probe (see the open paths in the auth middleware).
 * `worker` is derived from the heartbeat the worker loop writes every 2s.
 */
export default defineEventHandler(async () => {
  const db = await useDb()
  const row = db.$client
    .prepare(
      `SELECT CAST(unixepoch() - CAST(value AS INTEGER) AS INTEGER) AS age
         FROM settings WHERE key = 'worker_heartbeat'`,
    )
    .get() as { age: number | null } | undefined

  const age = row?.age
  return {
    status: 'ok',
    db: true,
    worker: typeof age === 'number' && age >= 0 && age < HEARTBEAT_MAX_AGE_SEC,
  }
})
