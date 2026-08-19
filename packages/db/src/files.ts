import type { Db } from './index.ts'
import type { FileRow, MediaType } from './schema.ts'

/**
 * Bibliotheks-Repository. `path`/`thumbnail_path` sind relativ zu DOWNLOADS_DIR —
 * das Auflösen zu einem absoluten Pfad passiert erst in der API-Schicht.
 */

export type FileSort = 'date' | 'title' | 'size'
export type SortOrder = 'asc' | 'desc'

export interface ListFilesOptions {
  search?: string | null
  type?: MediaType | null
  favorite?: boolean | null
  sort?: FileSort
  order?: SortOrder
  limit?: number
  offset?: number
}

export interface ListFilesResult {
  files: FileRow[]
  total: number
}

export interface RegisterViewOptions {
  /** `undefined` lässt die gespeicherte Position stehen, `null` löscht sie. */
  positionSec?: number | null
  countView?: boolean
}

type Row = Record<string, unknown>

const SORT_COLUMNS: Record<FileSort, string> = {
  date: 'created_at',
  title: 'title COLLATE NOCASE',
  size: 'size_bytes',
}

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export function listFiles(db: Db, options: ListFilesOptions = {}): ListFilesResult {
  const { where, params } = buildFilter(options)
  const column = SORT_COLUMNS[options.sort ?? 'date']
  const direction = options.order === 'asc' ? 'ASC' : 'DESC'
  const limit = clampLimit(options.limit)
  const offset = Math.max(0, Math.floor(options.offset ?? 0))

  const rows = db.$client
    .prepare(
      `SELECT * FROM files ${where}
       ORDER BY ${column} ${direction}, rowid ${direction}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Row[]

  const total = db.$client.prepare(`SELECT COUNT(*) AS n FROM files ${where}`).get(...params) as {
    n: number
  }

  return { files: rows.map((row) => mapFileRow(row)!), total: total.n }
}

export function getFile(db: Db, uid: string): FileRow | null {
  const row = db.$client.prepare('SELECT * FROM files WHERE uid = ?').get(uid) as Row | undefined
  return mapFileRow(row)
}

/** Für den ZIP-Download: unbekannte uids fallen still heraus. */
export function getFilesByUids(db: Db, uids: string[]): FileRow[] {
  if (!uids.length) return []

  const placeholders = uids.map(() => '?').join(', ')
  const rows = db.$client
    .prepare(`SELECT * FROM files WHERE uid IN (${placeholders}) ORDER BY created_at DESC, rowid DESC`)
    .all(...uids) as Row[]

  return rows.map((row) => mapFileRow(row)!)
}

/** Löscht die DB-Zeile und liefert sie zurück, damit der Aufrufer die Dateien entfernen kann. */
export function deleteFile(db: Db, uid: string): FileRow | null {
  const row = db.$client.prepare('DELETE FROM files WHERE uid = ? RETURNING *').get(uid) as
    | Row
    | undefined
  return mapFileRow(row)
}

export function setFavorite(db: Db, uid: string, favorite: boolean): FileRow | null {
  const row = db.$client
    .prepare('UPDATE files SET favorite = ? WHERE uid = ? RETURNING *')
    .get(favorite ? 1 : 0, uid) as Row | undefined
  return mapFileRow(row)
}

/**
 * Zählt einen Aufruf und schreibt die Weiterschauen-Position. Der Player meldet
 * beim Start einen View und danach nur noch Positionen (`countView: false`).
 */
export function registerView(db: Db, uid: string, options: RegisterViewOptions = {}): FileRow | null {
  const keepPosition = options.positionSec === undefined
  const row = db.$client
    .prepare(
      `UPDATE files SET
         view_count = view_count + ?,
         resume_position_sec = CASE WHEN ? THEN resume_position_sec ELSE ? END
       WHERE uid = ?
       RETURNING *`,
    )
    .get(
      options.countView === false ? 0 : 1,
      keepPosition ? 1 : 0,
      keepPosition ? null : options.positionSec,
      uid,
    ) as Row | undefined

  return mapFileRow(row)
}

function buildFilter(options: ListFilesOptions): { where: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  const search = options.search?.trim()
  if (search) {
    clauses.push(`(title LIKE ? ESCAPE '\\' OR uploader LIKE ? ESCAPE '\\')`)
    const pattern = `%${escapeLike(search)}%`
    params.push(pattern, pattern)
  }

  if (options.type) {
    clauses.push('type = ?')
    params.push(options.type)
  }

  if (options.favorite != null) {
    clauses.push('favorite = ?')
    params.push(options.favorite ? 1 : 0)
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** `%` und `_` sind LIKE-Wildcards — im Suchbegriff sind sie normale Zeichen. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

function mapFileRow(row: Row | undefined): FileRow | null {
  if (!row) return null

  return {
    uid: row.uid as string,
    url: row.url as string,
    title: row.title as string,
    uploader: (row.uploader as string | null) ?? null,
    type: row.type as MediaType,
    path: row.path as string,
    sizeBytes: (row.size_bytes as number | null) ?? null,
    durationSec: (row.duration_sec as number | null) ?? null,
    thumbnailPath: (row.thumbnail_path as string | null) ?? null,
    uploadDate: (row.upload_date as string | null) ?? null,
    infoJson: parseJson(row.info_json),
    favorite: Boolean(row.favorite),
    viewCount: row.view_count as number,
    resumePositionSec: (row.resume_position_sec as number | null) ?? null,
    createdAt: new Date((row.created_at as number) * 1000),
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null

  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}
