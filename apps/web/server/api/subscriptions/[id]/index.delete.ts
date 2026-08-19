import { deleteSubscription } from '@fetcharr/db'
import type { Db } from '@fetcharr/db'

import { removeMediaFiles } from '../../../utils/media.ts'
import { requireSubscription } from '../index.get.ts'

interface FileRow {
  uid: string
  path: string
  thumbnail_path: string | null
}

/**
 * Löscht ein Abo. `?deleteFiles=true` nimmt die heruntergeladenen Dateien mit —
 * sonst bleiben sie in der Bibliothek und verlieren nur ihre Abo-Zuordnung.
 * Die Archiv-Einträge hängen an der id und fallen im Repository ohnehin weg.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const deleteFiles = parseDeleteFiles((getQuery(event) as Record<string, unknown>).deleteFiles)
  const db = await useDb()

  requireSubscription(db, id)
  const deletedFiles = deleteFiles ? await removeSubscriptionFiles(db, id) : detachFiles(db, id)

  deleteSubscription(db, id)

  return { deleted: true, id, deletedFiles }
})

async function removeSubscriptionFiles(db: Db, id: string): Promise<number> {
  const rows = db.$client
    .prepare('SELECT uid, path, thumbnail_path FROM files WHERE sub_id = ?')
    .all(id) as unknown as FileRow[]

  for (const row of rows) {
    await removeMediaFiles(row.path, row.thumbnail_path)
  }
  db.$client.prepare('DELETE FROM files WHERE sub_id = ?').run(id)

  return rows.length
}

function detachFiles(db: Db, id: string): number {
  db.$client.prepare('UPDATE files SET sub_id = NULL WHERE sub_id = ?').run(id)
  return 0
}

function parseDeleteFiles(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (value === 'true' || value === true || value === '1') return true
  if (value === 'false' || value === false || value === '0') return false

  throw createError({ statusCode: 400, statusMessage: 'deleteFiles must be true or false' })
}
