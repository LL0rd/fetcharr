import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Db } from '@fetcharr/db'

import { setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>
type Module = typeof import('../server/api/version.get.ts')

let db: Db
let mod: Module
let version: Handler

const DIGEST = 'sha256:aaaa'
const envBackup = {
  image: process.env.FETCHARR_IMAGE,
  digest: process.env.FETCHARR_IMAGE_DIGEST,
  version: process.env.FETCHARR_VERSION,
}

/** Antwortet auf Token- und Manifest-Anfrage; merkt sich, was gefragt wurde. */
function stubRegistry(digest: string | null, ok = true) {
  const calls: { url: string; method: string }[] = []
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method ?? 'GET' })
    if (url.includes('/token?')) {
      return { ok: true, json: async () => ({ token: 'anon-token' }) } as any
    }
    return {
      ok,
      headers: { get: (name: string) => (name === 'docker-content-digest' ? digest : null) },
    } as any
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())
  process.env.FETCHARR_VERSION = '9.9.9'
  delete process.env.FETCHARR_IMAGE
  delete process.env.FETCHARR_IMAGE_DIGEST

  mod = await import('../server/api/version.get.ts')
  version = mod.default as unknown as Handler
  mod.clearVersionCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env.FETCHARR_IMAGE = envBackup.image
  process.env.FETCHARR_IMAGE_DIGEST = envBackup.digest
  process.env.FETCHARR_VERSION = envBackup.version
})

describe('GET /api/version', () => {
  it('reports the app version and no update while the local digest is unknown', async () => {
    stubRegistry('sha256:bbbb')

    const result = await version({})

    expect(result.version).toBe('9.9.9')
    expect(result.latestImageDigest).toBe('sha256:bbbb')
    expect(result.updateAvailable).toBeNull()
  })

  it('flags an update when the registry digest differs', async () => {
    process.env.FETCHARR_IMAGE_DIGEST = DIGEST
    stubRegistry('sha256:bbbb')

    expect((await version({})).updateAvailable).toBe(true)
  })

  it('reports no update when both digests match', async () => {
    process.env.FETCHARR_IMAGE_DIGEST = DIGEST
    stubRegistry(DIGEST)

    expect((await version({})).updateAvailable).toBe(false)
  })

  it('asks the configured image with an anonymous token and a HEAD request', async () => {
    process.env.FETCHARR_IMAGE = 'ghcr.io/someone/fetcharr:2.0.0'
    const calls = stubRegistry(DIGEST)

    await version({})

    expect(calls[0]!.url).toContain('https://ghcr.io/token?scope=')
    expect(calls[0]!.url).toContain(encodeURIComponent('repository:someone/fetcharr:pull'))
    expect(calls[1]!.url).toBe('https://ghcr.io/v2/someone/fetcharr/manifests/2.0.0')
    expect(calls[1]!.method).toBe('HEAD')
  })

  it('defaults to the published image and its latest tag', async () => {
    const calls = stubRegistry(DIGEST)
    await version({})
    expect(calls[1]!.url).toBe('https://ghcr.io/v2/ll0rd/fetcharr/manifests/latest')
  })

  it('falls back to null when the registry fails', async () => {
    process.env.FETCHARR_IMAGE_DIGEST = DIGEST
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    const result = await version({})

    expect(result.latestImageDigest).toBeNull()
    expect(result.updateAvailable).toBeNull()
  })

  it('keeps quiet when the manifest request is rejected', async () => {
    stubRegistry(null, false)
    expect((await version({})).latestImageDigest).toBeNull()
  })

  it('caches the result instead of hitting the registry again', async () => {
    stubRegistry(DIGEST)
    await version({})
    const before = (globalThis.fetch as any).mock.calls.length

    await version({})

    expect((globalThis.fetch as any).mock.calls.length).toBe(before)
  })

  it('returns the yt-dlp version the update task stored', async () => {
    db.$client
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('ytdlp_version', JSON.stringify('2026.08.01'))
    stubRegistry(DIGEST)

    expect((await version({})).ytdlp).toBe('2026.08.01')
  })

  it('reports no yt-dlp version when the key is missing', async () => {
    stubRegistry(DIGEST)
    expect((await version({})).ytdlp).toBeNull()
  })
})

describe('readAppVersion', () => {
  it('reads the version from the monorepo root package.json', () => {
    delete process.env.FETCHARR_VERSION
    expect(mod.readAppVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('parseImage', () => {
  it('splits registry, repository and tag', () => {
    expect(mod.parseImage('ghcr.io/ll0rd/fetcharr:latest')).toEqual({
      registry: 'ghcr.io',
      repository: 'll0rd/fetcharr',
      tag: 'latest',
    })
  })

  it('defaults the tag to latest', () => {
    expect(mod.parseImage('ghcr.io/ll0rd/fetcharr')?.tag).toBe('latest')
  })

  it('rejects references without a registry host', () => {
    expect(mod.parseImage('fetcharr:latest')).toBeNull()
    expect(mod.parseImage('  ')).toBeNull()
  })
})
