import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createLogger } from '@fetcharr/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>

let logs: Handler
let configDir: string
const envBackup = { config: process.env.CONFIG_DIR }

beforeEach(async () => {
  setupNitroGlobals()

  configDir = mkdtempSync(join(tmpdir(), 'fetcharr-logs-'))
  process.env.CONFIG_DIR = configDir

  logs = (await import('../server/api/logs.get.ts')).default as Handler
})

afterEach(() => {
  process.env.CONFIG_DIR = envBackup.config
})

function seedLog(): void {
  const logger = createLogger({ source: 'worker', configDir, level: 'debug' })
  logger.debug('probing url')
  logger.info('download finished', { uid: 'abc' })
  logger.warn('retrying')
  logger.error('download failed', { uid: 'def' })
}

describe('GET /api/logs', () => {
  it('is empty while nothing has been logged', async () => {
    const result = await logs({})
    expect(result.entries).toEqual([])
    expect(result.file).toBe(join(configDir, 'logs', 'fetcharr.log'))
  })

  it('returns the entries with their fields', async () => {
    seedLog()
    const result = await logs({})

    expect(result.total).toBe(4)
    expect(result.entries[1]).toMatchObject({
      level: 'info',
      source: 'worker',
      msg: 'download finished',
      uid: 'abc',
    })
  })

  it('filters by minimum level', async () => {
    seedLog()
    const result = await logs({ query: { level: 'warn' } })

    expect(result.entries.map((entry: any) => entry.msg)).toEqual(['retrying', 'download failed'])
  })

  it('tails only the requested number of lines', async () => {
    seedLog()
    const result = await logs({ query: { limit: '2' } })

    expect(result.entries.map((entry: any) => entry.msg)).toEqual(['retrying', 'download failed'])
  })

  it('rejects an unknown level', async () => {
    const error = await expectHttpError(logs({ query: { level: 'trace' } }))
    expect(error.statusCode).toBe(400)
  })

  it('treats an empty level as no filter', async () => {
    seedLog()
    expect((await logs({ query: { level: '' } })).total).toBe(4)
  })
})
