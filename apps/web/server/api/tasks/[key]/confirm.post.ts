import { getTask, listTaskRuns, requestTaskConfirm } from '@fetcharr/db'

import { requireTask, toListEntry } from '../index.get.ts'

/**
 * Bestätigt die destruktive zweite Phase. Auch das ist nur ein Flag; ohne
 * wartenden Lauf gäbe es nichts zu bestätigen, deshalb 409.
 */
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const db = await useDb()

  const task = requireTask(db, key)
  if (!task.confirming) {
    throw createError({ statusCode: 409, statusMessage: 'This task is not waiting for a confirmation' })
  }

  requestTaskConfirm(db, key)

  const [lastRun] = listTaskRuns(db, { key, limit: 1 })
  return { task: toListEntry(getTask(db, key)!, lastRun ?? null) }
})
