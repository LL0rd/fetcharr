import { listTaskRuns } from '@fetcharr/db'

import { requireTask } from '../index.get.ts'

/** Lauf-Historie eines Tasks — neueste zuerst, wie sie das Board aufklappt. */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const db = await useDb()
  requireTask(db, key)

  const runs = listTaskRuns(db, { key, limit: parseLimit(getQuery(event).limit) })
  return { runs, total: runs.length }
})

function parseLimit(value: unknown): number {
  const limit = Number(value)
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT

  return Math.min(Math.floor(limit), MAX_LIMIT)
}
