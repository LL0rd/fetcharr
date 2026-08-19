import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

import { getFile } from '@fetcharr/db'

import { contentTypeFor, parseRange, resolveMediaPath } from '../../utils/media.ts'

/**
 * Medien-Auslieferung für den Player. Ohne Range-Header geht die Datei komplett
 * raus (200), mit gültigem Range der Ausschnitt (206) — Springen im Video
 * funktioniert nur, wenn `Accept-Ranges` immer mitgeht.
 */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const db = await useDb()

  const file = getFile(db, uid)
  if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found' })

  const absolute = resolveMediaPath(file.path)
  const size = await fileSize(absolute)

  setResponseHeader(event, 'Accept-Ranges', 'bytes')
  setResponseHeader(event, 'Content-Type', contentTypeFor(absolute))

  const range = parseRange(getHeader(event, 'range'), size)

  if (range === 'invalid') {
    setResponseHeader(event, 'Content-Range', `bytes */${size}`)
    throw createError({ statusCode: 416, statusMessage: 'Requested range not satisfiable' })
  }

  if (!range) {
    setResponseHeader(event, 'Content-Length', size)
    return sendStream(event, createReadStream(absolute))
  }

  setResponseStatus(event, 206)
  setResponseHeader(event, 'Content-Range', `bytes ${range.start}-${range.end}/${size}`)
  setResponseHeader(event, 'Content-Length', range.end - range.start + 1)

  return sendStream(event, createReadStream(absolute, { start: range.start, end: range.end }))
})

/** Eine DB-Zeile ohne Datei ist für den Client dasselbe wie ein unbekanntes uid. */
async function fileSize(absolute: string): Promise<number> {
  try {
    const stats = await stat(absolute)
    if (stats.isFile()) return stats.size
  }
  catch {
    // fällt unten in den 404
  }
  throw createError({ statusCode: 404, statusMessage: 'Media file is missing on disk' })
}
