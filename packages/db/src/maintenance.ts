import type { Db } from './index.ts'
import type { MediaType } from './schema.ts'

/**
 * Abfragen für die Wartungs-Tasks. Sie liefern bewusst nur die Felder, die zum
 * Prüfen und Aufräumen nötig sind — der Run-Teil eines Tasks legt sein Ergebnis
 * als JSON in `tasks.confirm_payload` ab, und dort hat der volle `info_json`
 * nichts verloren.
 */

export interface MaintenanceFile {
  uid: string
  url: string
  title: string
  type: MediaType
  path: string
  thumbnailPath: string | null
  sizeBytes: number | null
  favorite: boolean
  subId: string | null
  createdAt: Date
}

export interface DuplicateGroup {
  url: string
  /** Ältester Eintrag zuerst — er ist der, den `duplicate_files_check` behält. */
  files: MaintenanceFile[]
}

export interface OlderThanOptions {
  keepFavorites?: boolean
  keepSubscriptions?: boolean
}

type Row = Record<string, unknown>

const COLUMNS =
  'uid, url, title, type, path, thumbnail_path, size_bytes, favorite, sub_id, created_at'

export function listFilesForMaintenance(db: Db): MaintenanceFile[] {
  const rows = db.$client
    .prepare(`SELECT ${COLUMNS} FROM files ORDER BY created_at ASC, rowid ASC`)
    .all() as Row[]

  return rows.map(mapFile)
}

export function listFilePaths(db: Db): string[] {
  const rows = db.$client.prepare('SELECT path FROM files').all() as { path: string }[]
  return rows.map((row) => row.path)
}

export function countFiles(db: Db): number {
  const row = db.$client.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }
  return row.n
}

export function listDuplicateFileGroups(db: Db): DuplicateGroup[] {
  const rows = db.$client
    .prepare(
      `SELECT ${COLUMNS} FROM files
        WHERE url IN (SELECT url FROM files GROUP BY url HAVING COUNT(*) > 1)
        ORDER BY url, created_at ASC, rowid ASC`,
    )
    .all() as Row[]

  const groups = new Map<string, MaintenanceFile[]>()
  for (const row of rows) {
    const file = mapFile(row)
    const group = groups.get(file.url)
    if (group) group.push(file)
    else groups.set(file.url, [file])
  }

  return [...groups].map(([url, files]) => ({ url, files }))
}

/** Alles, was älter als `days` Tage ist; Favoriten und Subscription-Dateien bleiben per Default außen vor. */
export function listFilesOlderThan(
  db: Db,
  days: number,
  options: OlderThanOptions = {},
): MaintenanceFile[] {
  const clauses = ['created_at < unixepoch() - ?']
  if (options.keepFavorites !== false) clauses.push('favorite = 0')
  if (options.keepSubscriptions !== false) clauses.push('sub_id IS NULL')

  const rows = db.$client
    .prepare(
      `SELECT ${COLUMNS} FROM files WHERE ${clauses.join(' AND ')}
        ORDER BY created_at ASC, rowid ASC`,
    )
    .all(Math.max(0, days) * 86_400) as Row[]

  return rows.map(mapFile)
}

/** Für `rebuild_database`: die Bibliothek wird anschließend aus dem Dateisystem neu befüllt. */
export function clearFiles(db: Db): number {
  return db.$client.prepare('DELETE FROM files').run().changes
}

function mapFile(row: Row): MaintenanceFile {
  return {
    uid: row.uid as string,
    url: row.url as string,
    title: row.title as string,
    type: row.type as MediaType,
    path: row.path as string,
    thumbnailPath: (row.thumbnail_path as string | null) ?? null,
    sizeBytes: (row.size_bytes as number | null) ?? null,
    favorite: Boolean(row.favorite),
    subId: (row.sub_id as string | null) ?? null,
    createdAt: new Date((row.created_at as number) * 1000),
  }
}
