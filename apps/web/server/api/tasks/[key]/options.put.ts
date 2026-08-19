import { listTaskRuns, setTaskOptions } from '@fetcharr/db'

import { catalogFor, requireTask, toListEntry } from '../index.get.ts'
import type { TaskOptionSpec } from '../index.get.ts'

/**
 * Optionen je Task. Erlaubt sind nur die Felder aus dem Katalog — ein fremdes
 * Feld wäre ein Tippfehler, den die Engine nie lesen würde.
 */
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  const input = 'options' in body ? body.options : body

  const db = await useDb()
  const current = requireTask(db, key)

  const options = { ...current.options, ...parseOptions(key, input) }
  const task = setTaskOptions(db, key, options)!

  const [lastRun] = listTaskRuns(db, { key, limit: 1 })
  return { task: toListEntry(task, lastRun ?? null) }
})

export function parseOptions(taskKey: string, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createError({ statusCode: 400, statusMessage: 'An options object is required' })
  }

  const specs = catalogFor(taskKey).optionSpecs
  const parsed: Record<string, unknown> = {}

  for (const [field, value] of Object.entries(input)) {
    const spec = specs.find((entry) => entry.key === field)
    if (!spec) {
      throw createError({
        statusCode: 400,
        statusMessage: `${taskKey} has no option named ${field}`,
      })
    }
    parsed[field] = parseValue(spec, value)
  }

  if (!Object.keys(parsed).length) {
    throw createError({ statusCode: 400, statusMessage: 'No known option to update' })
  }

  return parsed
}

function parseValue(spec: TaskOptionSpec, value: unknown): unknown {
  if (spec.kind === 'boolean') {
    if (typeof value !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: `${spec.key} must be a boolean` })
    }
    return value
  }

  if (spec.kind === 'number') {
    const parsed = typeof value === 'number' ? value : Number(value)
    const min = spec.min ?? Number.NEGATIVE_INFINITY
    const max = spec.max ?? Number.POSITIVE_INFINITY
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw createError({
        statusCode: 400,
        statusMessage: `${spec.key} must be a number between ${String(min)} and ${String(max)}`,
      })
    }
    return Math.floor(parsed)
  }

  if (typeof value !== 'string' || value.length > 500) {
    throw createError({ statusCode: 400, statusMessage: `${spec.key} must be a short string` })
  }
  return value.trim()
}
