import { createError, defineEventHandler, getHeader, getQuery } from 'h3'

import { isValidApiKey } from '../utils/auth'
import { useDb } from '../utils/db'
import { isSessionAuthenticated } from '../utils/session'

const OPEN_PATHS = ['/api/auth/', '/api/health']

/**
 * Guards every API route except the auth endpoints and the health probe.
 * A browser authenticates with the sealed session cookie, scripts and the
 * worker with the api key (header or query parameter).
 */
export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0] ?? ''
  if (!isProtectedPath(path)) {
    return
  }

  if (await isSessionAuthenticated(event)) {
    return
  }

  const key = getHeader(event, 'x-api-key') ?? asString(getQuery(event).apiKey)
  const db = await useDb()
  if (isValidApiKey(db, key)) {
    return
  }

  throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
})

export function isProtectedPath(path: string): boolean {
  if (!path.startsWith('/api/')) {
    return false
  }
  return !OPEN_PATHS.some(open => path === open || path.startsWith(open))
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
