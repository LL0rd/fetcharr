import { updateSubscription } from '@fetcharr/db'
import type { UpdateSubscriptionInput } from '@fetcharr/db'

import { requireSubscription, withNextCheck } from '../index.get.ts'
import { parseSubscriptionBody } from '../index.post.ts'

/** Teil-Update aus dem Edit-Dialog: nur mitgeschickte Felder werden geschrieben. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  const db = await useDb()

  requireSubscription(db, id)
  const patch = parseSubscriptionBody(body, 'patch') as UpdateSubscriptionInput

  return { subscription: withNextCheck(updateSubscription(db, id, patch)!) }
})
