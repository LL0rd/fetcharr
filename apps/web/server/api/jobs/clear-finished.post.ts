import { clearFinished } from '@fetcharr/db'

/** Räumt die Queue: löscht alle `finished`-, `errored`- und `cancelled`-Jobs. */
export default defineEventHandler(async () => {
  const db = await useDb()
  return { removed: clearFinished(db) }
})
