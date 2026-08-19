import { exportArchive } from '@fetcharr/db'

/** Liefert das Archiv im yt-dlp-Format, direkt als archive.txt herunterladbar. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, unknown>
  const subId = typeof query.subId === 'string' && query.subId.trim() ? query.subId.trim() : null

  const db = await useDb()
  const body = exportArchive(db, { subId })

  const name = subId ? `archive-${subId}.txt` : 'archive.txt'
  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${name}"`)

  return body
})
