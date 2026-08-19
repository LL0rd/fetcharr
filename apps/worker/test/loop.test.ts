import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, createJob, getJob, type Db } from '@fetcharr/db'
import { startLoop, type WorkerLoop } from '../src/loop.ts'
import type { DownloadHandle, DownloadResult, RunDownloadOptions } from '../src/runner.ts'

interface FakeRun {
  options: RunDownloadOptions
  aborted: boolean
  handle: DownloadHandle
  finish(result: DownloadResult): void
}

function fakeRunner() {
  const runs: FakeRun[] = []

  const run = (options: RunDownloadOptions): DownloadHandle => {
    let settle!: (result: DownloadResult) => void
    const result = new Promise<DownloadResult>((resolve) => {
      settle = resolve
    })

    const entry: FakeRun = {
      options,
      aborted: false,
      finish: (value) => settle(value),
      handle: {
        pid: 4242,
        abort() {
          entry.aborted = true
          settle({ status: 'cancelled', stderr: '' })
        },
        result,
      },
    }
    runs.push(entry)
    return entry.handle
  }

  return { runs, run, byUid: (uid: string) => runs.find((entry) => entry.options.job.uid === uid) }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

const FAST = { pollMs: 5, cancelCheckMs: 5, heartbeatMs: 5, progressThrottleMs: 0 }

const INFO = {
  id: 'abc123',
  title: 'Test Video',
  uploader: 'Test Channel',
  duration: 42.5,
  upload_date: '20260101',
}

function queue(db: Db, url = 'https://example.com/a') {
  return createJob(db, { url, type: 'video', options: { format: 'best', sponsorblock: 'off' } })
}

function setting(db: Db, key: string): unknown {
  const row = db.$client.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? JSON.parse(row.value) : undefined
}

let db: Db
let loop: WorkerLoop | null

beforeEach(() => {
  db = createDb(':memory:')
  loop = null
})

afterEach(async () => {
  await loop?.stop()
  db.$client.close()
})

describe('startLoop', () => {
  it('runs at most maxConcurrent jobs, defaulting to 3', async () => {
    for (let index = 0; index < 5; index += 1) queue(db, `https://example.com/${index}`)
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })

    await waitFor(() => runner.runs.length === 3)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(runner.runs.length).toBe(3)
  })

  it('honours max_concurrent_downloads from the settings table', async () => {
    db.$client.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
      'max_concurrent_downloads',
      '1',
    )
    for (let index = 0; index < 3; index += 1) queue(db, `https://example.com/${index}`)
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })

    await waitFor(() => runner.runs.length === 1)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(runner.runs.length).toBe(1)
  })

  it('writes title and uploader back as soon as the info json arrives', async () => {
    const job = queue(db)
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.options.onInfo?.({ title: 'Test Video', uploader: 'Test Channel', info: INFO })

    await waitFor(() => getJob(db, job.uid)?.title === 'Test Video')
    expect(getJob(db, job.uid)?.uploader).toBe('Test Channel')
  })

  it('stores progress updates on the job', async () => {
    const job = queue(db)
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.options.onProgress?.({
      pct: 42,
      speed: '1.00MiB/s',
      eta: '00:10',
      sizeBytes: 1024,
    })

    await waitFor(() => getJob(db, job.uid)?.progressPct === 42)
    expect(getJob(db, job.uid)?.progressSpeed).toBe('1.00MiB/s')
  })

  it('finishes the job and registers the file on success', async () => {
    const job = queue(db)
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.finish({
      status: 'finished',
      path: '/downloads/video/Test Channel/Test Video [abc123].mp4',
      thumbnailPath: '/downloads/video/Test Channel/Test Video [abc123].jpg',
      info: INFO,
      sizeBytes: 12345,
    })

    await waitFor(() => getJob(db, job.uid)?.status === 'finished')

    const file = db.$client.prepare('SELECT * FROM files WHERE uid = ?').get(job.uid) as
      | Record<string, unknown>
      | undefined
    expect(file).toBeDefined()
    expect(file!.title).toBe('Test Video')
    expect(file!.uploader).toBe('Test Channel')
    expect(file!.path).toBe('/downloads/video/Test Channel/Test Video [abc123].mp4')
    expect(file!.duration_sec).toBe(42.5)
    expect(file!.upload_date).toBe('20260101')
    expect(file!.thumbnail_path).toBe('/downloads/video/Test Channel/Test Video [abc123].jpg')
    expect(file!.size_bytes).toBe(12345)
  })

  it('errors the job and keeps stderr when the last attempt fails', async () => {
    const job = createJob(db, {
      url: 'https://example.com/a',
      type: 'video',
      options: { format: 'best', sponsorblock: 'off' },
      maxAttempts: 1,
    })
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.finish({ status: 'failed', stderr: 'ERROR: Video unavailable', exitCode: 1 })

    await waitFor(() => getJob(db, job.uid)?.status === 'errored')
    expect(getJob(db, job.uid)?.stderr).toContain('Video unavailable')
  })

  it('requeues a failed job while attempts are left, so the loop picks it up again', async () => {
    const job = queue(db)
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.finish({ status: 'failed', stderr: 'ERROR: temporary glitch', exitCode: 1 })

    await waitFor(() => runner.runs.length === 2)
    expect(runner.runs[1]!.options.job.uid).toBe(job.uid)
    expect(getJob(db, job.uid)?.attempts).toBe(1)
  })

  it('kills a running process once its job is cancelled in the database', async () => {
    const job = queue(db)
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    db.$client
      .prepare("UPDATE jobs SET status = 'cancelled', updated_at = unixepoch() WHERE uid = ?")
      .run(job.uid)

    await waitFor(() => runner.runs[0]!.aborted)
    expect(getJob(db, job.uid)?.status).toBe('cancelled')
  })

  it('kills running processes and requeues their jobs on shutdown', async () => {
    const job = queue(db)
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    await loop.stop()
    loop = null

    expect(runner.runs[0]!.aborted).toBe(true)
    expect(getJob(db, job.uid)?.status).toBe('queued')
  })

  it('writes a worker heartbeat into the settings table', async () => {
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })

    await waitFor(() => typeof setting(db, 'worker_heartbeat') === 'number')
    expect(setting(db, 'worker_heartbeat')).toBeGreaterThan(0)
  })
})
