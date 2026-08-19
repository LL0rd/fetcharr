import { existsSync } from 'node:fs'
import { readdir, unlink } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

/**
 * Gemeinsame Helfer der Bibliotheks-Routen: Pfadauflösung unterhalb von
 * DOWNLOADS_DIR, Content-Types und das Parsen von Range-Headern.
 */

export interface ByteRange {
  start: number
  end: number
}

/** `null` = kein (verwertbarer) Range-Header, `'invalid'` = 416. */
export type RangeResult = ByteRange | null | 'invalid'

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.flv': 'video/x-flv',
  '.ts': 'video/mp2t',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/**
 * Nur diese Endungen gelten als Beiwerk einer Mediendatei. Ohne Positivliste
 * würde beim Löschen von `Clip.mp4` auch ein eigenständiges `Clip.2.mp4` fallen.
 */
const SIDECAR_EXTENSIONS = [
  '.info.json',
  '.nfo',
  '.description',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.vtt',
  '.srt',
  '.ass',
  '.lrc',
  '.annotations.xml',
]

export function downloadsDir(): string {
  return process.env.DOWNLOADS_DIR ?? './data/downloads'
}

/**
 * Löst einen DB-Pfad gegen DOWNLOADS_DIR auf. Pfade außerhalb des Verzeichnisses
 * werden abgewiesen — die Spalte ist zwar intern, aber der einzige Grund, warum
 * dieser Handler überhaupt Dateien ausliefert.
 */
export function resolveMediaPath(relativePath: string): string {
  const root = resolve(downloadsDir())
  const absolute = resolve(root, relativePath)

  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw createError({ statusCode: 403, statusMessage: 'File path outside the downloads directory' })
  }
  return absolute
}

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Range-Header nach RFC 9110. Mehrfach-Ranges beantworten wir mit dem ersten
 * Bereich — erlaubt, und kein Player fragt im Ernstfall mehr als einen ab.
 */
export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return null

  const match = /^bytes=(.+)$/i.exec(header.trim())
  if (!match) return null

  const parts = /^(\d*)-(\d*)$/.exec(match[1]!.split(',')[0]!.trim())
  if (!parts) return 'invalid'

  const [, rawStart, rawEnd] = parts
  if (!rawStart && !rawEnd) return 'invalid'
  if (size === 0) return 'invalid'

  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (suffix === 0) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(rawStart)
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1
  if (start >= size || start > end) return 'invalid'

  return { start, end }
}

/**
 * Entfernt die Mediendatei, ihr Thumbnail und alle Sidecars mit gleichem Basisnamen.
 * Fehlende Dateien sind kein Fehler: die DB-Zeile soll auch dann verschwinden.
 */
export async function removeMediaFiles(
  relativePath: string,
  thumbnailPath: string | null,
): Promise<string[]> {
  const absolute = resolveMediaPath(relativePath)
  const targets = new Set([absolute, ...(await findSidecars(absolute))])
  if (thumbnailPath) targets.add(resolveMediaPath(thumbnailPath))

  const removed: string[] = []
  for (const target of targets) {
    try {
      await unlink(target)
      removed.push(target)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return removed
}

async function findSidecars(absolute: string): Promise<string[]> {
  const directory = dirname(absolute)
  if (!existsSync(directory)) return []

  const stem = basename(absolute, extname(absolute))
  const entries = await readdir(directory)

  return entries
    .filter((entry) => {
      const rest = entry.slice(stem.length)
      return (
        entry.startsWith(`${stem}.`)
        && SIDECAR_EXTENSIONS.some((extension) => rest.toLowerCase().endsWith(extension))
      )
    })
    .map((entry) => join(directory, entry))
}
