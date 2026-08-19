import { Cron } from 'croner'

import { listTaskRuns, setTaskSchedule } from '@fetcharr/db'
import type { TaskSchedule } from '@fetcharr/db'

import { requireTask, toListEntry } from '../index.get.ts'
import { parseCron } from '../../subscriptions/index.post.ts'

/**
 * Zeitplan setzen: wiederkehrend per Cron, einmalig per Zeitpunkt oder gar
 * nicht (`null` = nur manuell). Der Cron geht durch croner — denselben Parser
 * benutzt der Scheduler im Worker.
 */
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  const schedule = parseSchedule('schedule' in body ? body.schedule : body)

  const db = await useDb()
  requireTask(db, key)
  const task = setTaskSchedule(db, key, schedule)!

  const [lastRun] = listTaskRuns(db, { key, limit: 1 })
  return { task: toListEntry(task, lastRun ?? null), nextRunAt: nextRunAt(schedule) }
})

export function parseSchedule(value: unknown): TaskSchedule | null {
  if (value === null || value === undefined) return null

  const input = value as Record<string, unknown>
  if (input.type === 'recurring') return { type: 'recurring', cron: parseCron(input.cron) }
  if (input.type === 'once') return { type: 'once', timestamp: parseTimestamp(input.timestamp) }

  throw createError({
    statusCode: 400,
    statusMessage: 'schedule must be null or of type recurring or once',
  })
}

/** Sekunden seit Epoch; die UI darf auch den ISO-String des Datumsfeldes schicken. */
function parseTimestamp(value: unknown): number {
  const seconds
    = typeof value === 'number'
      ? Math.floor(value)
      : typeof value === 'string'
        ? Math.floor(new Date(value).getTime() / 1000)
        : Number.NaN

  if (!Number.isFinite(seconds)) {
    throw createError({ statusCode: 400, statusMessage: 'timestamp is not a valid point in time' })
  }
  return seconds
}

export function nextRunAt(schedule: TaskSchedule | null): Date | null {
  if (!schedule) return null
  if (schedule.type === 'once') return new Date(schedule.timestamp * 1000)

  try {
    return new Cron(schedule.cron).nextRun()
  }
  catch {
    return null
  }
}
