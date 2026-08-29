import { rename, rm, stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'

import type { Db } from '@fetcharr/db'
import type { JobOptions, MediaKind } from '@fetcharr/shared'
import { execa } from 'execa'

import { writeNfoFile } from './nfo.ts'
import { getSetting } from './store.ts'

/**
 * Nachbearbeitung einer fertig heruntergeladenen Datei: NFO schreiben, webp-Thumbnails
 * in das von Jellyfin/Plex gelesene jpg wandeln und gesetzte Crop-Marken ausführen.
 * Jeder Schritt ist optional und scheitert folgenlos — ein misslungenes Sidecar darf
 * einen erfolgreichen Download nie zu einem Fehler machen.
 */

export interface PostProcessInput {
  /** Absoluter Pfad der Mediendatei im Zielbaum. */
  mediaPath: string
  /** Default `video`; `subtitle` überspringt NFO und Schnitt. */
  type?: MediaKind
  thumbnailPath: string | null
  info: Record<string, unknown> | null
  options: Pick<JobOptions, 'cropStart' | 'cropEnd'>
  durationSec: number | null
  sizeBytes?: number | null
}

export interface PostProcessResult {
  mediaPath: string
  thumbnailPath: string | null
  durationSec: number | null
  sizeBytes: number | null
  nfoPath: string | null
}

export interface PostProcessDeps {
  writeNfo: boolean
  writeThumbnails: boolean
  /** Default: `ffmpeg` aus dem PATH bzw. `FFMPEG_PATH`. */
  ffmpeg?: string
  env?: Record<string, string>
  log?: (message: string) => void
}

export type PostProcessFn = (input: PostProcessInput) => Promise<PostProcessResult>

export function postProcessSettings(db: Db): { writeNfo: boolean; writeThumbnails: boolean } {
  return {
    writeNfo: boolSetting(db, 'write_nfo'),
    writeThumbnails: boolSetting(db, 'write_thumbnails'),
  }
}

export async function postProcess(
  input: PostProcessInput,
  deps: PostProcessDeps,
): Promise<PostProcessResult> {
  const log = deps.log ?? (() => {})
  const result: PostProcessResult = {
    mediaPath: input.mediaPath,
    thumbnailPath: input.thumbnailPath,
    durationSec: input.durationSec,
    sizeBytes: input.sizeBytes ?? null,
    nfoPath: null,
  }

  // Eine Untertitelspur ist kein Mediathek-Eintrag für Jellyfin/Plex und lässt sich
  // auch nicht schneiden — NFO und Crop bleiben hier außen vor.
  const subtitleOnly = input.type === 'subtitle'

  if (deps.writeNfo && input.info && !subtitleOnly) {
    try {
      result.nfoPath = await writeNfoFile(input.mediaPath, input.info)
    } catch (error) {
      log(`nfo failed for ${input.mediaPath}: ${message(error)}`)
    }
  }

  if (deps.writeThumbnails && result.thumbnailPath) {
    result.thumbnailPath = await convertThumbnail(result.thumbnailPath, deps, log)
  }

  const cropped = subtitleOnly ? null : await crop(input, deps, log)
  if (cropped) {
    result.durationSec = cropped.durationSec
    result.sizeBytes = cropped.sizeBytes
  }

  return result
}

/** Jellyfin/Plex lesen webp-Poster nicht zuverlässig — daher einmal durch ffmpeg. */
async function convertThumbnail(
  thumbnailPath: string,
  deps: PostProcessDeps,
  log: (message: string) => void,
): Promise<string> {
  if (extname(thumbnailPath).toLowerCase() !== '.webp') return thumbnailPath

  const target = `${thumbnailPath.slice(0, -'.webp'.length)}.jpg`
  try {
    await ffmpeg(deps, ['-i', thumbnailPath, target])
    await rm(thumbnailPath, { force: true })
    return target
  } catch (error) {
    log(`thumbnail conversion failed for ${thumbnailPath}: ${message(error)}`)
    await rm(target, { force: true })
    return thumbnailPath
  }
}

/**
 * Schneidet ohne Re-Encode (`-c copy`): die Marken landen als Input-Optionen vor `-i`,
 * damit sie sich beide auf die Zeitachse der Quelle beziehen.
 */
async function crop(
  input: PostProcessInput,
  deps: PostProcessDeps,
  log: (message: string) => void,
): Promise<{ durationSec: number | null; sizeBytes: number | null } | null> {
  const { cropStart, cropEnd } = input.options
  if (!cropStart && !cropEnd) return null

  const extension = extname(input.mediaPath)
  const target = join(
    dirname(input.mediaPath),
    `${baseName(input.mediaPath)}.crop${extension || '.mkv'}`,
  )

  const args = [
    ...(cropStart ? ['-ss', cropStart] : []),
    ...(cropEnd ? ['-to', cropEnd] : []),
    '-i',
    input.mediaPath,
    '-c',
    'copy',
    target,
  ]

  try {
    await ffmpeg(deps, args)
    await rename(target, input.mediaPath)
  } catch (error) {
    log(`crop failed for ${input.mediaPath}: ${message(error)}`)
    await rm(target, { force: true })
    return null
  }

  return {
    durationSec: croppedDuration(input.durationSec, cropStart, cropEnd),
    sizeBytes: await fileSize(input.mediaPath),
  }
}

function croppedDuration(
  original: number | null,
  cropStart: string | undefined,
  cropEnd: string | undefined,
): number | null {
  const start = seconds(cropStart) ?? 0
  const end = seconds(cropEnd)

  if (end !== null) return Math.max(0, end - start)
  if (original === null) return null
  return Math.max(0, original - start)
}

/** HH:MM:SS → Sekunden. */
function seconds(timestamp: string | undefined): number | null {
  if (!timestamp) return null
  const parts = timestamp.split(':').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
}

async function ffmpeg(deps: PostProcessDeps, args: string[]): Promise<void> {
  const binary = deps.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg'
  await execa(binary, ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    env: deps.env,
  })
}

function baseName(path: string): string {
  const name = path.slice(dirname(path).length + 1)
  const ext = extname(name)
  return ext ? name.slice(0, -ext.length) : name
}

async function fileSize(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
}

function boolSetting(db: Db, key: string): boolean {
  const value = getSetting(db, key)
  if (value === undefined || value === null) return true
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return String(value).toLowerCase() !== 'false' && String(value) !== '0'
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
