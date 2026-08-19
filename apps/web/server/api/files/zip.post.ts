import { existsSync } from 'node:fs'

import { getFilesByUids } from '@fetcharr/db'
import { ZipArchive } from 'archiver'

import { resolveMediaPath } from '../../utils/media.ts'

/**
 * Packt mehrere Bibliotheks-Dateien in ein ZIP. Der Archiv-Stream geht direkt an
 * die Antwort — nichts wird zwischengespeichert, und `store` statt `deflate`,
 * weil Medien bereits komprimiert sind.
 */
export default defineEventHandler(async (event) => {
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  const uids = parseUids(body.uids)

  const db = await useDb()
  const files = getFilesByUids(db, uids)
  const entries = files
    .map((file) => ({ absolute: resolveMediaPath(file.path), name: file.path }))
    .filter((entry) => existsSync(entry.absolute))

  if (!entries.length) {
    throw createError({ statusCode: 404, statusMessage: 'None of the requested files exist' })
  }

  const archive = new ZipArchive({ store: true })
  archive.on('error', (error) => archive.destroy(error))
  for (const entry of entries) archive.file(entry.absolute, { name: entry.name })

  setResponseHeader(event, 'Content-Type', 'application/zip')
  setResponseHeader(
    event,
    'Content-Disposition',
    `attachment; filename="fetcharr-${entries.length}-files.zip"`,
  )

  // Nicht awaiten: finalize läuft erst, während der Client den Stream liest.
  void archive.finalize()
  return sendStream(event, archive)
})

function parseUids(value: unknown): string[] {
  const uids = Array.isArray(value) ? value.filter((uid): uid is string => typeof uid === 'string') : []
  if (!uids.length) {
    throw createError({ statusCode: 400, statusMessage: 'uids must be a non-empty array' })
  }
  return uids
}
