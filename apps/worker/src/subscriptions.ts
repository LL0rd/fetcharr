import {
  createSubscriptionJob,
  hasArchiveEntry,
  type Db,
  type Job,
  type Subscription,
} from '@fetcharr/db'
import type { JobOptions } from '@fetcharr/shared'
import { execa } from 'execa'

import { notifySubscriptionFound } from './notify.ts'
import { ytdlpPath } from './ytdlp.ts'

/**
 * Subscription-Check: `yt-dlp -J --flat-playlist` liefert die Einträge einer
 * Kanal-/Playlist-URL, der Rest ist Diff gegen das Archiv plus Filter. Ins
 * Archiv wandert ein Eintrag erst nach erfolgreichem Download (siehe loop.ts) —
 * ein abgebrochener Check darf nichts überspringen lassen.
 */

export interface PlaylistEntry {
  id?: string | null
  title?: string | null
  url?: string | null
  webpage_url?: string | null
  timestamp?: number | null
  upload_date?: string | null
  live_status?: string | null
  ie_key?: string | null
  extractor?: string | null
}

export type FetchEntriesFn = (sub: Subscription) => Promise<PlaylistEntry[]>

export interface CheckSubscriptionOptions {
  db: Db
  sub: Subscription
  /** Injizierbar für Tests; per Default der echte yt-dlp-Aufruf. */
  fetchEntries?: FetchEntriesFn
  now?: () => number
  log?: (message: string) => void
}

export interface CheckSubscriptionResult {
  found: number
  created: number
  skipped: number
  jobs: Job[]
  error?: string
}

/** Ein Kanalabruf darf dauern, aber nicht ewig hängen. */
export const FETCH_TIMEOUT_MS = 20 * 60 * 1000

/** „Frisch" im Sinne von redownload_fresh_uploads. */
export const FRESH_WINDOW_MS = 48 * 3600 * 1000

const LIVE_STATUS_RUNNING = new Set(['is_live', 'is_upcoming'])
const QUALITIES = new Set<JobOptions['format']>(['best', '1080p', '720p'])

export async function checkSubscription(
  options: CheckSubscriptionOptions,
): Promise<CheckSubscriptionResult> {
  const { db, sub } = options
  const now = options.now ?? Date.now
  const log = options.log ?? (() => {})
  const fetch = options.fetchEntries ?? fetchPlaylistEntries

  let entries: PlaylistEntry[]
  try {
    entries = await fetch(sub)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`subscription ${sub.name}: check failed: ${message}`)
    return { found: 0, created: 0, skipped: 0, jobs: [], error: message }
  }

  const titleFilter = compileRegex(sub.titleRegex, (message) =>
    log(`subscription ${sub.name}: ${message}`),
  )
  const jobs: Job[] = []
  let skipped = 0

  for (const entry of entries) {
    const mediaId = entry.id?.trim()
    if (!mediaId) continue

    const live = LIVE_STATUS_RUNNING.has(entry.live_status ?? '')
    if (live && !sub.recordLivestreams) {
      skipped += 1
      continue
    }

    if (titleFilter && !titleFilter.test(entry.title ?? '')) {
      skipped += 1
      continue
    }

    const date = entryDate(entry)
    if (sub.timerangeFrom && date && date < sub.timerangeFrom) {
      skipped += 1
      continue
    }

    const extractor = extractorFor(sub, entry)
    if (hasArchiveEntry(db, { extractor, mediaId, subId: sub.id }) && !isFresh(entry, sub, now())) {
      skipped += 1
      continue
    }

    jobs.push(
      createSubscriptionJob(db, {
        url: entryUrl(entry, extractor, mediaId),
        type: sub.mediaType,
        options: jobOptions(sub, live),
        subId: sub.id,
        priority: 2,
        title: entry.title ?? null,
      }),
    )
  }

  log(`subscription ${sub.name}: ${entries.length} entries, ${jobs.length} new`)

  if (jobs.length) {
    // Der Fund selbst ist die Nachricht — die Downloads melden sich später einzeln.
    void notifySubscriptionFound(db, { name: sub.name, count: jobs.length }, { log }).catch(
      (error: unknown) => log(`notification failed: ${String(error)}`),
    )
  }

  return { found: entries.length, created: jobs.length, skipped, jobs }
}

/** Ruft yt-dlp für die Subscription-URL auf; ein Fehler wird zum abgelehnten Promise. */
export async function fetchPlaylistEntries(
  sub: Subscription,
  options: { binary?: string; cookiesPath?: string | null; timeoutMs?: number } = {},
): Promise<PlaylistEntry[]> {
  const args = ['-J', '--flat-playlist', '--ignore-errors', '--no-warnings']
  if (options.cookiesPath) args.push('--cookies', options.cookiesPath)

  const { stdout, stderr, exitCode } = await execa(options.binary ?? ytdlpPath(), [...args, sub.url], {
    timeout: options.timeoutMs ?? FETCH_TIMEOUT_MS,
    reject: false,
    maxBuffer: 256 * 1024 * 1024,
  })

  const entries = parsePlaylistJson(stdout)
  if (!entries.length && exitCode !== 0) {
    throw new Error(`yt-dlp exited with ${String(exitCode)}: ${stderr.slice(-1000)}`)
  }
  return entries
}

/** Nimmt die `-J`-Ausgabe entgegen: Playlist, verschachtelte Playlist oder Einzelvideo. */
export function parsePlaylistJson(stdout: string): PlaylistEntry[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }

  return flatten(parsed)
}

export function extractorFor(sub: Subscription, entry: PlaylistEntry): string {
  const raw = entry.ie_key ?? entry.extractor
  if (raw?.trim()) return raw.trim().toLowerCase()
  return extractorFromUrl(entry.webpage_url ?? entry.url ?? sub.url)
}

export function extractorFromUrl(url: string): string {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'generic'
  }

  if (host.endsWith('youtube.com') || host.endsWith('youtu.be')) return 'youtube'

  const labels = host.replace(/^www\./, '').split('.')
  return labels.length > 1 ? labels[labels.length - 2]! : (labels[0] ?? 'generic')
}

function flatten(value: unknown): PlaylistEntry[] {
  if (!value || typeof value !== 'object') return []

  const node = value as Record<string, unknown>
  if (Array.isArray(node.entries)) return node.entries.flatMap((child) => flatten(child))
  if (typeof node.id === 'string') return [node as PlaylistEntry]
  return []
}

function jobOptions(sub: Subscription, live: boolean): JobOptions {
  const customArgs = [sub.customArgs?.trim(), live ? '--live-from-start' : null]
    .filter(Boolean)
    .join(' ')

  return {
    format: mediaFormat(sub),
    sponsorblock: sub.sponsorblock,
    ...(customArgs ? { customArgs } : {}),
    ...(sub.customOutput ? { outputTemplate: sub.customOutput } : {}),
    targetFolder: `subscriptions/${sanitizeFolder(sub.name)}`,
  }
}

/** Audio- und Untertitel-Abos ignorieren die Qualitätsstufe — die gibt es dort nicht. */
function mediaFormat(sub: Subscription): JobOptions['format'] {
  if (sub.mediaType === 'audio') return 'audio'
  if (sub.mediaType === 'subtitle') return 'subtitle'
  return quality(sub.maxQuality)
}

function quality(maxQuality: string | null): JobOptions['format'] {
  const value = maxQuality as JobOptions['format'] | null
  return value && QUALITIES.has(value) ? value : 'best'
}

/** Der Name landet im Dateipfad — Pfadtrenner und Windows-Sonderzeichen müssen raus. */
function sanitizeFolder(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, '_').trim()
  return cleaned || 'subscription'
}

function entryUrl(entry: PlaylistEntry, extractor: string, mediaId: string): string {
  const url = entry.webpage_url ?? entry.url
  if (url?.trim()) return url.trim()
  if (extractor === 'youtube') return `https://www.youtube.com/watch?v=${mediaId}`
  return mediaId
}

/** YYYYMMDD, damit sich der Vergleich mit `timerangeFrom` auf Strings beschränkt. */
function entryDate(entry: PlaylistEntry): string | null {
  if (typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)) {
    return new Date(entry.timestamp * 1000).toISOString().slice(0, 10).replace(/-/g, '')
  }
  const uploadDate = entry.upload_date?.trim()
  return uploadDate && /^\d{8}$/.test(uploadDate) ? uploadDate : null
}

function isFresh(entry: PlaylistEntry, sub: Subscription, now: number): boolean {
  if (!sub.redownloadFreshUploads) return false

  const published = publishedAt(entry)
  return published != null && now - published <= FRESH_WINDOW_MS
}

function publishedAt(entry: PlaylistEntry): number | null {
  if (typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)) {
    return entry.timestamp * 1000
  }
  const uploadDate = entry.upload_date?.trim()
  if (!uploadDate || !/^\d{8}$/.test(uploadDate)) return null

  const iso = `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}T00:00:00Z`
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? null : parsed
}

function compileRegex(pattern: string | null, log: (message: string) => void): RegExp | null {
  if (!pattern?.trim()) return null

  try {
    return new RegExp(pattern)
  } catch (error) {
    log(`ignoring invalid title regex: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
