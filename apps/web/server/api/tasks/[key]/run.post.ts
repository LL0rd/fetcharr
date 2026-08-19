import { getTask, listTaskRuns, requestTaskRun } from '@fetcharr/db'

import { requireTask, toListEntry } from '../index.get.ts'

/**
 * „Run now" setzt nur `run_requested`. Die Engine im Worker holt das Flag ab —
 * die Web-App führt selbst keinen Task aus.
 */
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const db = await useDb()

  const task = requireTask(db, key)
  if (task.running) {
    throw createError({ statusCode: 409, statusMessage: 'This task is already running' })
  }

  requestTaskRun(db, key)

  const [lastRun] = listTaskRuns(db, { key, limit: 1 })
  return { task: toListEntry(getTask(db, key)!, lastRun ?? null) }
})
