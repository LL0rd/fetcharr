import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runDownload, type RunnerJob } from '../src/runner.ts'
import type { ProgressUpdate } from '../src/progress.ts'

const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-ytdlp.sh', import.meta.url))

let downloadsDir: string

const job: RunnerJob = {
  uid: 'job-1',
  url: 'https://example.com/watch?v=abc123',
  type: 'video',
  options: { format: 'best', sponsorblock: 'off' },
}

beforeEach(() => {
  downloadsDir = mkdtempSync(join(tmpdir(), 'fetcharr-runner-'))
})

afterEach(() => {
  rmSync(downloadsDir, { recursive: true, force: true })
})

describe('runDownload', () => {
  it('reports the info json as soon as it arrives on stdout', async () => {
    const seen: Array<{ title: string | null; uploader: string | null }> = []

    const handle = runDownload({
      job,
      downloadsDir,
      binary: FAKE_YTDLP,
      onInfo: (info) => seen.push({ title: info.title, uploader: info.uploader }),
    })
    await handle.result

    expect(seen).toEqual([{ title: 'Test Video', uploader: 'Test Channel' }])
  })

  it('calls onProgress with the parsed values', async () => {
    const updates: ProgressUpdate[] = []

    const handle = runDownload({
      job,
      downloadsDir,
      binary: FAKE_YTDLP,
      onProgress: (update) => updates.push(update),
    })
    await handle.result

    expect(updates).toEqual([
      { pct: 0, speed: '1.00MiB/s', eta: '00:20', sizeBytes: 104857600 },
      { pct: 50, speed: '2.00MiB/s', eta: '00:10', sizeBytes: 104857600 },
      { pct: 100, speed: null, eta: null, sizeBytes: 104857600 },
    ])
  })

  it('moves the finished files out of the tmp staging dir into the target tree', async () => {
    const handle = runDownload({ job, downloadsDir, binary: FAKE_YTDLP })
    const result = await handle.result

    expect(result.status).toBe('finished')
    if (result.status !== 'finished') return

    const expected = join(downloadsDir, 'video', 'Test Channel', 'Test Video [abc123].mp4')
    expect(result.path).toBe(expected)
    expect(readFileSync(expected, 'utf8')).toBe('video-bytes')
    expect(result.sizeBytes).toBe(11)
    expect(result.thumbnailPath).toBe(
      join(downloadsDir, 'video', 'Test Channel', 'Test Video [abc123].jpg'),
    )
    expect(result.info?.title).toBe('Test Video')
    expect(result.info?.duration).toBe(42.5)
    expect(existsSync(join(downloadsDir, '.tmp'))).toBe(false)
  })

  it('collects stderr and cleans the tmp dir up when yt-dlp fails', async () => {
    const handle = runDownload({
      job,
      downloadsDir,
      binary: FAKE_YTDLP,
      env: { FAKE_FAIL: '1' },
    })
    const result = await handle.result

    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return

    expect(result.stderr).toContain('Video unavailable')
    expect(result.exitCode).toBe(1)
    expect(readdirSync(downloadsDir)).toEqual([])
  })

  it('reports cancelled and leaves nothing behind when aborted', async () => {
    const handle = runDownload({
      job,
      downloadsDir,
      binary: FAKE_YTDLP,
      env: { FAKE_SLEEP: '30' },
      onInfo: () => handle.abort(),
    })

    const result = await handle.result

    expect(result.status).toBe('cancelled')
    expect(readdirSync(downloadsDir)).toEqual([])
  }, 15000)
})
