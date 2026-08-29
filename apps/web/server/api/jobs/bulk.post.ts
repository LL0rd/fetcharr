import { createJob } from '@fetcharr/db'
import type { CreateJobInput, Job } from '@fetcharr/db'
import { JobOptionsSchema } from '@fetcharr/shared'

import { typeForFormat } from './index.post'

const TYPES = new Set(['video', 'audio', 'subtitle'])
const MAX_URLS = 500

export interface BulkImportInput {
  urls: string[]
  type: CreateJobInput['type']
  options: unknown
  skipped: string[]
}

/**
 * Nimmt eine ganze Liste URLs auf einmal in die Queue. Bulk-Jobs laufen mit
 * priority=1 hinter den einzeln eingereihten Downloads, damit ein Import von
 * 200 URLs nicht den nächsten Handgriff blockiert.
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}
  const input = parseBulkBody(body)
  const db = await useDb()

  const jobs: Job[] = []
  for (const url of input.urls) {
    jobs.push(createJob(db, { url, type: input.type, options: input.options, priority: 1 }))
  }

  setResponseStatus(event, 201)
  return { created: jobs.length, skipped: input.skipped, jobs }
})

/**
 * Sammelt die brauchbaren URLs ein. Was nicht nach http(s) aussieht, kippt den
 * Import nicht, sondern landet in `skipped` — bei 200 kopierten Zeilen ist eine
 * kaputte darunter der Normalfall, kein Abbruchgrund.
 */
export function parseBulkBody(body: Record<string, unknown>): BulkImportInput {
  if (!Array.isArray(body.urls)) {
    throw createError({ statusCode: 400, statusMessage: 'urls must be an array' })
  }
  if (body.urls.length > MAX_URLS) {
    throw createError({ statusCode: 400, statusMessage: `At most ${MAX_URLS} urls per import` })
  }

  const parsed = JobOptionsSchema.safeParse(body.options ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid job options',
      data: { issues: parsed.error.issues },
    })
  }

  const type = body.type ?? typeForFormat(parsed.data.format)
  if (typeof type !== 'string' || !TYPES.has(type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'type must be video, audio or subtitle',
    })
  }

  const urls: string[] = []
  const skipped: string[] = []
  const seen = new Set<string>()

  for (const entry of body.urls) {
    const url = typeof entry === 'string' ? entry.trim() : ''
    if (!url) continue
    if (!isHttpUrl(url)) {
      skipped.push(url)
      continue
    }
    if (seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }

  if (!urls.length) {
    throw createError({ statusCode: 400, statusMessage: 'No usable http(s) url in the list' })
  }

  return { urls, type: type as CreateJobInput['type'], options: parsed.data, skipped }
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
