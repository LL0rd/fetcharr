import {
  countUnreadNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from '@fetcharr/db'

interface ReadBody {
  ids?: unknown
  all?: unknown
}

/** `{ all: true }` quittiert alles, sonst zählt die Id-Liste. */
export default defineEventHandler(async (event) => {
  const body = ((await readBody(event)) ?? {}) as ReadBody
  const all = body.all === true
  const ids = all ? [] : parseIds(body.ids)

  if (!all && !ids.length) {
    throw createError({ statusCode: 400, statusMessage: 'Expected ids: number[] or all: true' })
  }

  const db = await useDb()
  const read = all ? markAllNotificationsRead(db) : markNotificationsRead(db, ids)

  return { read, unread: countUnreadNotifications(db) }
})

function parseIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []

  const ids = value.map((entry) => Number(entry))
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    throw createError({ statusCode: 400, statusMessage: 'ids must be positive integers' })
  }
  return ids
}
