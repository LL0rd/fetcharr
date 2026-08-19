import { writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'

/**
 * NFO-Sidecars im `<movie>`-Schema von Kodi/Jellyfin. Beide Server lesen die Datei
 * bevorzugt vor eigenen Scrapern — damit tragen YouTube-Downloads in der Mediathek
 * Titel, Kanal und Datum statt eines geratenen Kinofilms.
 */

interface NfoElement {
  tag: string
  value: string
  attributes?: Record<string, string>
}

export function buildNfo(info: Record<string, unknown>): string {
  const elements: NfoElement[] = []

  push(elements, 'title', str(info.title))
  push(elements, 'plot', str(info.description))
  push(elements, 'studio', str(info.uploader) ?? str(info.channel) ?? str(info.uploader_id))

  const premiered = isoDate(str(info.upload_date))
  push(elements, 'premiered', premiered)
  push(elements, 'year', premiered?.slice(0, 4) ?? null)
  push(elements, 'runtime', runtimeMinutes(info.duration))

  for (const genre of categories(info.categories)) push(elements, 'genre', genre)

  const id = str(info.id)
  if (id) {
    elements.push({
      tag: 'uniqueid',
      value: id,
      attributes: { type: extractorKey(info), default: 'true' },
    })
  }

  push(elements, 'source', str(info.webpage_url) ?? str(info.original_url))

  const body = elements.map(render).join('\n')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<movie>\n${body}\n</movie>\n`
}

/** Schreibt `<basename>.nfo` neben die Mediendatei und liefert den Pfad zurück. */
export async function writeNfoFile(
  mediaPath: string,
  info: Record<string, unknown>,
): Promise<string> {
  const path = nfoPathFor(mediaPath)
  await writeFile(path, buildNfo(info), 'utf8')
  return path
}

export function nfoPathFor(mediaPath: string): string {
  return join(dirname(mediaPath), `${basename(mediaPath)}.nfo`)
}

function basename(path: string): string {
  const name = path.slice(dirname(path).length + 1)
  const ext = extname(name)
  return ext ? name.slice(0, -ext.length) : name
}

function push(elements: NfoElement[], tag: string, value: string | null): void {
  if (value) elements.push({ tag, value })
}

function render({ tag, value, attributes }: NfoElement): string {
  const attrs = Object.entries(attributes ?? {})
    .map(([key, attribute]) => ` ${key}="${escapeXml(attribute)}"`)
    .join('')
  return `  <${tag}${attrs}>${escapeXml(value)}</${tag}>`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** yt-dlp liefert `upload_date` als YYYYMMDD; Kodi erwartet YYYY-MM-DD. */
function isoDate(value: string | null): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function runtimeMinutes(duration: unknown): string | null {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return null
  return String(Math.max(1, Math.round(duration / 60)))
}

function categories(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

function extractorKey(info: Record<string, unknown>): string {
  const extractor = str(info.extractor_key) ?? str(info.extractor)
  return extractor ? extractor.toLowerCase() : 'youtube'
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}
