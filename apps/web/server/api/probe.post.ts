import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Probe ist read-only und kurzlebig, darf also im Web-Prozess laufen. */
const TIMEOUT_MS = 20_000
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024

export interface ProbeResult {
  url: string
  id: string | null
  title: string | null
  uploader: string | null
  duration: number | null
  thumbnail: string | null
  isPlaylist: boolean
  entryCount: number | null
  /** yt-dlp: 'is_live' | 'was_live' | 'post_live' | 'not_live' — null wenn unbekannt. */
  liveStatus: string | null
  isLive: boolean
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url) throw createError({ statusCode: 400, statusMessage: 'url is required' })

  return await probeUrl(url)
})

/**
 * Fragt yt-dlp nach den Metadaten einer URL. Das Binary beschafft allein der
 * Worker — fehlt es noch, ist das kein Fehler des Aufrufers, sondern 503.
 */
export async function probeUrl(url: string): Promise<ProbeResult> {
  const binary = ytdlpPath()
  if (!existsSync(binary)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Worker not ready — yt-dlp binary missing',
    })
  }

  let stdout: string
  try {
    ;({ stdout } = await run(binary, ['-J', '--flat-playlist', url], {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    }))
  }
  catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Could not read metadata for this url',
      data: { stderr: stderrOf(error) },
    })
  }

  try {
    return toProbeResult(url, JSON.parse(stdout))
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: 'yt-dlp returned no usable metadata' })
  }
}

export function ytdlpPath(): string {
  return join(process.env.CONFIG_DIR ?? './data/config', 'bin', 'yt-dlp')
}

export function toProbeResult(url: string, info: Record<string, any>): ProbeResult {
  const entries = Array.isArray(info.entries) ? info.entries : null
  const isPlaylist = info._type === 'playlist' || entries !== null
  const liveStatus = str(info.live_status)

  return {
    // `is_live` fehlt manchen Extractoren; dann entscheidet live_status.
    liveStatus,
    isLive: info.is_live === true || liveStatus === 'is_live',
    url,
    id: str(info.id),
    title: str(info.title),
    // Bei Playlists steht der Kanal je nach Extractor in uploader oder channel.
    uploader: str(info.uploader) ?? str(info.channel) ?? str(info.playlist_uploader),
    duration: typeof info.duration === 'number' ? info.duration : null,
    thumbnail: str(info.thumbnail) ?? firstThumbnail(info),
    isPlaylist,
    entryCount: entries ? entries.length : null,
  }
}

function firstThumbnail(info: Record<string, any>): string | null {
  const list = Array.isArray(info.thumbnails) ? info.thumbnails : []
  const last = list[list.length - 1]
  return last && typeof last.url === 'string' ? last.url : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function stderrOf(error: unknown): string {
  const value = (error as { stderr?: unknown; message?: unknown })?.stderr
  if (typeof value === 'string' && value.trim()) return value.trim()
  return String((error as { message?: unknown })?.message ?? error)
}
