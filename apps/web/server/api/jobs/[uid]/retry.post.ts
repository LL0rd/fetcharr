import { getJob, retryJob } from '@fetcharr/db'

/** Stellt einen fehlgeschlagenen Job zurück in die Queue; `attempts` startet bei 0. */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const db = await useDb()

  const job = retryJob(db, uid)
  if (job) return { job }

  const current = getJob(db, uid)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  throw createError({
    statusCode: 409,
    statusMessage: `Only errored jobs can be retried, this one is ${current.status}`,
  })
})
