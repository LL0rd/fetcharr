import { getJob, resumeJob } from '@fetcharr/db'

/** Hebt eine Pause auf: `paused` → `queued`. */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const db = await useDb()

  const job = resumeJob(db, uid)
  if (job) return { job }

  const current = getJob(db, uid)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  throw createError({
    statusCode: 409,
    statusMessage: `Only paused jobs can be resumed, this one is ${current.status}`,
  })
})
