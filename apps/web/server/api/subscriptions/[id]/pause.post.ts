import { updateSubscription } from '@fetcharr/db'

import { requireSubscription, withNextCheck } from '../index.get.ts'

/**
 * Schaltet die Pause um. Ohne Body ist es ein Toggle, mit `{ paused }` wird der
 * gewünschte Zustand gesetzt — so bleibt der Button auch bei Doppelklick stabil.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  const db = await useDb()

  const current = requireSubscription(db, id)
  const paused = parsePaused(body.paused, !current.paused)

  return { subscription: withNextCheck(updateSubscription(db, id, { paused })!) }
})

function parsePaused(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false

  throw createError({ statusCode: 400, statusMessage: 'paused must be a boolean' })
}
