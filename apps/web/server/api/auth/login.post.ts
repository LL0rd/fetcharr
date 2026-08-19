import { createError, defineEventHandler, readBody } from 'h3'

import { verifyAdminPassword } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { startSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ password?: string }>(event)
  const db = await useDb()

  if (!await verifyAdminPassword(db, body?.password ?? '')) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid password' })
  }

  await startSession(event)
  return { ok: true }
})
