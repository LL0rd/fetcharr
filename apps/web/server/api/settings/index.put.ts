import { SettingsPatchSchema } from '@fetcharr/shared'

import { readSettings, writeSettings } from './index.get.ts'

/**
 * Teil-Update. Validiert wird mit dem Schema aus @fetcharr/shared — dasselbe
 * Vokabular, das der Worker liest. Unbekannte Keys sind ein 400, sonst
 * verschwände ein Tippfehler still in der Tabelle.
 */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, statusMessage: 'A settings object is required' })
  }

  const parsed = SettingsPatchSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid settings',
      data: { issues: parsed.error.issues },
    })
  }
  if (!Object.keys(parsed.data).length) {
    throw createError({ statusCode: 400, statusMessage: 'No known setting to update' })
  }

  const db = await useDb()
  writeSettings(db, parsed.data)

  return { settings: readSettings(db), restartRequired: false }
})
