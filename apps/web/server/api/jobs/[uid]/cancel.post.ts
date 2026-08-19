import { cancelJob, getJob } from '@fetcharr/db'

/** Bricht einen Job ab — erlaubt aus `queued`, `running` und `paused`. */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const db = await useDb()

  const job = cancelJob(db, uid)
  if (job) return { job }

  const current = getJob(db, uid)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  throw createError({
    statusCode: 409,
    statusMessage: `Cannot cancel a job in status ${current.status}`,
  })
})
