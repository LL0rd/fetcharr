import { defineEventHandler } from 'h3'

import { hasAdmin } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { isSessionAuthenticated } from '../../utils/session'

/** Tells the login screen whether it has to run first-run setup or a login. */
export default defineEventHandler(async (event) => {
  const db = await useDb()
  return {
    hasAdmin: hasAdmin(db),
    authenticated: await isSessionAuthenticated(event),
  }
})
