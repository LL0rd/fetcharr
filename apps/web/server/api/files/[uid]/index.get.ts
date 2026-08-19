import { getFile } from '@fetcharr/db'

/** Einzelne Bibliotheks-Datei — Grundlage der Player-Seite. */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const db = await useDb()

  const file = getFile(db, uid)
  if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found' })

  return { file }
})
