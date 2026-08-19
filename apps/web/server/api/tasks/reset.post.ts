import { resetStuckTasks } from '@fetcharr/db'

/**
 * „Reset stuck tasks": nach einem Absturz des Workers stehen running- und
 * confirming-Flags, ohne dass etwas läuft. Räumt nur Flags auf, bricht nichts ab.
 */
export default defineEventHandler(async (event) => {
  const db = await useDb()
  return { reset: resetStuckTasks(db) }
})
