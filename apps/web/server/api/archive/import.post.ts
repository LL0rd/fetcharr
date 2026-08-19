import type { H3Event } from 'h3'

import { importArchive } from '@fetcharr/db'

interface Upload {
  text: string
  subId: string | null
}

/**
 * Übernimmt eine bestehende archive.txt. Der Upload kommt aus dem Browser als
 * multipart, per Skript auch gern als `text/plain` oder JSON — alle drei Wege
 * landen im selben Parser.
 */
export default defineEventHandler(async (event) => {
  const upload = await readUpload(event)
  const parsed = countArchiveLines(upload.text)
  if (!parsed) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No archive lines found — expected "extractor id" per line',
    })
  }

  const db = await useDb()
  const imported = importArchive(db, upload.text, { subId: upload.subId })

  setResponseStatus(event, 201)
  return { parsed, imported, skipped: parsed - imported, subId: upload.subId }
})

/**
 * Zählt die verwertbaren Zeilen, damit die Antwort sagen kann, wie viele
 * Einträge schon bekannt waren. Kommentare, Leerzeilen und Dubletten innerhalb
 * der Datei zählen nicht mit — genauso sieht sie der Import.
 */
export function countArchiveLines(text: string): number {
  const seen = new Set<string>()

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const [extractor, mediaId] = line.split(/\s+/)
    if (!extractor || !mediaId) continue

    seen.add(`${extractor.toLowerCase()} ${mediaId}`)
  }

  return seen.size
}

async function readUpload(event: H3Event): Promise<Upload> {
  const contentType = getHeader(event, 'content-type') ?? ''
  const query = getQuery(event) as Record<string, unknown>
  const querySubId = text(query.subId)

  if (contentType.includes('multipart/form-data')) {
    const parts = (await readMultipartFormData(event)) ?? []
    const file = parts.find((part) => part.filename != null || part.name === 'file')
    const subId = parts.find((part) => part.name === 'subId')

    return {
      text: file ? file.data.toString('utf8') : '',
      subId: (subId ? text(subId.data.toString('utf8')) : null) ?? querySubId,
    }
  }

  if (contentType.includes('application/json')) {
    const body = (await readBody(event)) as { text?: unknown; subId?: unknown } | null
    return { text: typeof body?.text === 'string' ? body.text : '', subId: text(body?.subId) ?? querySubId }
  }

  const raw = await readRawBody(event, 'utf8')
  return { text: typeof raw === 'string' ? raw : '', subId: querySubId }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
