import { removeArchiveEntry } from '@fetcharr/db'

/**
 * Entfernt einen Archiv-Eintrag. Damit gilt das Medium wieder als ungesehen und
 * darf beim nächsten Subscription-Check erneut geladen werden.
 */
export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, 'id') ?? ''
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 1) {
    throw createError({ statusCode: 400, statusMessage: 'id must be a positive integer' })
  }

  const db = await useDb()
  if (!removeArchiveEntry(db, id)) {
    throw createError({ statusCode: 404, statusMessage: 'Archive entry not found' })
  }

  return { deleted: id }
})
