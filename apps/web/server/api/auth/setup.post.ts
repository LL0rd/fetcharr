import { createError, defineEventHandler, readBody } from 'h3'

import { AuthError, createAdmin } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { startSession } from '../../utils/session'

/** First-run setup: creates the single admin and hands out the api key once. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: string }>(event)
  const db = await useDb()

  try {
    const admin = await createAdmin(db, body?.password ?? '')
    await startSession(event)
    return { apiKey: admin.apiKey }
  }
  catch (error) {
    if (error instanceof AuthError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
})
