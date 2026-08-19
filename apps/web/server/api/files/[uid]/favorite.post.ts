import { getFile, setFavorite } from '@fetcharr/db'

/** Setzt den Favoriten-Stern; ohne `favorite` im Body kippt der aktuelle Wert. */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  const db = await useDb()

  const current = getFile(db, uid)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'File not found' })

  if (body.favorite !== undefined && typeof body.favorite !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'favorite must be a boolean' })
  }

  const next = typeof body.favorite === 'boolean' ? body.favorite : !current.favorite
  return { file: setFavorite(db, uid, next) }
})
