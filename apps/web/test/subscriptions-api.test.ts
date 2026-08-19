import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@fetcharr/db'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'

interface TestEvent {
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, string>
  statusCode?: number
}

type Handler = (event: TestEvent) => Promise<any>

let db: Db
let handlers: Record<string, Handler>
let downloads: string
const envBackup = { downloads: process.env.DOWNLOADS_DIR }

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())

  downloads = mkdtempSync(join(tmpdir(), 'fetcharr-subs-'))
  process.env.DOWNLOADS_DIR = downloads
  mkdirSync(join(downloads, 'video'), { recursive: true })

  handlers = {
    list: (await import('../server/api/subscriptions/index.get.ts')).default as Handler,
    create: (await import('../server/api/subscriptions/index.post.ts')).default as Handler,
    update: (await import('../server/api/subscriptions/[id]/index.patch.ts')).default as Handler,
    remove: (await import('../server/api/subscriptions/[id]/index.delete.ts')).default as Handler,
    check: (await import('../server/api/subscriptions/[id]/check.post.ts')).default as Handler,
    pause: (await import('../server/api/subscriptions/[id]/pause.post.ts')).default as Handler,
  }
})

afterEach(() => {
  process.env.DOWNLOADS_DIR = envBackup.downloads
})

function event(init: Partial<TestEvent> = {}): TestEvent {
  return { ...init }
}

async function create(body: Record<string, unknown> = {}): Promise<any> {
  const result = await handlers.create(
    event({ body: { url: 'https://example.com/@channel', name: 'Studio Vier', ...body } }),
  )
  return result.subscription
}

function seedArchive(subId: string, mediaId: string): void {
  db.$client
    .prepare(
      `INSERT INTO archive (extractor, media_id, type, sub_id, created_at)
       VALUES ('youtube', ?, 'video', ?, unixepoch())`,
    )
    .run(mediaId, subId)
}

function seedFile(subId: string, name: string): string {
  const uid = `file-${name}`
  writeFileSync(join(downloads, `video/${name}.mp4`), 'media')
  writeFileSync(join(downloads, `video/${name}.jpg`), 'thumb')
  db.$client
    .prepare(
      `INSERT INTO files (uid, url, title, type, path, thumbnail_path, sub_id, created_at)
       VALUES (?, 'https://example.com/v', ?, 'video', ?, ?, ?, unixepoch())`,
    )
    .run(uid, name, `video/${name}.mp4`, `video/${name}.jpg`, subId)
  return uid
}

describe('POST /api/subscriptions', () => {
  it('creates a subscription with defaults and answers 201', async () => {
    const ev = event({ body: { url: 'https://example.com/@channel', name: 'Studio Vier' } })
    const { subscription } = await handlers.create(ev)

    expect(ev.statusCode).toBe(201)
    expect(subscription).toMatchObject({
      url: 'https://example.com/@channel',
      name: 'Studio Vier',
      type: 'channel',
      mediaType: 'video',
      cron: '0 */6 * * *',
      sponsorblock: 'off',
      paused: false,
      rssEnabled: false,
      checking: false,
      checkRequested: false,
    })
    expect(subscription.id).toEqual(expect.any(String))
    expect(subscription.nextCheckAt).toBeInstanceOf(Date)
  })

  it('stores the optional fields and flags', async () => {
    const subscription = await create({
      type: 'playlist',
      mediaType: 'audio',
      cron: '30 4 * * 1',
      timerangeFrom: '20260101',
      titleRegex: '^Episode',
      maxQuality: '1080p',
      customArgs: '--no-mtime',
      customOutput: '%(title)s.%(ext)s',
      sponsorblock: 'remove',
      recordLivestreams: true,
      redownloadFreshUploads: true,
      rssEnabled: true,
    })

    expect(subscription).toMatchObject({
      type: 'playlist',
      mediaType: 'audio',
      cron: '30 4 * * 1',
      timerangeFrom: '20260101',
      titleRegex: '^Episode',
      maxQuality: '1080p',
      customArgs: '--no-mtime',
      customOutput: '%(title)s.%(ext)s',
      sponsorblock: 'remove',
      recordLivestreams: true,
      redownloadFreshUploads: true,
      rssEnabled: true,
    })
  })

  it('rejects a missing url or name with 400', async () => {
    for (const body of [
      { name: 'Studio Vier' },
      { url: 'ftp://example.com/feed', name: 'Studio Vier' },
      { url: 'https://example.com/@channel' },
      { url: 'https://example.com/@channel', name: '  ' },
    ]) {
      const error = await expectHttpError(handlers.create(event({ body })))
      expect(error.statusCode).toBe(400)
    }
  })

  it('rejects an invalid cron expression with 400', async () => {
    for (const cron of ['every tuesday', '99 * * * *', 42]) {
      const error = await expectHttpError(
        handlers.create(
          event({ body: { url: 'https://example.com/@c', name: 'Sub', cron } }),
        ),
      )
      expect(error.statusCode).toBe(400)
    }
  })

  it('rejects unknown enum values and malformed optional fields with 400', async () => {
    for (const body of [
      { type: 'magazine' },
      { mediaType: 'image' },
      { sponsorblock: 'sometimes' },
      { maxQuality: '4320p' },
      { timerangeFrom: '2026-01-01' },
      { titleRegex: '([' },
      { rssEnabled: 'maybe' },
    ]) {
      const error = await expectHttpError(
        handlers.create(
          event({ body: { url: 'https://example.com/@c', name: 'Sub', ...body } }),
        ),
      )
      expect(error.statusCode).toBe(400)
    }
  })
})

describe('GET /api/subscriptions', () => {
  it('lists subscriptions with archive counts and the next check', async () => {
    const first = await create({ name: 'First' })
    const second = await create({ name: 'Second' })
    seedArchive(first.id, 'aaa')
    seedArchive(first.id, 'bbb')
    seedArchive(second.id, 'ccc')

    const result = await handlers.list(event())
    expect(result.total).toBe(2)

    const byName = Object.fromEntries(
      result.subscriptions.map((sub: any) => [sub.name, sub]),
    )
    expect(byName.First.archiveCount).toBe(2)
    expect(byName.Second.archiveCount).toBe(1)
    expect(byName.First.nextCheckAt).toBeInstanceOf(Date)
  })

  it('reports no next check for a paused subscription', async () => {
    const subscription = await create({ paused: true })

    const { subscriptions } = await handlers.list(event())
    expect(subscriptions[0]).toMatchObject({ id: subscription.id, paused: true, archiveCount: 0 })
    expect(subscriptions[0].nextCheckAt).toBeNull()
  })

  it('returns an empty list without subscriptions', async () => {
    expect(await handlers.list(event())).toMatchObject({ subscriptions: [], total: 0 })
  })
})

describe('PATCH /api/subscriptions/:id', () => {
  it('updates only the fields that were sent', async () => {
    const subscription = await create({ name: 'Old', cron: '0 * * * *' })

    const { subscription: updated } = await handlers.update(
      event({ params: { id: subscription.id }, body: { name: 'New', rssEnabled: true } }),
    )

    expect(updated).toMatchObject({ name: 'New', rssEnabled: true, cron: '0 * * * *' })
    expect(updated.updatedAt).toBeInstanceOf(Date)
  })

  it('clears an optional field with an empty string', async () => {
    const subscription = await create({ titleRegex: '^Episode' })

    const { subscription: updated } = await handlers.update(
      event({ params: { id: subscription.id }, body: { titleRegex: '' } }),
    )
    expect(updated.titleRegex).toBeNull()
  })

  it('rejects an empty patch and an invalid cron with 400', async () => {
    const subscription = await create()

    for (const body of [{}, { cron: 'nope' }]) {
      const error = await expectHttpError(
        handlers.update(event({ params: { id: subscription.id }, body })),
      )
      expect(error.statusCode).toBe(400)
    }
  })

  it('answers 404 for an unknown id', async () => {
    const error = await expectHttpError(
      handlers.update(event({ params: { id: 'nope' }, body: { name: 'X' } })),
    )
    expect(error.statusCode).toBe(404)
  })
})

describe('POST /api/subscriptions/:id/check', () => {
  it('requests a check without touching the worker', async () => {
    const subscription = await create()

    const result = await handlers.check(event({ params: { id: subscription.id } }))
    expect(result.subscription).toMatchObject({ checkRequested: true, checking: false })
  })

  it('answers 409 while a check is running and 404 for an unknown id', async () => {
    const subscription = await create()
    db.$client.prepare('UPDATE subscriptions SET checking = 1 WHERE id = ?').run(subscription.id)

    const conflict = await expectHttpError(
      handlers.check(event({ params: { id: subscription.id } })),
    )
    expect(conflict.statusCode).toBe(409)

    const missing = await expectHttpError(handlers.check(event({ params: { id: 'nope' } })))
    expect(missing.statusCode).toBe(404)
  })
})

describe('POST /api/subscriptions/:id/pause', () => {
  it('toggles without a body and follows an explicit state', async () => {
    const subscription = await create()

    const paused = await handlers.pause(event({ params: { id: subscription.id } }))
    expect(paused.subscription).toMatchObject({ paused: true })
    expect(paused.subscription.nextCheckAt).toBeNull()

    const resumed = await handlers.pause(event({ params: { id: subscription.id } }))
    expect(resumed.subscription.paused).toBe(false)

    const forced = await handlers.pause(
      event({ params: { id: subscription.id }, body: { paused: true } }),
    )
    expect(forced.subscription.paused).toBe(true)
  })

  it('answers 404 for an unknown id', async () => {
    const error = await expectHttpError(handlers.pause(event({ params: { id: 'nope' } })))
    expect(error.statusCode).toBe(404)
  })
})

describe('DELETE /api/subscriptions/:id', () => {
  it('keeps the files by default and only drops the subscription link', async () => {
    const subscription = await create()
    const uid = seedFile(subscription.id, 'kept')
    seedArchive(subscription.id, 'aaa')

    const result = await handlers.remove(event({ params: { id: subscription.id } }))
    expect(result).toMatchObject({ deleted: true, deletedFiles: 0 })
    expect(existsSync(join(downloads, 'video/kept.mp4'))).toBe(true)

    const file = db.$client.prepare('SELECT sub_id FROM files WHERE uid = ?').get(uid) as any
    expect(file.sub_id).toBeNull()

    const archive = db.$client.prepare('SELECT COUNT(*) AS n FROM archive').get() as any
    expect(archive.n).toBe(0)
    expect((await handlers.list(event())).total).toBe(0)
  })

  it('removes files and sidecars with deleteFiles=true', async () => {
    const subscription = await create()
    seedFile(subscription.id, 'gone')

    const result = await handlers.remove(
      event({ params: { id: subscription.id }, query: { deleteFiles: 'true' } }),
    )
    expect(result.deletedFiles).toBe(1)
    expect(existsSync(join(downloads, 'video/gone.mp4'))).toBe(false)
    expect(existsSync(join(downloads, 'video/gone.jpg'))).toBe(false)

    const files = db.$client.prepare('SELECT COUNT(*) AS n FROM files').get() as any
    expect(files.n).toBe(0)
  })

  it('rejects a bad deleteFiles flag and answers 404 for an unknown id', async () => {
    const subscription = await create()

    const bad = await expectHttpError(
      handlers.remove(event({ params: { id: subscription.id }, query: { deleteFiles: 'yes' } })),
    )
    expect(bad.statusCode).toBe(400)

    const missing = await expectHttpError(handlers.remove(event({ params: { id: 'nope' } })))
    expect(missing.statusCode).toBe(404)
  })
})
