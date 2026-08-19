import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@fetcharr/db'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>

let db: Db
let bulk: Handler

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())
  bulk = (await import('../server/api/jobs/bulk.post.ts')).default as Handler
})

function rows(): { url: string; priority: number; type: string; options: string }[] {
  return db.$client
    .prepare('SELECT url, priority, type, options FROM jobs ORDER BY rowid')
    .all() as any
}

describe('POST /api/jobs/bulk', () => {
  it('queues every url with priority 1', async () => {
    const event: TestEvent = {
      body: { urls: ['https://youtu.be/a', 'https://youtu.be/b'] },
    }

    const result = await bulk(event)

    expect(result.created).toBe(2)
    expect(event.statusCode).toBe(201)
    expect(rows().map((row) => row.url)).toEqual(['https://youtu.be/a', 'https://youtu.be/b'])
    expect(rows().every((row) => row.priority === 1)).toBe(true)
  })

  it('drops duplicates and reports non-http entries as skipped', async () => {
    const result = await bulk({
      body: {
        urls: ['https://youtu.be/a', ' https://youtu.be/a ', '', 'ftp://host/file', 'nonsense'],
      },
    })

    expect(result.created).toBe(1)
    expect(result.skipped).toEqual(['ftp://host/file', 'nonsense'])
  })

  it('applies the shared type and options to all jobs', async () => {
    await bulk({
      body: {
        urls: ['https://youtu.be/a', 'https://youtu.be/b'],
        type: 'audio',
        options: { format: 'audio', sponsorblock: 'remove' },
      },
    })

    for (const row of rows()) {
      expect(row.type).toBe('audio')
      expect(JSON.parse(row.options)).toMatchObject({ format: 'audio', sponsorblock: 'remove' })
    }
  })

  it('derives the type from an audio format', async () => {
    await bulk({ body: { urls: ['https://youtu.be/a'], options: { format: 'audio' } } })
    expect(rows()[0]!.type).toBe('audio')
  })

  it('rejects a missing list, more than 500 urls and unusable input', async () => {
    expect((await expectHttpError(bulk({ body: {} }))).statusCode).toBe(400)

    const many = Array.from({ length: 501 }, (_, index) => `https://youtu.be/${index}`)
    const tooMany = await expectHttpError(bulk({ body: { urls: many } }))
    expect(tooMany.statusMessage).toContain('500')

    const empty = await expectHttpError(bulk({ body: { urls: ['nope'] } }))
    expect(empty.statusCode).toBe(400)
    expect(rows()).toHaveLength(0)
  })

  it('rejects invalid options and unknown types', async () => {
    const badOptions = await expectHttpError(
      bulk({ body: { urls: ['https://youtu.be/a'], options: { format: 'ultrahd' } } }),
    )
    expect(badOptions.statusMessage).toBe('Invalid job options')

    const badType = await expectHttpError(
      bulk({ body: { urls: ['https://youtu.be/a'], type: 'image' } }),
    )
    expect(badType.statusCode).toBe(400)
  })
})
