import { customAlphabet } from 'nanoid'

import { readApiKey } from '../index.get.ts'

/**
 * Ersetzt den API-Key. Alphabet und Länge stammen aus server/utils/auth.ts —
 * dort erzeugt `createAdmin` den ersten Schlüssel; hier steht nur das Update,
 * damit die Auth-Utils weiter ausschließlich Anmeldung und Prüfung kennen.
 */
const API_KEY_LENGTH = 32
const newApiKey = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  API_KEY_LENGTH,
)

export default defineEventHandler(async (event) => {
  const db = await useDb()
  if (!readApiKey(db)) {
    throw createError({ statusCode: 409, statusMessage: 'No admin account yet' })
  }

  const apiKey = newApiKey()
  db.$client.prepare('UPDATE auth SET api_key = ? WHERE id = 1').run(apiKey)

  return { apiKey }
})
