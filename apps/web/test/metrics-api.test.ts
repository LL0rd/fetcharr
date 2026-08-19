import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Db } from '@fetcharr/db'

import { setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<string>

let db: Db
let metrics: Handler
let headers: Record<string, string>

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())
  headers = {}
  vi.stubGlobal('setHeader', (_event: TestEvent, name: string, value: string) => {
    headers[name] = value
  })
  metrics = (await import('../server/routes/metrics.get.ts')).default as Handler
})

function seedJob(uid: string, status: string, sizeBytes: number | null = null): void {
  db.$client
    .prepare(
      `INSERT INTO jobs (uid, url, type, status, options, size_bytes, created_at, updated_at)
       VALUES (?, ?, 'video', ?, '{}', ?, unixepoch(), unixepoch())`,
    )
    .run(uid, `https://example.com/${uid}`, status, sizeBytes)
}

function seedFile(uid: string, sizeBytes: number, subId: string | null = null): void {
  db.$client
    .prepare(
      `INSERT INTO files (uid, url, title, type, path, size_bytes, sub_id, created_at)
       VALUES (?, ?, ?, 'video', ?, ?, ?, unixepoch())`,
    )
    .run(uid, `https://example.com/${uid}`, `Titel ${uid}`, `${uid}.mp4`, sizeBytes, subId)
}

function setHeartbeat(secondsAgo: number): void {
  db.$client
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('worker_heartbeat', CAST(unixepoch() - ? AS TEXT))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(secondsAgo)
}

function sample(text: string, name: string): string | undefined {
  return text.split('\n').find(line => line.startsWith(name) && !line.startsWith('#'))
}

describe('metrics endpoint', () => {
  it('antwortet im Prometheus-Textformat', async () => {
    const text = await metrics({})

    expect(headers['content-type']).toContain('text/plain')
    expect(text).toContain('# HELP fetcharr_jobs')
    expect(text).toContain('# TYPE fetcharr_jobs gauge')
  })

  it('zählt Jobs je Status', async () => {
    seedJob('a', 'queued')
    seedJob('b', 'queued')
    seedJob('c', 'running')

    const text = await metrics({})

    expect(sample(text, 'fetcharr_jobs{status="queued"}')).toBe('fetcharr_jobs{status="queued"} 2')
    expect(sample(text, 'fetcharr_jobs{status="running"}')).toBe('fetcharr_jobs{status="running"} 1')
  })

  it('meldet auch Status ohne Jobs mit 0', async () => {
    const text = await metrics({})

    expect(sample(text, 'fetcharr_jobs{status="errored"}')).toBe('fetcharr_jobs{status="errored"} 0')
  })

  it('zählt fertige und fehlgeschlagene Downloads', async () => {
    seedJob('a', 'finished', 100)
    seedJob('b', 'finished', 200)
    seedJob('c', 'errored')

    const text = await metrics({})

    expect(sample(text, 'fetcharr_downloads_total{status="finished"}')).toContain(' 2')
    expect(sample(text, 'fetcharr_downloads_total{status="errored"}')).toContain(' 1')
    expect(sample(text, 'fetcharr_bytes_downloaded_total')).toBe('fetcharr_bytes_downloaded_total 300')
  })

  it('zählt Dateien und den Speicher je Subscription', async () => {
    db.$client
      .prepare(
        `INSERT INTO subscriptions (id, url, name, created_at, updated_at)
         VALUES ('s1', 'https://example.com/s1', 'Retro', unixepoch(), unixepoch())`,
      )
      .run()
    seedFile('a', 500, 's1')
    seedFile('b', 100, null)

    const text = await metrics({})

    expect(sample(text, 'fetcharr_files_total')).toBe('fetcharr_files_total 2')
    expect(sample(text, 'fetcharr_storage_bytes{subscription="Retro"}')).toContain(' 500')
    expect(sample(text, 'fetcharr_storage_bytes{subscription="No subscription"}')).toContain(' 100')
  })

  it('leitet worker_up aus dem Heartbeat ab', async () => {
    expect(sample(await metrics({}), 'fetcharr_worker_up')).toBe('fetcharr_worker_up 0')

    setHeartbeat(1)
    expect(sample(await metrics({}), 'fetcharr_worker_up')).toBe('fetcharr_worker_up 1')

    setHeartbeat(60)
    expect(sample(await metrics({}), 'fetcharr_worker_up')).toBe('fetcharr_worker_up 0')
  })

  it('meldet Versionen als info-Metrik', async () => {
    db.$client
      .prepare(`INSERT INTO settings (key, value) VALUES ('ytdlp_version', '"2026.08.01"')`)
      .run()

    const line = sample(await metrics({}), 'fetcharr_info')

    expect(line).toContain('ytdlp="2026.08.01"')
    expect(line).toMatch(/version="[^"]+"/)
    expect(line?.endsWith(' 1')).toBe(true)
  })

  it('bleibt über mehrere Abrufe konsistent statt Labels zu verdoppeln', async () => {
    seedJob('a', 'queued')
    await metrics({})
    const text = await metrics({})

    const lines = text.split('\n').filter(line => line.startsWith('fetcharr_jobs{status="queued"}'))
    expect(lines).toEqual(['fetcharr_jobs{status="queued"} 1'])
  })
})

describe('auth middleware', () => {
  it('lässt /metrics ohne Authentifizierung durch', async () => {
    const { isProtectedPath } = await import('../server/middleware/auth.ts')

    expect(isProtectedPath('/metrics')).toBe(false)
  })
})
