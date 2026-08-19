import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { extname, join, posix, resolve, sep } from 'node:path'

import type { MediaType } from '@fetcharr/db'
import { execa } from 'execa'

/**
 * Dateisystem-Handgriffe der Wartungs-Tasks. Bibliothekspfade sind relativ zu
 * DOWNLOADS_DIR und werden hier — und nur hier — zu absoluten aufgelöst.
 */

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.flv', '.ts']
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.opus', '.ogg', '.oga', '.flac', '.wav', '.aac']
const THUMBNAIL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

/** Sidecars, die zusammen mit der Mediendatei verschwinden sollen. */
const SIDECAR_SUFFIXES = ['.info.json', '.nfo', '.description', '.annotations.xml']

export function mediaTypeOf(path: string): MediaType | null {
  const extension = extname(path).toLowerCase()
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video'
  if (AUDIO_EXTENSIONS.includes(extension)) return 'audio'
  return null
}

export function absolutePath(downloadsDir: string, libraryPath: string): string {
  return resolve(downloadsDir, libraryPath)
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Alle Mediendateien unterhalb von `root`, als Pfade relativ zu `root` mit `/` als Trenner. */
export async function scanMediaFiles(root: string, prefix = ''): Promise<string[]> {
  let entries
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true })
  } catch {
    return []
  }

  const found: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const relative = prefix ? posix.join(prefix, entry.name) : entry.name
    if (entry.isDirectory()) found.push(...(await scanMediaFiles(root, relative)))
    else if (mediaTypeOf(entry.name)) found.push(relative)
  }

  return found
}

export function withoutExtension(path: string): string {
  const extension = extname(path)
  return extension ? path.slice(0, -extension.length) : path
}

/** Der `.info.json`-Sidecar von yt-dlp, falls er neben der Datei liegt. */
export async function readInfoJson(mediaPath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(`${withoutExtension(mediaPath)}.info.json`, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function findThumbnail(mediaPath: string): Promise<string | null> {
  const base = withoutExtension(mediaPath)
  for (const extension of THUMBNAIL_EXTENSIONS) {
    if (await exists(`${base}${extension}`)) return `${base}${extension}`
  }
  return null
}

export interface ProbeResult {
  durationSec: number | null
}

export type ProbeFn = (path: string) => Promise<ProbeResult>

/** Dauer über ffprobe; scheitert die Sonde, wird die Datei trotzdem importiert. */
export async function probeMedia(path: string): Promise<ProbeResult> {
  const binary = process.env.FFPROBE_PATH ?? 'ffprobe'
  try {
    const { stdout } = await execa(binary, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ])
    const duration = Number.parseFloat(stdout.trim())
    return { durationSec: Number.isFinite(duration) ? duration : null }
  } catch {
    return { durationSec: null }
  }
}

export async function fileSize(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
}

/** Löscht Mediendatei, Sidecars und Thumbnail; fehlende Dateien stören nicht. */
export async function removeMediaFile(
  mediaPath: string,
  thumbnailPath?: string | null,
): Promise<void> {
  const base = withoutExtension(mediaPath)
  await rm(mediaPath, { force: true })
  for (const suffix of SIDECAR_SUFFIXES) await rm(`${base}${suffix}`, { force: true })
  if (thumbnailPath) await rm(thumbnailPath, { force: true })
}

/** Bibliothekspfad einer Datei: relativ, solange sie unterhalb von DOWNLOADS_DIR liegt. */
export function libraryPath(downloadsDir: string, absolute: string): string {
  const root = resolve(downloadsDir) + sep
  const full = resolve(absolute)
  return full.startsWith(root) ? full.slice(root.length).split(sep).join('/') : full
}
