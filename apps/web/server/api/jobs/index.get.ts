import { listJobs } from '@fetcharr/db'

/** Queue-Liste, neueste zuerst (`created_at desc`). */
export default defineEventHandler(async () => {
  const db = await useDb()
  return { jobs: listJobs(db) }
})
