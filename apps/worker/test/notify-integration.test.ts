import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDb,
  createJob,
  createSubscription,
  listNotifications,
  type Db,
  type Notification,
} from '@fetcharr/db'

import { startLoop, type WorkerLoop } from '../src/loop.ts'
import type { DownloadHandle, DownloadResult, RunDownloadOptions } from '../src/runner.ts'
import { checkSubscription } from '../src/subscriptions.ts'

/** Meldet der Worker die Ereignisse, die im Notification-Center landen sollen? */

let db: Db
let loop: WorkerLoop | null

beforeEach(() => {
  db = createDb(':memory:')
  loop = null
  // Externe Kanäle sind hier nicht konfiguriert; der Stub sichert das ab.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
})

afterEach(async () => {
  await loop?.stop()
  db.$client.close()
  vi.unstubAllGlobals()
})

const FAST = { pollMs: 5, cancelCheckMs: 5, heartbeatMs: 5, progressThrottleMs: 0 }

const INFO = { id: 'abc123', title: 'Test Video', uploader: 'Test Channel', duration: 42.5 }

function fakeRunner() {
  const runs: { finish(result: DownloadResult): void }[] = []

  const run = (_options: RunDownloadOptions): DownloadHandle => {
    let settle!: (result: DownloadResult) => void
    const result = new Promise<DownloadResult>((resolve) => {
      settle = resolve
    })
    runs.push({ finish: (value) => settle(value) })

    return { pid: 4242, abort: () => settle({ status: 'cancelled', stderr: '' }), result }
  }

  return { runs, run }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function notifications(): Notification[] {
  return listNotifications(db).notifications
}

describe('Download-Notifications aus dem Loop', () => {
  it('meldet einen fertigen Download mit Titel und Größe', async () => {
    createJob(db, { url: 'https://example.com/a', type: 'video', options: {} })
    const runner = fakeRunner()

    loop = startLoop({
      db,
      downloadsDir: '/downloads',
      run: runner.run,
      postProcess: async (input) => ({
        mediaPath: input.mediaPath,
        thumbnailPath: null,
        durationSec: input.durationSec,
        sizeBytes: input.sizeBytes ?? null,
        nfoPath: null,
      }),
      ...FAST,
    })

    await waitFor(() => runner.runs.length === 1)
    runner.runs[0]!.finish({
      status: 'finished',
      path: '/downloads/video/Test Video.mp4',
      thumbnailPath: null,
      info: INFO,
      sizeBytes: 1_048_576,
    })

    await waitFor(() => notifications().length === 1)
    expect(notifications()[0]).toMatchObject({
      type: 'download_finished',
      title: 'Download finished',
      body: "'Test Video' — 1.0 MB",
      read: false,
    })
  })

  it('meldet einen Fehlschlag samt Versuchszähler', async () => {
    createJob(db, { url: 'https://example.com/a', type: 'video', options: {} })
    const runner = fakeRunner()

    loop = startLoop({ db, downloadsDir: '/downloads', run: runner.run, ...FAST })

    await waitFor(() => runner.runs.length === 1)
    runner.runs[0]!.finish({ status: 'failed', stderr: 'HTTP Error 403' })

    await waitFor(() => notifications().length >= 1)
    expect(notifications()[0]).toMatchObject({
      type: 'download_error',
      title: 'Download failed',
      body: "'https://example.com/a' — attempt 1/3",
    })
  })

  it('meldet auch kaputte Job-Optionen als Fehlschlag', async () => {
    const job = createJob(db, { url: 'https://example.com/a', type: 'video', options: {} })
    // Die API validiert beim Anlegen — kaputte Optionen kommen nur aus einer
    // älteren DB, deshalb hier direkt in die Zeile geschrieben.
    db.$client
      .prepare('UPDATE jobs SET options = ? WHERE uid = ?')
      .run('{"format":"unsinn"}', job.uid)

    loop = startLoop({ db, downloadsDir: '/downloads', run: fakeRunner().run, ...FAST })

    await waitFor(() => notifications().length === 1)
    expect(notifications()[0]!.type).toBe('download_error')
  })
})

describe('Subscription-Notifications', () => {
  it('meldet neue Funde mit Name und Anzahl', async () => {
    const sub = createSubscription(db, { name: 'Kurzgesagt', url: 'https://youtube.com/@kurzgesagt' })

    await checkSubscription({
      db,
      sub,
      fetchEntries: async () => [
        { id: 'a1', title: 'Erstes' },
        { id: 'b2', title: 'Zweites' },
      ],
    })

    await waitFor(() => notifications().length === 1)
    expect(notifications()[0]).toMatchObject({
      type: 'subscription_found',
      title: 'Subscription found 2 new videos',
      body: 'Kurzgesagt',
      url: '/subscriptions',
    })
  })

  it('schweigt, wenn der Check nichts Neues findet', async () => {
    const sub = createSubscription(db, { name: 'Kurzgesagt', url: 'https://youtube.com/@kurzgesagt' })

    await checkSubscription({ db, sub, fetchEntries: async () => [] })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(notifications()).toHaveLength(0)
  })
})
