import type { Db } from '@fetcharr/db'
import {
  SETTINGS_KEYS,
  toGlobalSettings,
  type GlobalSettings,
  type MediaKind,
} from '@fetcharr/shared'

/** Direkte SQL-Zugriffe des Workers jenseits des Job-Repositories. */

const DEFAULT_MAX_CONCURRENT = 3

export function getSetting(db: Db, key: string): unknown {
  const row = db.$client.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined
  if (!row?.value) return undefined

  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

export function getMaxConcurrent(db: Db): number {
  const value = Number(getSetting(db, SETTINGS_KEYS.maxConcurrentDownloads))
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_CONCURRENT
}

/**
 * Die Settings, die in die yt-dlp-Args einfließen. Wird pro Job frisch gelesen,
 * damit eine Änderung im Web ohne Worker-Neustart beim nächsten Download greift.
 */
export function readGlobalSettings(db: Db): GlobalSettings {
  return toGlobalSettings({
    output_template: asString(getSetting(db, SETTINGS_KEYS.outputTemplate)),
    rate_limit: asString(getSetting(db, SETTINGS_KEYS.rateLimit)),
    custom_args: asString(getSetting(db, SETTINGS_KEYS.customArgs)),
  })
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Lebenszeichen für den Health-Endpoint: Unix-Sekunden, im Sekundentakt der DB. */
export function writeHeartbeat(db: Db): void {
  db.$client
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('worker_heartbeat', CAST(unixepoch() AS TEXT))
       ON CONFLICT(key) DO UPDATE SET value = CAST(unixepoch() AS TEXT)`,
    )
    .run()
}

export function getJobStatus(db: Db, uid: string): string | null {
  const row = db.$client.prepare('SELECT status FROM jobs WHERE uid = ?').get(uid) as
    | { status: string }
    | undefined
  return row?.status ?? null
}

export interface FileInput {
  uid: string
  url: string
  title: string
  uploader: string | null
  type: MediaKind
  path: string
  sizeBytes: number | null
  durationSec: number | null
  thumbnailPath: string | null
  uploadDate: string | null
  info: Record<string, unknown> | null
}

export function insertFile(db: Db, file: FileInput): void {
  db.$client
    .prepare(
      `INSERT INTO files (uid, url, title, uploader, type, path, size_bytes, duration_sec,
                          thumbnail_path, upload_date, info_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(uid) DO UPDATE SET
         path = excluded.path, size_bytes = excluded.size_bytes, title = excluded.title`,
    )
    .run(
      file.uid,
      file.url,
      file.title,
      file.uploader,
      file.type,
      file.path,
      file.sizeBytes,
      file.durationSec,
      file.thumbnailPath,
      file.uploadDate,
      file.info ? JSON.stringify(file.info) : null,
    )
}
