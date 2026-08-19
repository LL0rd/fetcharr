import { registerView } from '@fetcharr/db'

/**
 * Meldet einen Abruf. Der Player ruft den Endpoint einmal beim Start (View zählt)
 * und danach periodisch nur mit Position (`countView: false`).
 */
export default defineEventHandler(async (event) => {
  const uid = getRouterParam(event, 'uid') ?? ''
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>

  if (body.countView !== undefined && typeof body.countView !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'countView must be a boolean' })
  }

  const db = await useDb()
  const file = registerView(db, uid, {
    positionSec: parsePosition(body.positionSec),
    countView: body.countView as boolean | undefined,
  })

  if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found' })

  return { file }
})

/** `undefined` lässt die gespeicherte Position stehen, `null` löscht sie. */
function parsePosition(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw createError({ statusCode: 400, statusMessage: 'positionSec must be a positive number' })
  }
  return value
}
