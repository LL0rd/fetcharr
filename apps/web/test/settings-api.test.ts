import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SETTINGS_DEFAULTS } from '@fetcharr/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@fetcharr/db'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>

let db: Db
let handlers: Record<string, Handler>
let configDir: string
const envBackup = { config: process.env.CONFIG_DIR }

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())

  configDir = mkdtempSync(join(tmpdir(), 'fetcharr-settings-'))
  process.env.CONFIG_DIR = configDir

  handlers = {
    get: (await import('../server/api/settings/index.get.ts')).default as Handler,
    put: (await import('../server/api/settings/index.put.ts')).default as Handler,
    cookies: (await import('../server/api/settings/cookies.post.ts')).default as Handler,
    regenerate: (await import('../server/api/settings/api-key/regenerate.post.ts'))
      .default as Handler,
  }
})

afterEach(() => {
  process.env.CONFIG_DIR = envBackup.config
})

function seedAdmin(apiKey = 'key-one'): void {
  db.$client
    .prepare('INSERT INTO auth (id, password_hash, api_key, created_at) VALUES (1, ?, ?, ?)')
    .run('hash', apiKey, Math.floor(Date.now() / 1000))
}

describe('GET /api/settings', () => {
  it('answers with the defaults while nothing is stored', async () => {
    const result = await handlers.get({})
    expect(result.settings).toEqual(SETTINGS_DEFAULTS)
    expect(result.apiKey).toBeNull()
  })

  it('overlays the stored values and reports the api key', async () => {
    seedAdmin('key-two')
    await handlers.put({ body: { max_concurrent_downloads: 6, rate_limit: '4M' } })

    const result = await handlers.get({})
    expect(result.settings.max_concurrent_downloads).toBe(6)
    expect(result.settings.rate_limit).toBe('4M')
    expect(result.settings.output_template).toBe(SETTINGS_DEFAULTS.output_template)
    expect(result.apiKey).toBe('key-two')
  })

  it('falls back to the default when a stored value has the wrong type', async () => {
    db.$client
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('max_concurrent_downloads', JSON.stringify('lots'))

    const result = await handlers.get({})
    expect(result.settings.max_concurrent_downloads).toBe(
      SETTINGS_DEFAULTS.max_concurrent_downloads,
    )
  })

  it('ignores rows that are not settings, such as the worker heartbeat', async () => {
    db.$client.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('worker_heartbeat', '17')

    const result = await handlers.get({})
    expect(result.settings).toEqual(SETTINGS_DEFAULTS)
  })
})

describe('PUT /api/settings', () => {
  it('stores only the keys it was given', async () => {
    await handlers.put({ body: { write_nfo: false } })
    await handlers.put({ body: { log_level: 'debug' } })

    const { settings } = await handlers.get({})
    expect(settings.write_nfo).toBe(false)
    expect(settings.log_level).toBe('debug')
    expect(settings.write_thumbnails).toBe(true)
  })

  it('returns the full settings object after the update', async () => {
    const result = await handlers.put({ body: { output_template: '%(title)s' } })
    expect(result.settings.output_template).toBe('%(title)s')
  })

  it('rejects an unknown key with 400', async () => {
    const error = await expectHttpError(handlers.put({ body: { nonsense: true } }))
    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Invalid settings')
  })

  it('rejects a wrong type with 400', async () => {
    const error = await expectHttpError(handlers.put({ body: { max_concurrent_downloads: 'six' } }))
    expect(error.statusCode).toBe(400)
  })

  it('rejects an empty body with 400', async () => {
    const error = await expectHttpError(handlers.put({ body: {} }))
    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('No known setting to update')
  })

  it('accepts the notification channels and event types', async () => {
    await handlers.put({
      body: { ntfy_url: 'https://ntfy.sh/fetcharr', notify_types: ['download_error'] },
    })

    const { settings } = await handlers.get({})
    expect(settings.ntfy_url).toBe('https://ntfy.sh/fetcharr')
    expect(settings.notify_types).toEqual(['download_error'])
  })
})

describe('POST /api/settings/cookies', () => {
  it('writes cookies.txt into the config directory', async () => {
    const result = await handlers.cookies({ body: { text: '# Netscape HTTP Cookie File\nline' } })

    expect(result.saved).toBe(true)
    expect(result.looksLikeNetscapeFormat).toBe(true)
    expect(readFileSync(join(configDir, 'cookies.txt'), 'utf8')).toBe(
      '# Netscape HTTP Cookie File\nline\n',
    )
  })

  it('accepts a raw text body as well', async () => {
    await handlers.cookies({ body: 'raw\n' })
    expect(existsSync(join(configDir, 'cookies.txt'))).toBe(true)
  })

  it('flags a file without the netscape header', async () => {
    const result = await handlers.cookies({ body: 'some=cookie\n' })
    expect(result.looksLikeNetscapeFormat).toBe(false)
  })

  it('rejects an empty upload', async () => {
    const error = await expectHttpError(handlers.cookies({ body: { text: '   ' } }))
    expect(error.statusCode).toBe(400)
  })

  it('rejects a body that carries no text at all', async () => {
    const error = await expectHttpError(handlers.cookies({ body: { file: 1 } }))
    expect(error.statusCode).toBe(400)
  })
})

describe('POST /api/settings/api-key/regenerate', () => {
  it('replaces the key', async () => {
    seedAdmin('old-key')

    const result = await handlers.regenerate({})
    expect(result.apiKey).toHaveLength(32)
    expect(result.apiKey).not.toBe('old-key')
    expect((await handlers.get({})).apiKey).toBe(result.apiKey)
  })

  it('answers 409 while no admin exists', async () => {
    const error = await expectHttpError(handlers.regenerate({}))
    expect(error.statusCode).toBe(409)
  })
})
