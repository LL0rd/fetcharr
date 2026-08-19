import { getSubscription, requestCheck } from '@fetcharr/db'

import { requireSubscription, withNextCheck } from '../index.get.ts'

/**
 * „Check now": setzt nur das Flag `check_requested`. Der Scheduler im Worker
 * holt es ab und startet den Lauf — die Web-App fasst yt-dlp nie selbst an.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const db = await useDb()

  const current = requireSubscription(db, id)
  if (current.checking) {
    throw createError({ statusCode: 409, statusMessage: 'This subscription is already checking' })
  }

  requestCheck(db, id)

  return { subscription: withNextCheck(getSubscription(db, id)!) }
})
