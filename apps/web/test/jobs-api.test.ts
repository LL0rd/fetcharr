import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@fetcharr/db'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>

let db: Db
let handlers: Record<string, Handler>
const envBackup = { config: process.env.CONFIG_DIR, downloads: process.env.DOWNLOADS_DIR }

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())
  handlers = {
    list: (await import('../server/api/jobs/index.get.ts')).default as Handler,
    create: (await import('../server/api/jobs/index.post.ts')).default as Handler,
    clearFinished: (await import('../server/api/jobs/clear-finished.post.ts')).default as Handler,
    cancel: (await import('../server/api/jobs/[uid]/cancel.post.ts')).default as Handler,
    retry: (await import('../server/api/jobs/[uid]/retry.post.ts')).default as Handler,
    pause: (await import('../server/api/jobs/[uid]/pause.post.ts')).default as Handler,
    resume: (await import('../server/api/jobs/[uid]/resume.post.ts')).default as Handler,
    argsPreview: (await import('../server/api/args-preview.post.ts')).default as Handler,
    probe: (await import('../server/api/probe.post.ts')).default as Handler,
  }
})

afterEach(() => {
  process.env.CONFIG_DIR = envBackup.config
  process.env.DOWNLOADS_DIR = envBackup.downloads
})

async function createJobViaApi(body: Record<string, unknown> = {}): Promise<any> {
  const event: TestEvent = { body: { url: 'https://youtu.be/abc', ...body } }
  const { job } = await handlers.create(event)
  return job
}

function setStatus(uid: string, status: string, attempts = 0): void {
  db.$client
    .prepare('UPDATE jobs SET status = ?, attempts = ? WHERE uid = ?')
    .run(status, attempts, uid)
}

describe('POST /api/jobs', () => {
  it('creates a queued job and takes title/uploader from the probe result', async () => {
    const event: TestEvent = {
      body: {
        url: 'https://youtu.be/abc',
        title: 'Modernist Design in 12 Minutes',
        uploader: 'Studio Vier',
        options: { format: '1080p', sponsorblock: 'remove' },
      },
    }

    const { job } = await handlers.create(event)

    expect(event.statusCode).toBe(201)
    expect(job).toMatchObject({
      url: 'https://youtu.be/abc',
      type: 'video',
      status: 'queued',
      title: 'Modernist Design in 12 Minutes',
      uploader: 'Studio Vier',
      attempts: 0,
    })
    expect(job.options).toEqual({ format: '1080p', sponsorblock: 'remove' })
  })

  it('derives the audio type from the format', async () => {
    const job = await createJobViaApi({ options: { format: 'audio' } })
    expect(job.type).toBe('audio')
  })

  it('rejects a missing or non-http url with 400', async () => {
    const noUrl = await expectHttpError(handlers.create({ body: {} }))
    expect(noUrl.statusCode).toBe(400)

    const ftp = await expectHttpError(handlers.create({ body: { url: 'ftp://example.com/x' } }))
    expect(ftp.statusCode).toBe(400)
  })

  it('rejects invalid options with 400', async () => {
    const error = await expectHttpError(
      handlers.create({ body: { url: 'https://youtu.be/abc', options: { format: '4k' } } }),
    )

    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toBe('Invalid job options')
  })
})

describe('GET /api/jobs', () => {
  it('lists jobs newest first', async () => {
    const first = await createJobViaApi({ title: 'first' })
    const second = await createJobViaApi({ title: 'second' })

    const { jobs } = await handlers.list({})

    expect(jobs.map((job: any) => job.uid)).toEqual([second.uid, first.uid])
  })
})

describe('POST /api/jobs/:uid/cancel', () => {
  it('cancels a queued job and bumps updatedAt', async () => {
    const created = await createJobViaApi()

    const { job } = await handlers.cancel({ params: { uid: created.uid } })

    expect(job.status).toBe('cancelled')
    expect(job.updatedAt.getTime()).toBeGreaterThanOrEqual(created.createdAt.getTime())
  })

  it('cancels a running job', async () => {
    const created = await createJobViaApi()
    setStatus(created.uid, 'running')

    const { job } = await handlers.cancel({ params: { uid: created.uid } })
    expect(job.status).toBe('cancelled')
  })

  it('refuses a finished job with 409 and an unknown uid with 404', async () => {
    const created = await createJobViaApi()
    setStatus(created.uid, 'finished')

    const conflict = await expectHttpError(handlers.cancel({ params: { uid: created.uid } }))
    expect(conflict.statusCode).toBe(409)

    const missing = await expectHttpError(handlers.cancel({ params: { uid: 'nope' } }))
    expect(missing.statusCode).toBe(404)
  })
})

describe('POST /api/jobs/:uid/retry', () => {
  it('requeues an errored job and resets attempts', async () => {
    const created = await createJobViaApi()
    setStatus(created.uid, 'errored', 3)

    const { job } = await handlers.retry({ params: { uid: created.uid } })

    expect(job.status).toBe('queued')
    expect(job.attempts).toBe(0)
  })

  it('refuses a queued job with 409', async () => {
    const created = await createJobViaApi()

    const error = await expectHttpError(handlers.retry({ params: { uid: created.uid } }))
    expect(error.statusCode).toBe(409)
  })
})

describe('POST /api/jobs/:uid/pause and resume', () => {
  it('moves a queued job to paused and back', async () => {
    const created = await createJobViaApi()

    const paused = await handlers.pause({ params: { uid: created.uid } })
    expect(paused.job.status).toBe('paused')

    const resumed = await handlers.resume({ params: { uid: created.uid } })
    expect(resumed.job.status).toBe('queued')
  })

  it('refuses to pause a running job with 409', async () => {
    const created = await createJobViaApi()
    setStatus(created.uid, 'running')

    const error = await expectHttpError(handlers.pause({ params: { uid: created.uid } }))

    expect(error.statusCode).toBe(409)
    expect(error.statusMessage).toContain('cannot be paused')
  })

  it('refuses to resume a queued job with 409', async () => {
    const created = await createJobViaApi()

    const error = await expectHttpError(handlers.resume({ params: { uid: created.uid } }))
    expect(error.statusCode).toBe(409)
  })
})

describe('POST /api/jobs/clear-finished', () => {
  it('removes finished, errored and cancelled jobs only', async () => {
    const keep = await createJobViaApi()
    for (const status of ['finished', 'errored', 'cancelled']) {
      const job = await createJobViaApi()
      setStatus(job.uid, status)
    }

    const { removed } = await handlers.clearFinished({})
    const { jobs } = await handlers.list({})

    expect(removed).toBe(3)
    expect(jobs.map((job: any) => job.uid)).toEqual([keep.uid])
  })
})

describe('POST /api/args-preview', () => {
  it('builds the yt-dlp args for the given options', async () => {
    process.env.DOWNLOADS_DIR = '/data/downloads'

    const { args, command } = await handlers.argsPreview({
      body: { type: 'video', options: { format: 'best' }, url: 'https://youtu.be/abc' },
    })

    expect(args.slice(0, 4)).toEqual(['-f', 'bv*+ba/b', '--merge-output-format', 'mp4'])
    expect(args).toContain('-o')
    expect(args).toContain('/data/downloads/video/%(uploader)s/%(title)s [%(id)s].%(ext)s')
    expect(command.startsWith('yt-dlp ')).toBe(true)
    expect(command.endsWith('https://youtu.be/abc')).toBe(true)
  })

  it('applies global settings and the cookies file from the config dir', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'fetcharr-args-'))
    writeFileSync(join(configDir, 'cookies.txt'), '# netscape')
    process.env.CONFIG_DIR = configDir
    db.$client
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('rate_limit', JSON.stringify('2M'))

    const { args } = await handlers.argsPreview({ body: { options: { format: 'audio' } } })

    expect(args).toContain('-x')
    expect(args.join(' ')).toContain('-r 2M')
    expect(args.join(' ')).toContain(`--cookies ${join(configDir, 'cookies.txt')}`)
  })

  it('rejects invalid options with 400', async () => {
    const error = await expectHttpError(
      handlers.argsPreview({ body: { options: { sponsorblock: 'maybe' } } }),
    )
    expect(error.statusCode).toBe(400)
  })
})

describe('POST /api/probe', () => {
  function fakeYtdlp(output: string): string {
    const configDir = mkdtempSync(join(tmpdir(), 'fetcharr-probe-'))
    mkdirSync(join(configDir, 'bin'))
    const binary = join(configDir, 'bin', 'yt-dlp')
    writeFileSync(binary, `#!/bin/sh\ncat <<'JSON'\n${output}\nJSON\n`)
    chmodSync(binary, 0o755)
    return configDir
  }

  it('answers 503 while the worker has not fetched the binary yet', async () => {
    process.env.CONFIG_DIR = mkdtempSync(join(tmpdir(), 'fetcharr-empty-'))

    const error = await expectHttpError(handlers.probe({ body: { url: 'https://youtu.be/abc' } }))

    expect(error.statusCode).toBe(503)
    expect(error.statusMessage).toBe('Worker not ready — yt-dlp binary missing')
  })

  it('returns the metadata yt-dlp reports for a single video', async () => {
    process.env.CONFIG_DIR = fakeYtdlp(
      JSON.stringify({
        id: 'abc',
        title: 'Modernist Design in 12 Minutes',
        uploader: 'Studio Vier',
        duration: 732,
        thumbnail: 'https://img/abc.jpg',
      }),
    )

    const result = await handlers.probe({ body: { url: 'https://youtu.be/abc' } })

    expect(result).toEqual({
      url: 'https://youtu.be/abc',
      id: 'abc',
      title: 'Modernist Design in 12 Minutes',
      uploader: 'Studio Vier',
      duration: 732,
      thumbnail: 'https://img/abc.jpg',
      isPlaylist: false,
      entryCount: null,
    })
  })

  it('reports playlists with their entry count', async () => {
    process.env.CONFIG_DIR = fakeYtdlp(
      JSON.stringify({
        _type: 'playlist',
        id: 'PL1',
        title: 'Season 1',
        channel: 'Studio Vier',
        entries: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      }),
    )

    const result = await handlers.probe({ body: { url: 'https://youtube.com/playlist?list=PL1' } })

    expect(result.isPlaylist).toBe(true)
    expect(result.entryCount).toBe(3)
    expect(result.uploader).toBe('Studio Vier')
  })

  it('rejects a request without a url', async () => {
    const error = await expectHttpError(handlers.probe({ body: {} }))
    expect(error.statusCode).toBe(400)
  })
})
