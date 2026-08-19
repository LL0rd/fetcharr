import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp, eventHandler, toWebHandler } from 'h3'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDb, type Db } from '@fetcharr/db'

process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), 'fetcharr-auth-'))

let db: Db

vi.mock('../server/utils/db', () => ({
  useDb: async () => db,
}))

let handle: (request: Request) => Promise<Response>

beforeAll(async () => {
  const [status, setup, login, logout, guard, jobs] = await Promise.all([
    import('../server/api/auth/status.get'),
    import('../server/api/auth/setup.post'),
    import('../server/api/auth/login.post'),
    import('../server/api/auth/logout.post'),
    import('../server/middleware/auth'),
    Promise.resolve({ default: eventHandler(() => ({ jobs: [] })) }),
  ])

  const app = createApp()
  app.use(guard.default)
  app.use('/api/auth/status', status.default)
  app.use('/api/auth/setup', setup.default)
  app.use('/api/auth/login', login.default)
  app.use('/api/auth/logout', logout.default)
  app.use('/api/health', eventHandler(() => ({ ok: true })))
  app.use('/api/jobs', jobs.default)
  handle = toWebHandler(app)
})

beforeEach(() => {
  db = createDb(':memory:')
})

function post(path: string, body: unknown, init: RequestInit = {}): Promise<Response> {
  return handle(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string>) },
    body: JSON.stringify(body),
  }))
}

function get(path: string, init: RequestInit = {}): Promise<Response> {
  return handle(new Request(`http://localhost${path}`, init))
}

function sessionCookie(response: Response): string {
  const raw = response.headers.get('set-cookie')
  expect(raw).toBeTruthy()
  return raw!.split(';')[0]!
}

describe('auth setup', () => {
  it('reports that no admin exists yet', async () => {
    const response = await get('/api/auth/status')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ hasAdmin: false, authenticated: false })
  })

  it('rejects passwords shorter than 12 characters with 400', async () => {
    const response = await post('/api/auth/setup', { password: 'short' })
    expect(response.status).toBe(400)
  })

  it('creates the admin, returns an api key and opens a session', async () => {
    const response = await post('/api/auth/setup', { password: 'correct horse battery' })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.apiKey).toHaveLength(32)
    expect(response.headers.get('set-cookie')).toContain('fetcharr-session')

    const status = await get('/api/auth/status')
    await expect(status.json()).resolves.toMatchObject({ hasAdmin: true })
  })

  it('runs only once — a second setup is rejected', async () => {
    await post('/api/auth/setup', { password: 'correct horse battery' })
    const second = await post('/api/auth/setup', { password: 'another valid password' })
    expect(second.status).toBe(409)
  })
})

describe('auth login', () => {
  beforeEach(async () => {
    await post('/api/auth/setup', { password: 'correct horse battery' })
  })

  it('rejects a wrong password with 401', async () => {
    const response = await post('/api/auth/login', { password: 'wrong horse battery' })
    expect(response.status).toBe(401)
  })

  it('accepts the right password and sets a sealed session cookie', async () => {
    const response = await post('/api/auth/login', { password: 'correct horse battery' })
    expect(response.status).toBe(200)
    const cookie = sessionCookie(response)
    expect(cookie).not.toContain('correct horse battery')

    const status = await get('/api/auth/status', { headers: { cookie } })
    await expect(status.json()).resolves.toMatchObject({ hasAdmin: true, authenticated: true })
  })

  it('logout clears the session cookie', async () => {
    const login = await post('/api/auth/login', { password: 'correct horse battery' })
    const cookie = sessionCookie(login)

    const response = await post('/api/auth/logout', {}, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/fetcharr-session=;/)
  })
})

describe('api guard', () => {
  let apiKey: string

  beforeEach(async () => {
    const response = await post('/api/auth/setup', { password: 'correct horse battery' })
    apiKey = (await response.json()).apiKey
  })

  it('rejects an unauthenticated request with 401', async () => {
    const response = await get('/api/jobs')
    expect(response.status).toBe(401)
  })

  it('accepts a session cookie', async () => {
    const login = await post('/api/auth/login', { password: 'correct horse battery' })
    const response = await get('/api/jobs', { headers: { cookie: sessionCookie(login) } })
    expect(response.status).toBe(200)
  })

  it('accepts the X-Api-Key header', async () => {
    const response = await get('/api/jobs', { headers: { 'x-api-key': apiKey } })
    expect(response.status).toBe(200)
  })

  it('accepts the apiKey query parameter', async () => {
    const response = await get(`/api/jobs?apiKey=${apiKey}`)
    expect(response.status).toBe(200)
  })

  it('rejects a wrong api key', async () => {
    const response = await get('/api/jobs', { headers: { 'x-api-key': 'nope' } })
    expect(response.status).toBe(401)
  })

  it('leaves auth and health routes open', async () => {
    expect((await get('/api/health')).status).toBe(200)
    expect((await get('/api/auth/status')).status).toBe(200)
  })
})
