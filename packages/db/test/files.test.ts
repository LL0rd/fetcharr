import { describe, it, expect, beforeEach } from 'vitest'

import { createDb, type Db } from '../src/index.ts'
import {
  listFiles,
  getFile,
  getFilesByUids,
  deleteFile,
  setFavorite,
  registerView,
} from '../src/files.ts'

let db: Db
let counter = 0

beforeEach(() => {
  db = createDb(':memory:')
  counter = 0
})

interface SeedInput {
  uid?: string
  title?: string
  uploader?: string | null
  type?: 'video' | 'audio'
  path?: string
  sizeBytes?: number | null
  favorite?: boolean
  thumbnailPath?: string | null
  info?: Record<string, unknown> | null
  ageSeconds?: number
}

/** Legt eine Datei direkt per SQL an — das Repository selbst schreibt keine Zeilen. */
function seed(input: SeedInput = {}): string {
  const uid = input.uid ?? `file-${++counter}`
  db.$client
    .prepare(
      `INSERT INTO files (uid, url, title, uploader, type, path, size_bytes, duration_sec,
                          thumbnail_path, upload_date, info_json, favorite, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch() - ?)`,
    )
    .run(
      uid,
      `https://example.com/${uid}`,
      input.title ?? `Title ${uid}`,
      input.uploader === undefined ? 'Studio Vier' : input.uploader,
      input.type ?? 'video',
      input.path ?? `video/${uid}.mp4`,
      input.sizeBytes === undefined ? 1000 : input.sizeBytes,
      120.5,
      input.thumbnailPath === undefined ? `video/${uid}.jpg` : input.thumbnailPath,
      '20260101',
      input.info ? JSON.stringify(input.info) : null,
      input.favorite ? 1 : 0,
      input.ageSeconds ?? 0,
    )
  return uid
}

describe('listFiles', () => {
  it('returns files newest first with the total count', () => {
    const older = seed({ ageSeconds: 600 })
    const newer = seed({ ageSeconds: 10 })

    const result = listFiles(db)
    expect(result.total).toBe(2)
    expect(result.files.map((f) => f.uid)).toEqual([newer, older])
  })

  it('maps favorite to a boolean, created_at to a Date and info_json to an object', () => {
    seed({ favorite: true, info: { id: 'abc' } })

    const [file] = listFiles(db).files
    expect(file!.favorite).toBe(true)
    expect(file!.createdAt).toBeInstanceOf(Date)
    expect(file!.infoJson).toEqual({ id: 'abc' })
  })

  it('searches case-insensitively in title and uploader', () => {
    const byTitle = seed({ title: 'Modernist Design in 12 Minutes', uploader: 'Studio Vier' })
    const byUploader = seed({ title: 'Something else', uploader: 'Modernist Weekly' })
    seed({ title: 'Unrelated', uploader: 'Other' })

    expect(listFiles(db, { search: 'modernist' }).files.map((f) => f.uid).sort()).toEqual(
      [byTitle, byUploader].sort(),
    )
    expect(listFiles(db, { search: 'modernist' }).total).toBe(2)
  })

  it('escapes LIKE wildcards in the search term', () => {
    const literal = seed({ title: '100% pure' })
    seed({ title: 'nothing special' })

    expect(listFiles(db, { search: '100%' }).files.map((f) => f.uid)).toEqual([literal])
  })

  it('filters by type and by favorite', () => {
    const video = seed({ type: 'video' })
    const audio = seed({ type: 'audio', favorite: true })

    expect(listFiles(db, { type: 'audio' }).files.map((f) => f.uid)).toEqual([audio])
    expect(listFiles(db, { favorite: true }).files.map((f) => f.uid)).toEqual([audio])
    expect(listFiles(db, { favorite: false }).files.map((f) => f.uid)).toEqual([video])
  })

  it('sorts by title, size and date in both directions', () => {
    const a = seed({ title: 'alpha', sizeBytes: 300, ageSeconds: 30 })
    const b = seed({ title: 'Bravo', sizeBytes: 100, ageSeconds: 20 })
    const c = seed({ title: 'charlie', sizeBytes: 200, ageSeconds: 10 })

    expect(listFiles(db, { sort: 'title', order: 'asc' }).files.map((f) => f.uid)).toEqual([a, b, c])
    expect(listFiles(db, { sort: 'title', order: 'desc' }).files.map((f) => f.uid)).toEqual([c, b, a])
    expect(listFiles(db, { sort: 'size', order: 'desc' }).files.map((f) => f.uid)).toEqual([a, c, b])
    expect(listFiles(db, { sort: 'date', order: 'asc' }).files.map((f) => f.uid)).toEqual([a, b, c])
  })

  it('paginates with limit and offset while total stays the full match count', () => {
    const uids = [
      seed({ title: 'a', ageSeconds: 30 }),
      seed({ title: 'b', ageSeconds: 20 }),
      seed({ title: 'c', ageSeconds: 10 }),
    ]

    const page = listFiles(db, { sort: 'title', order: 'asc', limit: 2, offset: 1 })
    expect(page.files.map((f) => f.uid)).toEqual([uids[1], uids[2]])
    expect(page.total).toBe(3)
  })
})

describe('getFile', () => {
  it('returns the row or null', () => {
    const uid = seed({ title: 'Clip' })
    expect(getFile(db, uid)).toMatchObject({ uid, title: 'Clip' })
    expect(getFile(db, 'nope')).toBeNull()
  })
})

describe('getFilesByUids', () => {
  it('returns the requested rows and silently skips unknown uids', () => {
    const first = seed()
    const second = seed()

    const files = getFilesByUids(db, [second, 'missing', first])
    expect(files.map((f) => f.uid).sort()).toEqual([first, second].sort())
  })

  it('returns an empty array for an empty uid list', () => {
    seed()
    expect(getFilesByUids(db, [])).toEqual([])
  })
})

describe('deleteFile', () => {
  it('removes the row and returns it so the caller can unlink the media', () => {
    const uid = seed({ path: 'video/clip.mp4' })

    const deleted = deleteFile(db, uid)
    expect(deleted).toMatchObject({ uid, path: 'video/clip.mp4' })
    expect(getFile(db, uid)).toBeNull()
  })

  it('returns null for an unknown uid', () => {
    expect(deleteFile(db, 'nope')).toBeNull()
  })
})

describe('setFavorite', () => {
  it('toggles the flag in both directions', () => {
    const uid = seed()
    expect(setFavorite(db, uid, true)?.favorite).toBe(true)
    expect(setFavorite(db, uid, false)?.favorite).toBe(false)
  })

  it('returns null for an unknown uid', () => {
    expect(setFavorite(db, 'nope', true)).toBeNull()
  })
})

describe('registerView', () => {
  it('counts a view and stores the resume position', () => {
    const uid = seed()

    const first = registerView(db, uid, { positionSec: 42.5 })
    expect(first).toMatchObject({ viewCount: 1, resumePositionSec: 42.5 })

    const second = registerView(db, uid, { positionSec: 90 })
    expect(second).toMatchObject({ viewCount: 2, resumePositionSec: 90 })
  })

  it('updates the position without counting a view when countView is false', () => {
    const uid = seed()
    registerView(db, uid, { positionSec: 10 })

    const updated = registerView(db, uid, { positionSec: 30, countView: false })
    expect(updated).toMatchObject({ viewCount: 1, resumePositionSec: 30 })
  })

  it('keeps the stored position when none is given', () => {
    const uid = seed()
    registerView(db, uid, { positionSec: 12 })

    expect(registerView(db, uid)).toMatchObject({ viewCount: 2, resumePositionSec: 12 })
  })

  it('clears the position when null is passed (playback finished)', () => {
    const uid = seed()
    registerView(db, uid, { positionSec: 12 })

    expect(registerView(db, uid, { positionSec: null, countView: false })?.resumePositionSec).toBeNull()
  })

  it('returns null for an unknown uid', () => {
    expect(registerView(db, 'nope', { positionSec: 1 })).toBeNull()
  })
})
