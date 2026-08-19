import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Db } from '@fetcharr/db'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'

interface StreamEvent {
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, string>
  statusCode?: number
  headers: Record<string, string>
  reqHeaders: Record<string, string>
}

type Handler = (event: StreamEvent) => Promise<any>

let db: Db
let handlers: Record<string, Handler>
let downloads: string
const envBackup = { downloads: process.env.DOWNLOADS_DIR }

const MEDIA_BYTES = 200

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())
  stubStreamGlobals()

  downloads = mkdtempSync(join(tmpdir(), 'fetcharr-files-'))
  process.env.DOWNLOADS_DIR = downloads
  mkdirSync(join(downloads, 'video'), { recursive: true })
  mkdirSync(join(downloads, 'audio'), { recursive: true })
  writeFileSync(join(downloads, 'video/clip.mp4'), Buffer.alloc(MEDIA_BYTES, 7))
  writeFileSync(join(downloads, 'video/clip.jpg'), Buffer.from('jpeg-bytes'))
  writeFileSync(join(downloads, 'video/clip.info.json'), '{}')
  writeFileSync(join(downloads, 'video/clip.en.vtt'), 'WEBVTT')
  writeFileSync(join(downloads, 'video/other.mp4'), Buffer.alloc(10))
  writeFileSync(join(downloads, 'audio/song.mp3'), Buffer.alloc(50, 3))

  handlers = {
    list: (await import('../server/api/files/index.get.ts')).default as Handler,
    get: (await import('../server/api/files/[uid]/index.get.ts')).default as Handler,
    remove: (await import('../server/api/files/[uid]/index.delete.ts')).default as Handler,
    favorite: (await import('../server/api/files/[uid]/favorite.post.ts')).default as Handler,
    view: (await import('../server/api/files/[uid]/view.post.ts')).default as Handler,
    zip: (await import('../server/api/files/zip.post.ts')).default as Handler,
    stream: (await import('../server/api/stream/[uid].get.ts')).default as Handler,
    thumbnail: (await import('../server/api/thumbnail/[uid].get.ts')).default as Handler,
  }
})

afterEach(() => {
  process.env.DOWNLOADS_DIR = envBackup.downloads
})

/** Die Streaming-Handler brauchen Header- und Stream-Helfer, die die Job-Tests nicht kennen. */
function stubStreamGlobals(): void {
  vi.stubGlobal('setResponseHeader', (event: StreamEvent, name: string, value: unknown) => {
    event.headers[name.toLowerCase()] = String(value)
  })
  vi.stubGlobal(
    'getHeader',
    (event: StreamEvent, name: string) => event.reqHeaders[name.toLowerCase()],
  )
  vi.stubGlobal('sendStream', (_event: StreamEvent, stream: Readable) => stream)
}

function event(init: Partial<StreamEvent> = {}): StreamEvent {
  return { headers: {}, reqHeaders: {}, ...init }
}

let counter = 0

interface SeedInput {
  uid?: string
  title?: string
  uploader?: string | null
  type?: 'video' | 'audio'
  path?: string
  thumbnailPath?: string | null
  sizeBytes?: number
  favorite?: boolean
}

function seed(input: SeedInput = {}): string {
  const uid = input.uid ?? `file-${++counter}`
  db.$client
    .prepare(
      `INSERT INTO files (uid, url, title, uploader, type, path, size_bytes, duration_sec,
                          thumbnail_path, upload_date, favorite, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    )
    .run(
      uid,
      `https://example.com/${uid}`,
      input.title ?? `Title ${uid}`,
      input.uploader === undefined ? 'Studio Vier' : input.uploader,
      input.type ?? 'video',
      input.path ?? 'video/clip.mp4',
      input.sizeBytes ?? MEDIA_BYTES,
      120,
      input.thumbnailPath === undefined ? 'video/clip.jpg' : input.thumbnailPath,
      '20260101',
      input.favorite ? 1 : 0,
    )
  return uid
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

describe('GET /api/files', () => {
  it('lists files with total, limit and offset', async () => {
    seed({ title: 'One' })
    seed({ title: 'Two' })

    const result = await handlers.list(event())
    expect(result.total).toBe(2)
    expect(result.files).toHaveLength(2)
    expect(result).toMatchObject({ limit: 50, offset: 0 })
  })

  it('passes search, filters, sorting and pagination through', async () => {
    seed({ title: 'Modernist Design', type: 'video' })
    const audio = seed({ title: 'Modernist Podcast', type: 'audio', favorite: true })
    seed({ title: 'Unrelated' })

    const filtered = await handlers.list(
      event({ query: { q: 'modernist', type: 'audio', favorite: 'true' } }),
    )
    expect(filtered.files.map((f: any) => f.uid)).toEqual([audio])

    const sorted = await handlers.list(event({ query: { sort: 'title', order: 'asc', limit: '2' } }))
    expect(sorted.files.map((f: any) => f.title)).toEqual(['Modernist Design', 'Modernist Podcast'])
    expect(sorted).toMatchObject({ total: 3, limit: 2 })
  })

  it('rejects an unknown sort key, order, type or a bad limit with 400', async () => {
    for (const query of [
      { sort: 'colour' },
      { order: 'sideways' },
      { type: 'image' },
      { limit: 'many' },
      { offset: '-1' },
    ]) {
      const error = await expectHttpError(handlers.list(event({ query })))
      expect(error.statusCode).toBe(400)
    }
  })
})

describe('GET /api/files/:uid', () => {
  it('returns the file', async () => {
    const uid = seed({ title: 'Clip' })
    const { file } = await handlers.get(event({ params: { uid } }))
    expect(file).toMatchObject({ uid, title: 'Clip' })
  })

  it('answers 404 for an unknown uid', async () => {
    const error = await expectHttpError(handlers.get(event({ params: { uid: 'nope' } })))
    expect(error.statusCode).toBe(404)
  })
})

describe('DELETE /api/files/:uid', () => {
  it('removes the row, the media file and its sidecars but keeps other files', async () => {
    const uid = seed()

    const result = await handlers.remove(event({ params: { uid } }))
    expect(result).toMatchObject({ deleted: true, uid })
    expect(existsSync(join(downloads, 'video/clip.mp4'))).toBe(false)
    expect(existsSync(join(downloads, 'video/clip.jpg'))).toBe(false)
    expect(existsSync(join(downloads, 'video/clip.info.json'))).toBe(false)
    expect(existsSync(join(downloads, 'video/clip.en.vtt'))).toBe(false)
    expect(existsSync(join(downloads, 'video/other.mp4'))).toBe(true)

    const error = await expectHttpError(handlers.get(event({ params: { uid } })))
    expect(error.statusCode).toBe(404)
  })

  it('still removes the row when the media file is already gone', async () => {
    const uid = seed({ path: 'video/vanished.mp4', thumbnailPath: null })
    const result = await handlers.remove(event({ params: { uid } }))
    expect(result.deleted).toBe(true)
  })

  it('answers 404 for an unknown uid', async () => {
    const error = await expectHttpError(handlers.remove(event({ params: { uid: 'nope' } })))
    expect(error.statusCode).toBe(404)
  })
})

describe('POST /api/files/:uid/favorite', () => {
  it('sets the flag from the body and toggles without one', async () => {
    const uid = seed()

    expect((await handlers.favorite(event({ params: { uid }, body: { favorite: true } }))).file)
      .toMatchObject({ favorite: true })
    expect((await handlers.favorite(event({ params: { uid } }))).file).toMatchObject({
      favorite: false,
    })
  })

  it('answers 404 for an unknown uid', async () => {
    const error = await expectHttpError(handlers.favorite(event({ params: { uid: 'nope' } })))
    expect(error.statusCode).toBe(404)
  })
})

describe('POST /api/files/:uid/view', () => {
  it('counts a view and stores the resume position', async () => {
    const uid = seed()

    const { file } = await handlers.view(event({ params: { uid }, body: { positionSec: 42 } }))
    expect(file).toMatchObject({ viewCount: 1, resumePositionSec: 42 })

    const updated = await handlers.view(
      event({ params: { uid }, body: { positionSec: 90, countView: false } }),
    )
    expect(updated.file).toMatchObject({ viewCount: 1, resumePositionSec: 90 })
  })

  it('rejects a non-numeric position with 400', async () => {
    const uid = seed()
    const error = await expectHttpError(
      handlers.view(event({ params: { uid }, body: { positionSec: 'half' } })),
    )
    expect(error.statusCode).toBe(400)
  })

  it('answers 404 for an unknown uid', async () => {
    const error = await expectHttpError(handlers.view(event({ params: { uid: 'nope' } })))
    expect(error.statusCode).toBe(404)
  })
})

describe('POST /api/files/zip', () => {
  it('streams a zip archive with attachment headers', async () => {
    const video = seed()
    const audio = seed({ type: 'audio', path: 'audio/song.mp3', thumbnailPath: null })

    const ev = event({ body: { uids: [video, audio] } })
    const stream = await handlers.zip(ev)
    const bytes = await collect(stream as unknown as Readable)

    expect(bytes.subarray(0, 2).toString()).toBe('PK')
    expect(bytes.length).toBeGreaterThan(MEDIA_BYTES)
    expect(ev.headers['content-type']).toBe('application/zip')
    expect(ev.headers['content-disposition']).toContain('attachment')
  })

  it('rejects an empty or missing uid list with 400', async () => {
    expect((await expectHttpError(handlers.zip(event({ body: { uids: [] } })))).statusCode).toBe(400)
    expect((await expectHttpError(handlers.zip(event({ body: {} })))).statusCode).toBe(400)
  })

  it('answers 404 when none of the uids exist', async () => {
    const error = await expectHttpError(handlers.zip(event({ body: { uids: ['nope'] } })))
    expect(error.statusCode).toBe(404)
  })
})

describe('GET /api/stream/:uid', () => {
  it('serves the whole file with 200 when no range is requested', async () => {
    const uid = seed()
    const ev = event({ params: { uid } })

    const stream = await handlers.stream(ev)
    expect(ev.statusCode).toBeUndefined()
    expect(ev.headers).toMatchObject({
      'accept-ranges': 'bytes',
      'content-type': 'video/mp4',
      'content-length': String(MEDIA_BYTES),
    })
    expect(ev.headers['content-range']).toBeUndefined()
    expect((await collect(stream as unknown as Readable)).length).toBe(MEDIA_BYTES)
  })

  it('answers a closed range with 206 and the matching bytes', async () => {
    const uid = seed()
    const ev = event({ params: { uid }, reqHeaders: { range: 'bytes=0-99' } })

    const stream = await handlers.stream(ev)
    expect(ev.statusCode).toBe(206)
    expect(ev.headers['content-range']).toBe(`bytes 0-99/${MEDIA_BYTES}`)
    expect(ev.headers['content-length']).toBe('100')
    expect((await collect(stream as unknown as Readable)).length).toBe(100)
  })

  it('answers an open-ended range with the rest of the file', async () => {
    const uid = seed()
    const ev = event({ params: { uid }, reqHeaders: { range: 'bytes=150-' } })

    const stream = await handlers.stream(ev)
    expect(ev.statusCode).toBe(206)
    expect(ev.headers['content-range']).toBe(`bytes 150-199/${MEDIA_BYTES}`)
    expect((await collect(stream as unknown as Readable)).length).toBe(50)
  })

  it('answers a suffix range with the last bytes', async () => {
    const uid = seed()
    const ev = event({ params: { uid }, reqHeaders: { range: 'bytes=-50' } })

    await handlers.stream(ev)
    expect(ev.statusCode).toBe(206)
    expect(ev.headers['content-range']).toBe(`bytes 150-199/${MEDIA_BYTES}`)
  })

  it('clamps a range that reaches past the end', async () => {
    const uid = seed()
    const ev = event({ params: { uid }, reqHeaders: { range: 'bytes=100-999' } })

    await handlers.stream(ev)
    expect(ev.statusCode).toBe(206)
    expect(ev.headers['content-range']).toBe(`bytes 100-199/${MEDIA_BYTES}`)
  })

  it('answers 416 with Content-Range for an unsatisfiable or malformed range', async () => {
    const uid = seed()

    for (const range of ['bytes=500-600', 'bytes=abc', 'bytes=90-10']) {
      const ev = event({ params: { uid }, reqHeaders: { range } })
      const error = await expectHttpError(handlers.stream(ev))
      expect(error.statusCode).toBe(416)
      expect(ev.headers['content-range']).toBe(`bytes */${MEDIA_BYTES}`)
    }
  })

  it('ignores a range with an unknown unit and serves the whole file', async () => {
    const uid = seed()
    const ev = event({ params: { uid }, reqHeaders: { range: 'items=0-9' } })

    await handlers.stream(ev)
    expect(ev.statusCode).toBeUndefined()
    expect(ev.headers['content-length']).toBe(String(MEDIA_BYTES))
  })

  it('serves audio with its own content type', async () => {
    const uid = seed({ type: 'audio', path: 'audio/song.mp3' })
    const ev = event({ params: { uid } })

    await handlers.stream(ev)
    expect(ev.headers['content-type']).toBe('audio/mpeg')
  })

  it('answers 404 for an unknown uid and for a row whose file is gone', async () => {
    expect(
      (await expectHttpError(handlers.stream(event({ params: { uid: 'nope' } })))).statusCode,
    ).toBe(404)

    const uid = seed({ path: 'video/vanished.mp4' })
    expect(
      (await expectHttpError(handlers.stream(event({ params: { uid } })))).statusCode,
    ).toBe(404)
  })

  it('refuses a path that escapes the downloads directory', async () => {
    const uid = seed({ path: '../../etc/passwd' })
    const error = await expectHttpError(handlers.stream(event({ params: { uid } })))
    expect(error.statusCode).toBe(403)
  })
})

describe('GET /api/thumbnail/:uid', () => {
  it('serves the thumbnail with an image content type', async () => {
    const uid = seed()
    const ev = event({ params: { uid } })

    const stream = await handlers.thumbnail(ev)
    expect(ev.headers['content-type']).toBe('image/jpeg')
    expect((await collect(stream as unknown as Readable)).toString()).toBe('jpeg-bytes')
  })

  it('answers 404 without a thumbnail, for a missing image and for an unknown uid', async () => {
    const without = seed({ thumbnailPath: null })
    expect(
      (await expectHttpError(handlers.thumbnail(event({ params: { uid: without } })))).statusCode,
    ).toBe(404)

    const missing = seed({ thumbnailPath: 'video/gone.jpg' })
    expect(
      (await expectHttpError(handlers.thumbnail(event({ params: { uid: missing } })))).statusCode,
    ).toBe(404)

    expect(
      (await expectHttpError(handlers.thumbnail(event({ params: { uid: 'nope' } })))).statusCode,
    ).toBe(404)
  })
})
