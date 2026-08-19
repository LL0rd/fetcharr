import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Db } from '@fetcharr/db'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'

interface RssEvent {
  params?: Record<string, string>
  query?: Record<string, string>
  headers: Record<string, string>
  url?: string
}

type Handler = (event: RssEvent) => Promise<string>

let db: Db
let handler: Handler
const envBackup = process.env.PUBLIC_URL

const API_KEY = 'test-api-key'

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())
  delete process.env.PUBLIC_URL

  vi.stubGlobal('setResponseHeader', (event: RssEvent, name: string, value: unknown) => {
    event.headers[name.toLowerCase()] = String(value)
  })
  vi.stubGlobal('getRequestURL', (event: RssEvent) => new URL(event.url ?? 'http://fetcharr.local/api/rss/sub-1'))

  db.$client
    .prepare('INSERT INTO auth (id, password_hash, api_key, created_at) VALUES (1, ?, ?, ?)')
    .run('hash', API_KEY, 1_700_000_000)

  handler = (await import('../server/api/rss/[subId].get.ts')).default as Handler
})

afterEach(() => {
  if (envBackup == null) delete process.env.PUBLIC_URL
  else process.env.PUBLIC_URL = envBackup
})

function event(init: Partial<RssEvent> = {}): RssEvent {
  return { headers: {}, ...init }
}

interface SubInput {
  id?: string
  name?: string
  mediaType?: 'video' | 'audio'
  rssEnabled?: boolean
}

function seedSub(input: SubInput = {}): string {
  const id = input.id ?? 'sub-1'
  db.$client
    .prepare(
      `INSERT INTO subscriptions (id, url, name, media_type, rss_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `https://example.com/${id}`,
      input.name ?? 'Nightly Show',
      input.mediaType ?? 'audio',
      input.rssEnabled === false ? 0 : 1,
      1_700_000_000,
      1_700_000_000,
    )
  return id
}

let clock = 1_700_000_100

function seedFile(subId: string | null, input: { uid?: string; title?: string; duration?: number } = {}): string {
  const uid = input.uid ?? `file-${clock}`
  db.$client
    .prepare(
      `INSERT INTO files (uid, url, title, uploader, type, path, size_bytes, duration_sec, created_at)
       VALUES (?, ?, ?, ?, 'audio', ?, ?, ?, ?)`,
    )
    .run(
      uid,
      `https://example.com/watch/${uid}`,
      input.title ?? 'Episode',
      'Some Host',
      `audio/${uid}.mp3`,
      4096,
      input.duration ?? 3661,
      clock++,
    )
  if (subId) db.$client.prepare('UPDATE files SET sub_id = ? WHERE uid = ?').run(subId, uid)
  return uid
}

describe('GET /api/rss/:subId', () => {
  it('builds a podcast feed with enclosures carrying the api key', async () => {
    const subId = seedSub()
    const uid = seedFile(subId, { title: 'Episode One', duration: 3661 })

    const target = event({ params: { subId } })
    const xml = await handler(target)

    expect(target.headers['content-type']).toBe('application/rss+xml; charset=utf-8')
    expect(xml).toContain('<title>Nightly Show</title>')
    expect(xml).toContain('Episode One')
    expect(xml).toContain(`http://fetcharr.local/api/stream/${uid}?apiKey=${API_KEY}`)
    expect(xml).toContain('type="audio/mpeg"')
    expect(xml).toContain('xmlns:itunes')
    expect(xml).toContain('<itunes:duration>1:01:01</itunes:duration>')
  })

  it('lists the newest episode first and ignores files of other subscriptions', async () => {
    const subId = seedSub()
    seedFile(subId, { title: 'Older' })
    seedFile(subId, { title: 'Newer' })
    seedFile(null, { title: 'Unrelated' })

    const xml = await handler(event({ params: { subId } }))

    expect(xml).not.toContain('Unrelated')
    expect(xml.indexOf('Newer')).toBeLessThan(xml.indexOf('Older'))
  })

  it('uses PUBLIC_URL when the instance sits behind a proxy', async () => {
    const subId = seedSub()
    const uid = seedFile(subId)
    process.env.PUBLIC_URL = 'https://media.example.org/'

    const xml = await handler(event({ params: { subId } }))

    expect(xml).toContain(`https://media.example.org/api/stream/${uid}?apiKey=`)
  })

  it('stays empty but valid while the subscription has no downloads yet', async () => {
    const subId = seedSub()

    const xml = await handler(event({ params: { subId } }))

    expect(xml).toContain('<rss')
    expect(xml).not.toContain('<item>')
  })

  it('answers 404 for video subscriptions, disabled feeds and unknown ids', async () => {
    seedSub({ id: 'video-sub', mediaType: 'video' })
    seedSub({ id: 'off-sub', rssEnabled: false })

    for (const subId of ['video-sub', 'off-sub', 'nope']) {
      const error = await expectHttpError(handler(event({ params: { subId } })))
      expect(error.statusCode).toBe(404)
    }
  })
})
