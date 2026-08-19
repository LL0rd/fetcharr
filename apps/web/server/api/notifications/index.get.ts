import {
  listNotifications,
  NOTIFICATIONS_DEFAULT_LIMIT,
  NOTIFICATIONS_MAX_LIMIT,
} from '@fetcharr/db'

/** Liste fürs Notification-Center; `unread` trägt den Zähler an der Glocke. */
export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, unknown>

  const db = await useDb()
  return listNotifications(db, {
    unreadOnly: flag(query.unread),
    limit: parseInteger(query.limit, NOTIFICATIONS_DEFAULT_LIMIT, 1, NOTIFICATIONS_MAX_LIMIT),
    offset: parseInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  })
})

function flag(value: unknown): boolean {
  return value === true || value === '' || value === '1' || value === 'true'
}

function parseInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'string' || !value.trim()) return fallback

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min) {
    throw createError({ statusCode: 400, statusMessage: `Invalid numeric query parameter: ${value}` })
  }
  return Math.min(parsed, max)
}
