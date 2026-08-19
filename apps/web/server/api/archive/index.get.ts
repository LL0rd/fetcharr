import { ARCHIVE_DEFAULT_LIMIT, ARCHIVE_MAX_LIMIT, listArchive, listSubscriptions } from '@fetcharr/db'

/** Archiv-Liste: Suche über Media-Id/Titel, Filter auf eine Subscription. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, unknown>
  const limit = parseInteger(query.limit, ARCHIVE_DEFAULT_LIMIT, 1, ARCHIVE_MAX_LIMIT)
  const offset = parseInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER)

  const db = await useDb()
  const { entries, total } = listArchive(db, {
    search: text(query.q) ?? text(query.search),
    subId: text(query.subId),
    limit,
    offset,
  })

  // Die Tabelle zeigt den Namen der Subscription, nicht ihre id.
  const names = new Map(listSubscriptions(db).map((sub) => [sub.id, sub.name]))

  return {
    entries: entries.map((entry) => ({
      ...entry,
      subName: entry.subId ? names.get(entry.subId) ?? null : null,
    })),
    total,
    limit,
    offset,
  }
})

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
