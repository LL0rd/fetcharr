import { createJob } from '@fetcharr/db'
import type { CreateJobInput } from '@fetcharr/db'
import { JobOptionsSchema } from '@fetcharr/shared'

const TYPES = new Set(['video', 'audio'])

/**
 * Nimmt einen neuen Download in die Queue. `title`/`uploader` kommen aus dem
 * Probe-Ergebnis mit, damit die Queue sofort den Titel statt der URL zeigt.
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}
  const input = parseCreateBody(body)
  const db = await useDb()
  const job = createJob(db, input)

  setResponseStatus(event, 201)
  return { job }
})

export function parseCreateBody(body: Record<string, unknown>): CreateJobInput {
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!isHttpUrl(url)) {
    throw createError({ statusCode: 400, statusMessage: 'A http(s) url is required' })
  }

  const parsed = JobOptionsSchema.safeParse(body.options ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid job options',
      data: { issues: parsed.error.issues },
    })
  }

  const type = body.type ?? (parsed.data.format === 'audio' ? 'audio' : 'video')
  if (typeof type !== 'string' || !TYPES.has(type)) {
    throw createError({ statusCode: 400, statusMessage: 'type must be video or audio' })
  }

  const priority = body.priority ?? 0
  if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 0) {
    throw createError({ statusCode: 400, statusMessage: 'priority must be a non-negative integer' })
  }

  return {
    url,
    type: type as CreateJobInput['type'],
    options: parsed.data,
    priority,
    title: optionalText(body.title),
    uploader: optionalText(body.uploader),
  }
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  }
  catch {
    return false
  }
}
