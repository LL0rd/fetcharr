import type { Db } from './index.ts'

/**
 * Aggregationen für das Storage-Dashboard und die Prometheus-Metriken. Dateien
 * ohne bekannte Größe zählen mit, ihre `NULL`-Größe bleibt aber 0 — sonst wäre
 * die Summe einer halb befüllten Bibliothek `null` statt einer Zahl.
 */

export interface StorageTotals {
  files: number
  sizeBytes: number
}

export interface StorageGroup {
  /** Rohwert der Gruppierung (uploader, sub_id, type) — leer für „ohne". */
  key: string
  name: string
  sizeBytes: number
  files: number
}

type Row = { key: string | null; size: number | null; files: number }

const TYPE_NAMES: Record<string, string> = { video: 'Video', audio: 'Audio' }

export function storageTotals(db: Db): StorageTotals {
  const row = db.$client
    .prepare('SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS size FROM files')
    .get() as { files: number; size: number }

  return { files: row.files, sizeBytes: row.size }
}

export function storageByUploader(db: Db): StorageGroup[] {
  const rows = db.$client
    .prepare(
      `SELECT uploader AS key, SUM(size_bytes) AS size, COUNT(*) AS files
         FROM files GROUP BY uploader ORDER BY size DESC, files DESC`,
    )
    .all() as Row[]

  return rows.map((row) => toGroup(row, row.key || 'Unknown channel'))
}

export function storageBySubscription(db: Db): StorageGroup[] {
  const rows = db.$client
    .prepare(
      `SELECT f.sub_id AS key, s.name AS name, SUM(f.size_bytes) AS size, COUNT(*) AS files
         FROM files f LEFT JOIN subscriptions s ON s.id = f.sub_id
        GROUP BY f.sub_id ORDER BY size DESC, files DESC`,
    )
    .all() as (Row & { name: string | null })[]

  return rows.map((row) => toGroup(row, row.name || row.key || 'No subscription'))
}

export function storageByType(db: Db): StorageGroup[] {
  const rows = db.$client
    .prepare(
      `SELECT type AS key, SUM(size_bytes) AS size, COUNT(*) AS files
         FROM files GROUP BY type ORDER BY size DESC, files DESC`,
    )
    .all() as Row[]

  return rows.map((row) => toGroup(row, TYPE_NAMES[row.key ?? ''] ?? row.key ?? 'Unknown'))
}

/** Bytes aller Jobs, die seit `since` erfolgreich fertig geworden sind. */
export function bytesFinishedSince(db: Db, since: Date): number {
  const row = db.$client
    .prepare(
      `SELECT COALESCE(SUM(size_bytes), 0) AS size FROM jobs
        WHERE status = 'finished' AND finished_at IS NOT NULL AND finished_at >= ?`,
    )
    .get(Math.floor(since.getTime() / 1000)) as { size: number }

  return row.size
}

function toGroup(row: Row, name: string): StorageGroup {
  return { key: row.key ?? '', name, sizeBytes: row.size ?? 0, files: row.files }
}
