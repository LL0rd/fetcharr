import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { dirname, join, posix } from 'node:path'
import type { Readable } from 'node:stream'

import {
  buildArgs,
  type ArgsPaths,
  type GlobalSettings,
  type JobOptions,
  type MediaKind,
} from '@fetcharr/shared'
import { execa, type ResultPromise } from 'execa'
import treeKill from 'tree-kill'

import { parseProgressLine, type ProgressUpdate } from './progress.ts'
import { ytdlpPath } from './ytdlp.ts'

export interface RunnerJob {
  uid: string
  url: string
  type: MediaKind
  options: JobOptions
}

export interface InfoResult {
  title: string | null
  uploader: string | null
  info: Record<string, unknown>
}

export type DownloadResult =
  | {
      status: 'finished'
      /** Pfad der Mediendatei im endgültigen Zielbaum. */
      path: string
      thumbnailPath: string | null
      info: Record<string, unknown> | null
      sizeBytes: number | null
    }
  | { status: 'failed'; stderr: string; exitCode: number | null }
  | { status: 'cancelled'; stderr: string }

export interface RunDownloadOptions {
  job: RunnerJob
  downloadsDir: string
  /** Default: das vom Worker verwaltete Binary unter <CONFIG_DIR>/bin/yt-dlp. */
  binary?: string
  settings?: GlobalSettings
  cookiesPath?: ArgsPaths['cookiesPath']
  env?: Record<string, string>
  onInfo?: (info: InfoResult) => void
  onProgress?: (update: ProgressUpdate) => void
}

export interface DownloadHandle {
  readonly pid: number | undefined
  abort(): void
  readonly result: Promise<DownloadResult>
}

const THUMBNAIL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

/**
 * Was yt-dlp als Untertitel ablegt — `--convert-subs` liefert eines der ersten
 * drei, die übrigen kommen durch, wenn die Konvertierung nicht greift.
 */
const SUBTITLE_EXTENSIONS = [
  '.srt',
  '.vtt',
  '.ass',
  '.ssa',
  '.lrc',
  '.ttml',
  '.srv1',
  '.srv2',
  '.srv3',
  '.json3',
]

/**
 * Startet yt-dlp für einen Job. Geladen wird nach `<DOWNLOADS_DIR>/.tmp/<uid>/`;
 * erst nach Exit 0 wandert der komplette Baum ins Ziel — halbe Dateien tauchen
 * damit nie in der Mediathek auf.
 */
export function runDownload(options: RunDownloadOptions): DownloadHandle {
  const { job, downloadsDir } = options
  const tmpRoot = join(downloadsDir, '.tmp', job.uid)

  const args = buildArgs({ type: job.type, options: job.options }, options.settings ?? {}, {
    downloadsDir: tmpRoot,
    cookiesPath: options.cookiesPath ?? null,
  })

  const child = execa(options.binary ?? ytdlpPath(), [...args, job.url], {
    buffer: false,
    reject: false,
    env: options.env,
  })

  let aborted = false
  const stderrChunks: string[] = []

  readLines(child.stdout, (line) => {
    if (!consumeInfoLine(line, options.onInfo)) consumeProgressLine(line, options.onProgress)
  })
  readLines(child.stderr, (line) => {
    if (!consumeProgressLine(line, options.onProgress)) stderrChunks.push(line)
  })

  const result = finalize(child, tmpRoot, downloadsDir, job.type, stderrChunks, () => aborted)

  return {
    get pid() {
      return child.pid
    },
    abort() {
      aborted = true
      if (child.pid) treeKill(child.pid, 'SIGKILL')
    },
    result,
  }
}

async function finalize(
  child: ResultPromise<{ buffer: false; reject: false }>,
  tmpRoot: string,
  downloadsDir: string,
  type: MediaKind,
  stderrChunks: string[],
  wasAborted: () => boolean,
): Promise<DownloadResult> {
  try {
    const outcome = await child
    const stderr = stderrChunks.join('\n')

    if (wasAborted()) return { status: 'cancelled', stderr }
    if (outcome.exitCode !== 0) {
      return { status: 'failed', stderr, exitCode: outcome.exitCode ?? null }
    }

    return await collectAndMove(tmpRoot, downloadsDir, type)
  } catch (error) {
    if (wasAborted()) return { status: 'cancelled', stderr: stderrChunks.join('\n') }
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'failed', stderr: [...stderrChunks, message].join('\n'), exitCode: null }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true })
    await removeIfEmpty(join(downloadsDir, '.tmp'))
  }
}

/**
 * Verschiebt den Staging-Baum 1:1 ins Ziel und benennt die dabei entstandenen Rollen.
 * Bei einem Untertitel-Job gilt die Untertitelspur als Hauptdatei — mehrere Sprachen
 * landen alle im Ziel, in der Mediathek steht die alphabetisch erste.
 */
async function collectAndMove(
  tmpRoot: string,
  downloadsDir: string,
  type: MediaKind,
): Promise<DownloadResult> {
  // Sortiert, damit bei mehreren Kandidaten immer dieselbe Datei die Hauptrolle bekommt.
  const relatives = (await walk(tmpRoot)).sort()
  if (relatives.length === 0) {
    return { status: 'failed', stderr: 'yt-dlp produced no output files', exitCode: 0 }
  }

  const candidates: string[] = []
  let thumbnailPath: string | null = null
  let info: Record<string, unknown> | null = null

  for (const relative of relatives) {
    const source = join(tmpRoot, relative)
    const target = join(downloadsDir, relative)
    await mkdir(dirname(target), { recursive: true })
    await move(source, target)

    if (relative.endsWith('.info.json')) info = await readInfoFile(target)
    else if (THUMBNAIL_EXTENSIONS.some((ext) => relative.toLowerCase().endsWith(ext))) {
      thumbnailPath ??= target
    } else candidates.push(target)
  }

  const mediaPath = pickMedia(candidates, type)
  if (!mediaPath) {
    const missing = type === 'subtitle' ? 'subtitle' : 'media'
    return { status: 'failed', stderr: `yt-dlp produced no ${missing} file`, exitCode: 0 }
  }

  return {
    status: 'finished',
    path: mediaPath,
    thumbnailPath,
    info,
    sizeBytes: await fileSize(mediaPath),
  }
}

/**
 * Untertitel-Jobs brauchen wirklich eine Untertitelspur: bliebe hier irgendeine
 * andere Datei übrig, stünde in der Mediathek etwas Unabspielbares statt eines
 * ehrlichen Fehlers.
 */
function pickMedia(candidates: string[], type: MediaKind): string | null {
  if (type !== 'subtitle') return candidates[0] ?? null
  return candidates.find((path) => isSubtitle(path)) ?? null
}

function isSubtitle(path: string): boolean {
  const lower = path.toLowerCase()
  return SUBTITLE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

function readLines(stream: Readable | null | undefined, onLine: (line: string) => void): void {
  if (!stream) return
  createInterface({ input: stream, crlfDelay: Infinity }).on('line', (line) => {
    const trimmed = line.trimEnd()
    if (trimmed) onLine(trimmed)
  })
}

function consumeInfoLine(line: string, onInfo: RunDownloadOptions['onInfo']): boolean {
  if (!line.startsWith('{')) return false

  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return false
  }
  if (!parsed || typeof parsed !== 'object') return false

  const info = parsed as Record<string, unknown>
  onInfo?.({
    title: typeof info.title === 'string' ? info.title : null,
    uploader: typeof info.uploader === 'string' ? info.uploader : null,
    info,
  })
  return true
}

function consumeProgressLine(line: string, onProgress: RunDownloadOptions['onProgress']): boolean {
  const update = parseProgressLine(line)
  if (!update) return false
  onProgress?.(update)
  return true
}

/** Alle Dateien unterhalb von `root`, als POSIX-relative Pfade. */
async function walk(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true }).catch(() => [])
  const found: string[] = []

  for (const entry of entries) {
    const relative = prefix ? posix.join(prefix, entry.name) : entry.name
    if (entry.isDirectory()) found.push(...(await walk(root, relative)))
    else found.push(relative)
  }
  return found
}

/** rename schlägt über Dateisystemgrenzen hinweg fehl — dann kopieren und löschen. */
async function move(source: string, target: string): Promise<void> {
  try {
    await rename(source, target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await copyFile(source, target)
    await rm(source, { force: true })
  }
}

async function readInfoFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function fileSize(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
}

async function removeIfEmpty(dir: string): Promise<void> {
  const entries = await readdir(dir).catch(() => null)
  if (entries && entries.length === 0) await rm(dir, { recursive: true, force: true })
}
