import { listFiles } from '@fetcharr/db'
import type { ListFilesOptions } from '@fetcharr/db'

const SORTS = new Set(['date', 'title', 'size'])
const ORDERS = new Set(['asc', 'desc'])
const TYPES = new Set(['video', 'audio'])

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Bibliotheks-Liste: Suche über Titel/Kanal, Filter, Sortierung, Pagination. */
export default defineEventHandler(async (event) => {
  const options = parseListQuery(getQuery(event) as Record<string, unknown>)
  const db = await useDb()
  const { files, total } = listFiles(db, options)

  return { files, total, limit: options.limit, offset: options.offset }
})

export function parseListQuery(
  query: Record<string, unknown>,
): ListFilesOptions & { limit: number; offset: number } {
  const sort = text(query.sort) ?? 'date'
  if (!SORTS.has(sort)) {
    throw createError({ statusCode: 400, statusMessage: 'sort must be date, title or size' })
  }

  const order = text(query.order) ?? 'desc'
  if (!ORDERS.has(order)) {
    throw createError({ statusCode: 400, statusMessage: 'order must be asc or desc' })
  }

  const type = text(query.type)
  if (type && !TYPES.has(type)) {
    throw createError({ statusCode: 400, statusMessage: 'type must be video or audio' })
  }

  return {
    search: text(query.q) ?? text(query.search) ?? null,
    type: (type as ListFilesOptions['type']) ?? null,
    favorite: parseFavorite(query.favorite),
    sort: sort as ListFilesOptions['sort'],
    order: order as ListFilesOptions['order'],
    limit: parseInteger(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: parseInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  }
}

function parseFavorite(value: unknown): boolean | null {
  const raw = text(value)
  if (raw == null) return null
  if (['true', '1'].includes(raw)) return true
  if (['false', '0'].includes(raw)) return false

  throw createError({ statusCode: 400, statusMessage: 'favorite must be true or false' })
}

function parseInteger(value: unknown, fallback: number, min: number, max: number): number {
  const raw = text(value)
  if (raw == null) return fallback

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < min) {
    throw createError({ statusCode: 400, statusMessage: `Invalid numeric query parameter: ${raw}` })
  }
  return Math.min(parsed, max)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
