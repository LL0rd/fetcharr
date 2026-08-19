import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Db } from '@fetcharr/db'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'

interface ArchiveEvent {
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, string>
  statusCode?: number
  headers: Record<string, string>
  reqHeaders: Record<string, string>
  raw?: string
  parts?: { name?: string; filename?: string; data: Buffer }[]
}

type Handler = (event: ArchiveEvent) => Promise<any>

let db: Db
let handlers: Record<string, Handler>

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())
  stubUploadGlobals()

  handlers = {
    list: (await import('../server/api/archive/index.get.ts')).default as Handler,
    remove: (await import('../server/api/archive/[id].delete.ts')).default as Handler,
    import: (await import('../server/api/archive/import.post.ts')).default as Handler,
    export: (await import('../server/api/archive/export.get.ts')).default as Handler,
  }
})

function stubUploadGlobals(): void {
  vi.stubGlobal('setResponseHeader', (event: ArchiveEvent, name: string, value: unknown) => {
    event.headers[name.toLowerCase()] = String(value)
  })
  vi.stubGlobal('getHeader', (event: ArchiveEvent, name: string) => event.reqHeaders[name.toLowerCase()])
  vi.stubGlobal('readRawBody', async (event: ArchiveEvent) => event.raw)
  vi.stubGlobal('readMultipartFormData', async (event: ArchiveEvent) => event.parts)
}

function event(init: Partial<ArchiveEvent> = {}): ArchiveEvent {
  return { headers: {}, reqHeaders: {}, ...init }
}

let clock = 1_700_000_000

function seedEntry(input: {
  extractor?: string
  mediaId?: string
  subId?: string | null
  title?: string | null
} = {}): number {
  const row = db.$client
    .prepare(
      `INSERT INTO archive (extractor, media_id, type, sub_id, title, created_at)
       VALUES (?, ?, 'video', ?, ?, ?) RETURNING id`,
    )
    .get(
      input.extractor ?? 'youtube',
      input.mediaId ?? `id-${clock}`,
      input.subId ?? null,
      input.title ?? null,
      clock++,
    ) as { id: number }

  return row.id
}

function seedSub(id: string, name: string): void {
  db.$client
    .prepare('INSERT INTO subscriptions (id, url, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, `https://example.com/${id}`, name, clock, clock)
}

describe('GET /api/archive', () => {
  it('lists entries newest first with the total', async () => {
    seedEntry({ mediaId: 'aaa' })
    seedEntry({ mediaId: 'bbb' })

    const result = await handlers.list!(event())

    expect(result.total).toBe(2)
    expect(result.entries.map((entry: any) => entry.mediaId)).toEqual(['bbb', 'aaa'])
  })

  it('searches over media id and title', async () => {
    seedEntry({ mediaId: 'dQw4w9WgXcQ', title: 'Never gonna' })
    seedEntry({ mediaId: 'other', title: 'Something else', extractor: 'soundcloud' })

    const byId = await handlers.list!(event({ query: { q: 'dQw4' } }))
    expect(byId.entries).toHaveLength(1)
    expect(byId.entries[0].mediaId).toBe('dQw4w9WgXcQ')

    const byTitle = await handlers.list!(event({ query: { q: 'something' } }))
    expect(byTitle.entries).toHaveLength(1)
    expect(byTitle.entries[0].mediaId).toBe('other')
  })

  it('filters by subscription and resolves its name', async () => {
    seedSub('sub-1', 'Podcast One')
    seedEntry({ mediaId: 'in-sub', subId: 'sub-1' })
    seedEntry({ mediaId: 'loose' })

    const result = await handlers.list!(event({ query: { subId: 'sub-1' } }))

    expect(result.total).toBe(1)
    expect(result.entries[0].subName).toBe('Podcast One')
  })

  it('paginates and rejects a broken limit', async () => {
    seedEntry({ mediaId: 'one' })
    seedEntry({ mediaId: 'two' })
    seedEntry({ mediaId: 'three' })

    const page = await handlers.list!(event({ query: { limit: '2', offset: '2' } }))
    expect(page.entries).toHaveLength(1)
    expect(page.total).toBe(3)

    const error = await expectHttpError(handlers.list!(event({ query: { limit: 'lots' } })))
    expect(error.statusCode).toBe(400)
  })
})

describe('DELETE /api/archive/:id', () => {
  it('removes the entry so the media can be downloaded again', async () => {
    const id = seedEntry({ mediaId: 'gone' })

    const result = await handlers.remove!(event({ params: { id: String(id) } }))

    expect(result.deleted).toBe(id)
    expect(db.$client.prepare('SELECT COUNT(*) AS n FROM archive').get()).toEqual({ n: 0 })
  })

  it('answers 404 for an unknown id and 400 for a non-numeric one', async () => {
    const missing = await expectHttpError(handlers.remove!(event({ params: { id: '999' } })))
    expect(missing.statusCode).toBe(404)

    const broken = await expectHttpError(handlers.remove!(event({ params: { id: 'abc' } })))
    expect(broken.statusCode).toBe(400)
  })
})

describe('POST /api/archive/import', () => {
  it('imports a plain text archive and skips known lines', async () => {
    seedEntry({ extractor: 'youtube', mediaId: 'known' })

    const result = await handlers.import!(
      event({
        reqHeaders: { 'content-type': 'text/plain' },
        raw: '# comment\nyoutube known\nyoutube fresh\n\nsoundcloud 12345\nbroken-line\n',
      }),
    )

    expect(result).toMatchObject({ parsed: 3, imported: 2, skipped: 1 })
    expect(db.$client.prepare('SELECT COUNT(*) AS n FROM archive').get()).toEqual({ n: 3 })
  })

  it('imports a multipart upload against one subscription', async () => {
    seedSub('sub-1', 'Podcast One')

    const result = await handlers.import!(
      event({
        reqHeaders: { 'content-type': 'multipart/form-data; boundary=x' },
        parts: [
          { name: 'file', filename: 'archive.txt', data: Buffer.from('youtube abc\nyoutube def\n') },
          { name: 'subId', data: Buffer.from('sub-1') },
        ],
      }),
    )

    expect(result).toMatchObject({ imported: 2, subId: 'sub-1' })
    const rows = db.$client.prepare('SELECT sub_id FROM archive').all()
    expect(rows).toEqual([{ sub_id: 'sub-1' }, { sub_id: 'sub-1' }])
  })

  it('keeps the same media id once per subscription only', async () => {
    seedSub('sub-1', 'Podcast One')
    seedEntry({ extractor: 'youtube', mediaId: 'abc', subId: 'sub-1' })

    const result = await handlers.import!(
      event({
        reqHeaders: { 'content-type': 'application/json' },
        body: { text: 'youtube abc', subId: 'sub-1' },
      }),
    )

    expect(result).toMatchObject({ imported: 0, skipped: 1 })
  })

  it('rejects a body without a single usable line', async () => {
    const error = await expectHttpError(
      handlers.import!(event({ reqHeaders: { 'content-type': 'text/plain' }, raw: '   \n# only comments\n' })),
    )

    expect(error.statusCode).toBe(400)
  })
})

describe('GET /api/archive/export', () => {
  it('writes one "extractor id" line per entry', async () => {
    seedEntry({ extractor: 'youtube', mediaId: 'first' })
    seedEntry({ extractor: 'soundcloud', mediaId: 'second' })

    const body = await handlers.export!(event())

    expect(body).toBe('soundcloud second\nyoutube first\n')
  })

  it('limits the export to one subscription and offers it as a download', async () => {
    seedSub('sub-1', 'Podcast One')
    seedEntry({ mediaId: 'in-sub', subId: 'sub-1' })
    seedEntry({ mediaId: 'loose' })

    const target = event({ query: { subId: 'sub-1' } })
    const body = await handlers.export!(target)

    expect(body).toBe('youtube in-sub\n')
    expect(target.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(target.headers['content-disposition']).toContain('archive-sub-1.txt')
  })

  it('returns an empty body when nothing is archived', async () => {
    expect(await handlers.export!(event())).toBe('')
  })
})
