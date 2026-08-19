import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDb,
  createJob,
  createSubscription,
  createSubscriptionJob,
  getJob,
  listArchive,
  type Db,
} from '@fetcharr/db'
import { startLoop, type WorkerLoop } from '../src/loop.ts'
import type { DownloadHandle, DownloadResult, RunDownloadOptions } from '../src/runner.ts'
import type { PostProcessInput } from '../src/postprocess.ts'

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
    expect(file!.path).toBe('video/Test Channel/Test Video [abc123].mp4')
    expect(file!.duration_sec).toBe(42.5)
    expect(file!.upload_date).toBe('20260101')
    expect(file!.thumbnail_path).toBe('video/Test Channel/Test Video [abc123].jpg')
    expect(file!.size_bytes).toBe(12345)
  })

  it('stores library paths relative to the downloads dir, whatever the mount point is', async () => {
    const job = queue(db)
    const runner = fakeRunner()
    const downloadsDir = '/mnt/host/media/fetcharr'

    loop = startLoop({ db, downloadsDir, run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.finish({
      status: 'finished',
      path: `${downloadsDir}/video/Test Channel/Test Video [abc123].mp4`,
      thumbnailPath: `${downloadsDir}/video/Test Channel/Test Video [abc123].jpg`,
      info: INFO,
      sizeBytes: 12345,
    })

    await waitFor(() => getJob(db, job.uid)?.status === 'finished')

    const file = db.$client.prepare('SELECT * FROM files WHERE uid = ?').get(job.uid) as Record<
      string,
      unknown
    >
    expect(file.path).toBe('video/Test Channel/Test Video [abc123].mp4')
    expect(file.thumbnail_path).toBe('video/Test Channel/Test Video [abc123].jpg')
  })

  it('runs post-processing before registering the file and stores its results', async () => {
    const job = queue(db)
    const runner = fakeRunner()
    const seen: PostProcessInput[] = []

    loop = startLoop({
      db,
      downloadsDir: '/downloads',
      run: runner.run,
      postProcess: async (input) => {
        seen.push(input)
        return {
          mediaPath: '/downloads/video/Test Channel/Test Video [abc123].mkv',
          thumbnailPath: '/downloads/video/Test Channel/Test Video [abc123].jpg',
          durationSec: 20,
          sizeBytes: 999,
          nfoPath: '/downloads/video/Test Channel/Test Video [abc123].nfo',
        }
      },
      ...FAST,
    })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.finish({
      status: 'finished',
      path: '/downloads/video/Test Channel/Test Video [abc123].mp4',
      thumbnailPath: '/downloads/video/Test Channel/Test Video [abc123].webp',
      info: INFO,
      sizeBytes: 12345,
    })

    await waitFor(() => getJob(db, job.uid)?.status === 'finished')

    expect(seen[0]?.mediaPath).toBe('/downloads/video/Test Channel/Test Video [abc123].mp4')
    expect(seen[0]?.thumbnailPath).toBe('/downloads/video/Test Channel/Test Video [abc123].webp')
    expect(seen[0]?.durationSec).toBe(42.5)

    const file = db.$client.prepare('SELECT * FROM files WHERE uid = ?').get(job.uid) as Record<
      string,
      unknown
    >
    expect(file.path).toBe('video/Test Channel/Test Video [abc123].mkv')
    expect(file.thumbnail_path).toBe('video/Test Channel/Test Video [abc123].jpg')
    expect(file.duration_sec).toBe(20)
    expect(file.size_bytes).toBe(999)
  })

  it('passes the crop marks from the job options to post-processing', async () => {
    createJob(db, {
      url: 'https://example.com/crop',
      type: 'video',
      options: { format: 'best', sponsorblock: 'off', cropStart: '00:00:10', cropEnd: '00:01:00' },
    })
    const runner = fakeRunner()
    const seen: PostProcessInput[] = []

    loop = startLoop({
      db,
      downloadsDir: '/downloads',
      run: runner.run,
      postProcess: async (input) => {
        seen.push(input)
        return {
          mediaPath: input.mediaPath,
          thumbnailPath: input.thumbnailPath,
          durationSec: input.durationSec,
          sizeBytes: input.sizeBytes ?? null,
          nfoPath: null,
        }
      },
      ...FAST,
    })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.finish({
      status: 'finished',
      path: '/downloads/video/Test Channel/Test Video [abc123].mp4',
      thumbnailPath: null,
      info: INFO,
      sizeBytes: 12345,
    })

    await waitFor(() => seen.length === 1)
    expect(seen[0]!.options.cropStart).toBe('00:00:10')
    expect(seen[0]!.options.cropEnd).toBe('00:01:00')
  })

  it('still registers the file when post-processing throws', async () => {
    const job = queue(db)
    const runner = fakeRunner()

    loop = startLoop({
      db,
      downloadsDir: '/downloads',
      run: runner.run,
      postProcess: () => Promise.reject(new Error('ffmpeg missing')),
      ...FAST,
    })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.finish({
      status: 'finished',
      path: '/downloads/video/Test Channel/Test Video [abc123].mp4',
      thumbnailPath: null,
      info: INFO,
      sizeBytes: 12345,
    })

    await waitFor(() => getJob(db, job.uid)?.status === 'finished')

    const file = db.$client.prepare('SELECT * FROM files WHERE uid = ?').get(job.uid) as Record<
      string,
      unknown
    >
    expect(file.path).toBe('video/Test Channel/Test Video [abc123].mp4')
    expect(file.size_bytes).toBe(12345)
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

    // Der Backoff hält den Job kurz zurück; der Loop greift ihn erst danach wieder.
    await waitFor(() => getJob(db, job.uid)?.status === 'queued')
    expect(getJob(db, job.uid)?.attempts).toBe(1)
    expect(getJob(db, job.uid)?.notBefore).toBeInstanceOf(Date)

    db.$client.prepare('UPDATE jobs SET not_before = NULL WHERE uid = ?').run(job.uid)
    await waitFor(() => runner.runs.length === 2)
    expect(runner.runs[1]!.options.job.uid).toBe(job.uid)
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

  it('archives a subscription download and links the file to the subscription', async () => {
    const sub = createSubscription(db, { url: 'https://youtube.com/@c', name: 'Channel' })
    const job = createSubscriptionJob(db, {
      url: 'https://youtu.be/abc123',
      type: 'video',
      options: { format: 'best', sponsorblock: 'off' },
      subId: sub.id,
    })
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.finish({
      status: 'finished',
      path: '/downloads/subscriptions/Channel/Test Video [abc123].mp4',
      thumbnailPath: null,
      info: { ...INFO, extractor_key: 'Youtube' },
      sizeBytes: 12345,
    })

    await waitFor(() => getJob(db, job.uid)?.status === 'finished')

    const { entries } = listArchive(db, { subId: sub.id })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ extractor: 'youtube', mediaId: 'abc123', subId: sub.id })

    const file = db.$client.prepare('SELECT sub_id FROM files WHERE uid = ?').get(job.uid) as {
      sub_id: string
    }
    expect(file.sub_id).toBe(sub.id)
  })

  it('keeps the archive empty when a subscription download fails', async () => {
    const sub = createSubscription(db, { url: 'https://youtube.com/@c', name: 'Channel' })
    const job = createSubscriptionJob(db, {
      url: 'https://youtu.be/abc123',
      type: 'video',
      options: { format: 'best', sponsorblock: 'off' },
      subId: sub.id,
    })
    db.$client.prepare('UPDATE jobs SET max_attempts = 1 WHERE uid = ?').run(job.uid)
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })
    await waitFor(() => runner.runs.length === 1)

    runner.runs[0]!.finish({ status: 'failed', stderr: 'ERROR: gone', exitCode: 1 })

    await waitFor(() => getJob(db, job.uid)?.status === 'errored')
    expect(listArchive(db).total).toBe(0)
  })

  it('writes a worker heartbeat into the settings table', async () => {
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })

    await waitFor(() => typeof setting(db, 'worker_heartbeat') === 'number')
    expect(setting(db, 'worker_heartbeat')).toBeGreaterThan(0)
  })
})
