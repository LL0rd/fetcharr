import { deleteFile, getFile } from '@fetcharr/db'

import { removeMediaFiles } from '../../../utils/media.ts'

/**
 * Löscht Datei, Sidecars und DB-Zeile. Das Query-Flag `blacklist` ist für Phase 3
 * reserviert (Archiv-Eintrag behalten, damit nichts nachlädt) und noch ohne Wirkung.
 */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const db = await useDb()

  const file = getFile(db, uid)
  if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found' })

  const removed = await removeMediaFiles(file.path, file.thumbnailPath)
  deleteFile(db, uid)

  return { deleted: true, uid, removedFiles: removed.length }
})
