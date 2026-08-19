import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type Db } from '@fetcharr/db'

import { postProcess, postProcessSettings } from '../src/postprocess.ts'

const FAKE_FFMPEG = fileURLToPath(new URL('./fixtures/fake-ffmpeg.sh', import.meta.url))

const INFO = {
  id: 'abc123',
  title: 'Test Video',
  description: 'A short description',
  uploader: 'Test Channel',
  upload_date: '20260101',
  duration: 185,
}

let dir: string
let logPath: string

function media(name = 'Test Video [abc123].mp4'): string {
  const path = join(dir, name)
  writeFileSync(path, 'video-bytes')
  return path
}

function thumbnail(name: string): string {
  const path = join(dir, name)
  writeFileSync(path, 'thumb-bytes')
  return path
}

function ffmpegCalls(): string[] {
  return existsSync(logPath)
    ? readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
    : []
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    writeNfo: true,
    writeThumbnails: true,
    ffmpeg: FAKE_FFMPEG,
    env: { FAKE_FFMPEG_LOG: logPath },
    ...overrides,
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fetcharr-post-'))
  logPath = join(dir, 'ffmpeg.log')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('postProcess — nfo', () => {
  it('writes the nfo next to the media file when write_nfo is on', async () => {
    const path = media()

    const result = await postProcess(
      { mediaPath: path, thumbnailPath: null, info: INFO, options: {}, durationSec: 185 },
      deps(),
    )

    expect(result.nfoPath).toBe(join(dir, 'Test Video [abc123].nfo'))
    expect(readFileSync(result.nfoPath!, 'utf8')).toContain('<studio>Test Channel</studio>')
  })

  it('writes no nfo when write_nfo is off', async () => {
    const path = media()

    const result = await postProcess(
      { mediaPath: path, thumbnailPath: null, info: INFO, options: {}, durationSec: 185 },
      deps({ writeNfo: false }),
    )

    expect(result.nfoPath).toBeNull()
    expect(existsSync(join(dir, 'Test Video [abc123].nfo'))).toBe(false)
  })

  it('writes no nfo when the download produced no info json', async () => {
    const path = media()

    const result = await postProcess(
      { mediaPath: path, thumbnailPath: null, info: null, options: {}, durationSec: null },
      deps(),
    )

    expect(result.nfoPath).toBeNull()
  })
})

describe('postProcess — thumbnails', () => {
  it('converts a webp thumbnail to jpg and reports the jpg path', async () => {
    const path = media()
    const webp = thumbnail('Test Video [abc123].webp')

    const result = await postProcess(
      { mediaPath: path, thumbnailPath: webp, info: INFO, options: {}, durationSec: 185 },
      deps(),
    )

    const jpg = join(dir, 'Test Video [abc123].jpg')
    expect(result.thumbnailPath).toBe(jpg)
    expect(existsSync(jpg)).toBe(true)
    expect(existsSync(webp)).toBe(false)
    expect(ffmpegCalls()[0]).toContain(webp)
    expect(ffmpegCalls()[0]).toContain(jpg)
  })

  it('leaves a jpg thumbnail alone and calls no ffmpeg', async () => {
    const path = media()
    const jpg = thumbnail('Test Video [abc123].jpg')

    const result = await postProcess(
      { mediaPath: path, thumbnailPath: jpg, info: INFO, options: {}, durationSec: 185 },
      deps(),
    )

    expect(result.thumbnailPath).toBe(jpg)
    expect(readFileSync(jpg, 'utf8')).toBe('thumb-bytes')
    expect(ffmpegCalls()).toEqual([])
  })

  it('does not convert when write_thumbnails is off', async () => {
    const path = media()
    const webp = thumbnail('Test Video [abc123].webp')

    const result = await postProcess(
      { mediaPath: path, thumbnailPath: webp, info: INFO, options: {}, durationSec: 185 },
      deps({ writeThumbnails: false }),
    )

    expect(result.thumbnailPath).toBe(webp)
    expect(ffmpegCalls()).toEqual([])
  })

  it('keeps the original thumbnail when the conversion fails', async () => {
    const path = media()
    const webp = thumbnail('Test Video [abc123].webp')

    const result = await postProcess(
      { mediaPath: path, thumbnailPath: webp, info: INFO, options: {}, durationSec: 185 },
      deps({ env: { FAKE_FFMPEG_LOG: logPath, FAKE_FFMPEG_FAIL: '1' } }),
    )

    expect(result.thumbnailPath).toBe(webp)
    expect(existsSync(webp)).toBe(true)
  })
})

describe('postProcess — crop', () => {
  it('cuts the media with -ss/-to and replaces the original file', async () => {
    const path = media()

    const result = await postProcess(
      {
        mediaPath: path,
        thumbnailPath: null,
        info: INFO,
        options: { cropStart: '00:00:10', cropEnd: '00:01:00' },
        durationSec: 185,
      },
      deps(),
    )

    expect(result.mediaPath).toBe(path)
    expect(readFileSync(path, 'utf8')).toBe('ffmpeg-bytes')
    expect(result.durationSec).toBe(50)
    expect(result.sizeBytes).toBe('ffmpeg-bytes'.length)

    const call = ffmpegCalls()[0]!
    expect(call).toContain('-ss 00:00:10')
    expect(call).toContain('-to 00:01:00')
    expect(call).toContain('-c copy')
  })

  it('cuts from a start mark alone and shortens the duration accordingly', async () => {
    const path = media()

    const result = await postProcess(
      {
        mediaPath: path,
        thumbnailPath: null,
        info: INFO,
        options: { cropStart: '00:00:05' },
        durationSec: 185,
      },
      deps(),
    )

    const call = ffmpegCalls()[0]!
    expect(call).toContain('-ss 00:00:05')
    expect(call).not.toContain('-to')
    expect(result.durationSec).toBe(180)
  })

  it('cuts up to an end mark alone', async () => {
    const path = media()

    const result = await postProcess(
      {
        mediaPath: path,
        thumbnailPath: null,
        info: INFO,
        options: { cropEnd: '00:00:30' },
        durationSec: 185,
      },
      deps(),
    )

    const call = ffmpegCalls()[0]!
    expect(call).toContain('-to 00:00:30')
    expect(call).not.toContain('-ss')
    expect(result.durationSec).toBe(30)
  })

  it('keeps the untouched original when ffmpeg fails', async () => {
    const path = media()

    const result = await postProcess(
      {
        mediaPath: path,
        thumbnailPath: null,
        info: INFO,
        options: { cropStart: '00:00:10', cropEnd: '00:01:00' },
        durationSec: 185,
      },
      deps({ env: { FAKE_FFMPEG_LOG: logPath, FAKE_FFMPEG_FAIL: '1' } }),
    )

    expect(result.mediaPath).toBe(path)
    expect(readFileSync(path, 'utf8')).toBe('video-bytes')
    expect(result.durationSec).toBe(185)
    expect(existsSync(join(dir, 'Test Video [abc123].crop.mp4'))).toBe(false)
  })

  it('calls no ffmpeg without crop marks', async () => {
    const path = media()

    await postProcess(
      { mediaPath: path, thumbnailPath: null, info: INFO, options: {}, durationSec: 185 },
      deps(),
    )

    expect(ffmpegCalls()).toEqual([])
  })
})

describe('postProcessSettings', () => {
  let db: Db

  beforeEach(() => {
    db = createDb(':memory:')
  })

  afterEach(() => {
    db.$client.close()
  })

  it('defaults both writers to on', () => {
    expect(postProcessSettings(db)).toEqual({ writeNfo: true, writeThumbnails: true })
  })

  it('reads the settings table', () => {
    const set = db.$client.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
    set.run('write_nfo', 'false')
    set.run('write_thumbnails', 'false')

    expect(postProcessSettings(db)).toEqual({ writeNfo: false, writeThumbnails: false })
  })
})
