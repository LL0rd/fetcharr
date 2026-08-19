import { vi } from 'vitest'

import { createDb } from '@fetcharr/db'
import type { Db } from '@fetcharr/db'

/**
 * Nitro liefert `defineEventHandler` & Co. per Auto-Import. Für Handler-Tests
 * stellen wir die gleichen Namen als Globals bereit und rufen die Handler dann
 * direkt mit einem minimalen Event auf — ohne laufenden Server.
 */
export interface TestEvent {
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, string>
  statusCode?: number
}

export interface HttpError extends Error {
  statusCode: number
  statusMessage: string
  data?: unknown
}

export function setupNitroGlobals(): { db: Db } {
  const db = createDb(':memory:')

  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('readBody', async (event: TestEvent) => event.body)
  vi.stubGlobal('getRouterParam', (event: TestEvent, name: string) => event.params?.[name])
  vi.stubGlobal('getQuery', (event: TestEvent) => event.query ?? {})
  vi.stubGlobal('setResponseStatus', (event: TestEvent, code: number) => {
    event.statusCode = code
  })
  vi.stubGlobal('useDb', async () => db)
  vi.stubGlobal(
    'createError',
    (options: { statusCode: number; statusMessage: string; data?: unknown }) =>
      Object.assign(new Error(options.statusMessage), options),
  )

  return { db }
}

export async function expectHttpError(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  }
  catch (error) {
    return error as HttpError
  }
  throw new Error('expected the handler to throw an http error')
}
