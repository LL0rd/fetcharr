import { Cron } from 'croner'

import { createSubscription } from '@fetcharr/db'
import type { CreateSubscriptionInput, UpdateSubscriptionInput } from '@fetcharr/db'

import { withNextCheck } from './index.get.ts'

/**
 * Legt ein Abo an. Validiert wird von Hand im Stil der übrigen Handler: zod
 * steckt im Monorepo nur in @fetcharr/shared und ist aus apps/web nicht
 * auflösbar. Der Cron-Ausdruck geht durch croner — derselbe Parser, den der
 * Scheduler im Worker benutzt.
 */

const TYPES = new Set(['channel', 'playlist', 'generic'])
const MEDIA_TYPES = new Set(['video', 'audio'])
const QUALITIES = new Set(['best', '1080p', '720p', 'audio'])
const SPONSORBLOCK = new Set(['remove', 'mark', 'off'])

const DEFAULT_CRON = '0 */6 * * *'

/** Optionale Textfelder: leerer String heißt „Feld löschen". */
const TEXT_FIELDS = [
  'timerangeFrom',
  'titleRegex',
  'maxQuality',
  'customArgs',
  'customOutput',
] as const

const FLAG_FIELDS = [
  'paused',
  'recordLivestreams',
  'redownloadFreshUploads',
  'rssEnabled',
] as const

export default defineEventHandler(async (event) => {
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  const input = parseSubscriptionBody(body, 'create') as CreateSubscriptionInput
  const db = await useDb()

  const subscription = createSubscription(db, input)
  setResponseStatus(event, 201)

  return { subscription: withNextCheck(subscription) }
})

/**
 * `create` erzwingt url und name und füllt den Rest mit Defaults, `patch`
 * übernimmt nur mitgeschickte Felder — ein leerer Patch ist ein Fehler.
 */
export function parseSubscriptionBody(
  body: Record<string, unknown>,
  mode: 'create' | 'patch',
): CreateSubscriptionInput | UpdateSubscriptionInput {
  const input: Record<string, unknown> = {}
  const creating = mode === 'create'

  if (creating || body.url !== undefined) input.url = parseUrl(body.url)
  if (creating || body.name !== undefined) input.name = parseName(body.name)

  if (creating || body.type !== undefined) {
    input.type = parseEnum(body.type, TYPES, 'type', creating ? 'channel' : undefined)
  }
  if (creating || body.mediaType !== undefined) {
    input.mediaType = parseEnum(
      body.mediaType,
      MEDIA_TYPES,
      'mediaType',
      creating ? 'video' : undefined,
    )
  }
  if (creating || body.sponsorblock !== undefined) {
    input.sponsorblock = parseEnum(
      body.sponsorblock,
      SPONSORBLOCK,
      'sponsorblock',
      creating ? 'off' : undefined,
    )
  }
  if (creating || body.cron !== undefined) {
    input.cron = parseCron(body.cron, creating ? DEFAULT_CRON : undefined)
  }

  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) continue
    input[field] = parseOptionalText(body[field], field)
  }
  for (const field of FLAG_FIELDS) {
    if (body[field] === undefined) continue
    input[field] = parseFlag(body[field], field)
  }

  if (!creating && !Object.keys(input).length) {
    throw createError({ statusCode: 400, statusMessage: 'No known field to update' })
  }

  return input as CreateSubscriptionInput | UpdateSubscriptionInput
}

function parseUrl(value: unknown): string {
  const url = typeof value === 'string' ? value.trim() : ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  }
  catch {
    // fällt unten in den 400
  }
  throw createError({ statusCode: 400, statusMessage: 'A http(s) url is required' })
}

function parseName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  if (name.length > 200) throw createError({ statusCode: 400, statusMessage: 'name is too long' })

  return name
}

function parseEnum(value: unknown, allowed: Set<string>, field: string, fallback?: string): string {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback
    throw createError({ statusCode: 400, statusMessage: `${field} is required` })
  }
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be one of ${[...allowed].join(', ')}`,
    })
  }
  return value
}

export function parseCron(value: unknown, fallback?: string): string {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback
    throw createError({ statusCode: 400, statusMessage: 'cron is required' })
  }
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'cron must be a string' })
  }

  try {
    new Cron(value.trim())
  }
  catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: 'cron is not a valid expression',
      data: { reason: (error as Error).message },
    })
  }
  return value.trim()
}

function parseOptionalText(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a string` })
  }

  const text = value.trim()
  if (!text) return null

  if (field === 'timerangeFrom' && !/^\d{8}$/.test(text)) {
    throw createError({ statusCode: 400, statusMessage: 'timerangeFrom must look like YYYYMMDD' })
  }
  if (field === 'titleRegex') assertRegex(text)
  if (field === 'maxQuality' && !QUALITIES.has(text)) {
    throw createError({
      statusCode: 400,
      statusMessage: `maxQuality must be one of ${[...QUALITIES].join(', ')}`,
    })
  }
  return text
}

function assertRegex(pattern: string): void {
  try {
    new RegExp(pattern)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'titleRegex is not a valid expression' })
  }
}

function parseFlag(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1) return true
  if (value === 'false' || value === 0) return false

  throw createError({ statusCode: 400, statusMessage: `${field} must be a boolean` })
}
