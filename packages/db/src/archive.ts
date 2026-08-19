import type { Db } from './index.ts'
import type { archive, MediaType } from './schema.ts'

/**
 * Download-Archiv im yt-dlp-Format (`<extractor> <id>`), aber in der DB statt in
 * einer archive.txt. Einträge ohne `subId` gehören zu manuellen Downloads;
 * SQLite behandelt NULLs im UNIQUE-Index als verschieden, deshalb prüft jedes
 * Insert selbst per `IS` auf Dubletten.
 */

export type ArchiveEntry = typeof archive.$inferSelect

export interface ArchiveKey {
  extractor: string
  mediaId: string
  subId?: string | null
}

export interface AddArchiveInput extends ArchiveKey {
  type?: MediaType
  title?: string | null
}

export interface ListArchiveOptions {
  subId?: string | null
  search?: string | null
  limit?: number
  offset?: number
}

export interface ListArchiveResult {
  entries: ArchiveEntry[]
  total: number
}

type Row = Record<string, unknown>

export const ARCHIVE_DEFAULT_LIMIT = 50
export const ARCHIVE_MAX_LIMIT = 500

export function hasArchiveEntry(db: Db, key: ArchiveKey): boolean {
  const row = db.$client
    .prepare('SELECT 1 AS hit FROM archive WHERE extractor = ? AND media_id = ? AND sub_id IS ?')
    .get(normalize(key.extractor), key.mediaId, key.subId ?? null) as Row | undefined

  return Boolean(row)
}

/** Idempotent: derselbe Eintrag aktualisiert höchstens den Titel. */
export function addArchiveEntry(db: Db, input: AddArchiveInput): ArchiveEntry {
  const extractor = normalize(input.extractor)
  const subId = input.subId ?? null

  db.$client
    .prepare(
      `INSERT INTO archive (extractor, media_id, type, sub_id, title, created_at)
       SELECT ?, ?, ?, ?, ?, unixepoch()
       WHERE NOT EXISTS (
         SELECT 1 FROM archive WHERE extractor = ? AND media_id = ? AND sub_id IS ?
       )`,
    )
    .run(
      extractor,
      input.mediaId,
      input.type ?? 'video',
      subId,
      input.title ?? null,
      extractor,
      input.mediaId,
      subId,
    )

  const row = db.$client
    .prepare(
      `UPDATE archive SET title = COALESCE(?, title)
       WHERE extractor = ? AND media_id = ? AND sub_id IS ?
       RETURNING *`,
    )
    .get(input.title ?? null, extractor, input.mediaId, subId) as Row

  return mapRow(row)!
}

export function removeArchiveEntry(db: Db, id: number): boolean {
  return db.$client.prepare('DELETE FROM archive WHERE id = ?').run(id).changes > 0
}

export function listArchive(db: Db, options: ListArchiveOptions = {}): ListArchiveResult {
  const { where, params } = buildFilter(options)
  const limit = clampLimit(options.limit)
  const offset = Math.max(0, Math.floor(options.offset ?? 0))

  const rows = db.$client
    .prepare(`SELECT * FROM archive ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Row[]

  const total = db.$client.prepare(`SELECT COUNT(*) AS n FROM archive ${where}`).get(...params) as {
    n: number
  }

  return { entries: rows.map((row) => mapRow(row)!), total: total.n }
}

export function listArchiveBySub(db: Db, subId: string): ArchiveEntry[] {
  return listArchive(db, { subId, limit: ARCHIVE_MAX_LIMIT }).entries
}

export function countArchiveBySub(db: Db): Record<string, number> {
  const rows = db.$client
    .prepare('SELECT sub_id, COUNT(*) AS n FROM archive WHERE sub_id IS NOT NULL GROUP BY sub_id')
    .all() as { sub_id: string; n: number }[]

  return Object.fromEntries(rows.map((row) => [row.sub_id, row.n]))
}

/** Liest eine archive.txt ein und liefert die Zahl der neu angelegten Einträge. */
export function importArchive(
  db: Db,
  text: string,
  options: { subId?: string | null; type?: MediaType } = {},
): number {
  let imported = 0

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const [extractor, mediaId] = trimmed.split(/\s+/)
    if (!extractor || !mediaId) continue
    if (hasArchiveEntry(db, { extractor, mediaId, subId: options.subId })) continue

    addArchiveEntry(db, { extractor, mediaId, subId: options.subId, type: options.type })
    imported += 1
  }

  return imported
}

export function exportArchive(db: Db, options: { subId?: string | null } = {}): string {
  const where = options.subId ? 'WHERE sub_id = ?' : ''
  const params = options.subId ? [options.subId] : []

  const rows = db.$client
    .prepare(`SELECT extractor, media_id FROM archive ${where} ORDER BY extractor, media_id`)
    .all(...params) as { extractor: string; media_id: string }[]

  return rows.map((row) => `${row.extractor} ${row.media_id}\n`).join('')
}

function buildFilter(options: ListArchiveOptions): { where: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  if (options.subId) {
    clauses.push('sub_id = ?')
    params.push(options.subId)
  }

  const search = options.search?.trim()
  if (search) {
    clauses.push(`(title LIKE ? ESCAPE '\\' OR media_id LIKE ? ESCAPE '\\')`)
    const pattern = `%${escapeLike(search)}%`
    params.push(pattern, pattern)
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return ARCHIVE_DEFAULT_LIMIT
  return Math.min(ARCHIVE_MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

/** yt-dlp schreibt Extractor-Keys mal als `youtube`, mal als `YouTube`. */
function normalize(extractor: string): string {
  return extractor.trim().toLowerCase()
}

function mapRow(row: Row | undefined): ArchiveEntry | null {
  if (!row) return null

  return {
    id: row.id as number,
    extractor: row.extractor as string,
    mediaId: row.media_id as string,
    type: row.type as MediaType,
    subId: (row.sub_id as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    createdAt: new Date((row.created_at as number) * 1000),
  }
}
