import { getJob, pauseJob } from '@fetcharr/db'

/**
 * Pausiert einen wartenden Job. Ein laufender yt-dlp-Prozess lässt sich nicht
 * sauber anhalten — `running` gibt es deshalb nur als Abbruch (409).
 */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const db = await useDb()

  const job = pauseJob(db, uid)
  if (job) return { job }

  const current = getJob(db, uid)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  throw createError({
    statusCode: 409,
    statusMessage:
      current.status === 'running'
        ? 'A running download cannot be paused, cancel it instead'
        : `Only queued jobs can be paused, this one is ${current.status}`,
  })
})
