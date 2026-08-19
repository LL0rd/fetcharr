import { isLogLevel, logFilePath, readLogEntries } from '@fetcharr/shared'

/**
 * Tail über <CONFIG_DIR>/logs/fetcharr.log. `level` filtert nach Mindest-Level:
 * `warn` liefert warn und error.
 */
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 2000

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const level = query.level

  if (level !== undefined && level !== '' && !isLogLevel(level)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'level must be one of debug, info, warn, error',
    })
  }

  const entries = readLogEntries({
    limit: parseLimit(query.limit),
    level: isLogLevel(level) ? level : undefined,
  })

  return { entries, total: entries.length, file: logFilePath() }
})

function parseLimit(value: unknown): number {
  const limit = Number(value)
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT

  return Math.min(Math.floor(limit), MAX_LIMIT)
}
