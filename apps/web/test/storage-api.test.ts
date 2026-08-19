import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@fetcharr/db'

import { setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>

let db: Db
let storage: Handler

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())
  process.env.DOWNLOADS_DIR = process.cwd()
  storage = (await import('../server/api/storage.get.ts')).default as Handler
})

function seedFile(
  uid: string,
  options: {
    uploader?: string | null
    type?: 'video' | 'audio'
    sizeBytes?: number
    subId?: string | null
  } = {},
): void {
  db.$client
    .prepare(
      `INSERT INTO files (uid, url, title, uploader, type, path, size_bytes, sub_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    )
    .run(
      uid,
      `https://example.com/${uid}`,
      `Titel ${uid}`,
      options.uploader === undefined ? 'Kanal A' : options.uploader,
      options.type ?? 'video',
      `${uid}.mp4`,
      options.sizeBytes ?? 1000,
      options.subId ?? null,
    )
}

function seedFinishedJob(uid: string, sizeBytes: number, finishedAgoSec: number): void {
  db.$client
    .prepare(
      `INSERT INTO jobs (uid, url, type, status, options, size_bytes, created_at, updated_at, finished_at)
       VALUES (?, ?, 'video', 'finished', '{}', ?, unixepoch(), unixepoch(), unixepoch() - ?)`,
    )
    .run(uid, `https://example.com/${uid}`, sizeBytes, finishedAgoSec)
}

describe('storage endpoint', () => {
  it('gruppiert per Default nach Kanal', async () => {
    seedFile('a', { uploader: 'Kanal A', sizeBytes: 300 })
    seedFile('b', { uploader: 'Kanal B', sizeBytes: 100 })

    const result = await storage({})

    expect(result.by).toBe('channel')
    expect(result.rows.map((row: any) => row.name)).toEqual(['Kanal A', 'Kanal B'])
    expect(result.totals.files).toBe(2)
  })

  it('rechnet den Anteil jeder Zeile in Prozent aus', async () => {
    seedFile('a', { uploader: 'Kanal A', sizeBytes: 750 })
    seedFile('b', { uploader: 'Kanal B', sizeBytes: 250 })

    const { rows } = await storage({})

    expect(rows[0]).toMatchObject({ name: 'Kanal A', sizeBytes: 750, files: 1, pct: 75 })
    expect(rows[1].pct).toBe(25)
  })

  it('gruppiert auf Wunsch nach Subscription', async () => {
    db.$client
      .prepare(
        `INSERT INTO subscriptions (id, url, name, created_at, updated_at)
         VALUES ('s1', 'https://example.com/s1', 'Retro', unixepoch(), unixepoch())`,
      )
      .run()
    seedFile('a', { subId: 's1', sizeBytes: 500 })

    const result = await storage({ query: { by: 'subscription' } })

    expect(result.by).toBe('subscription')
    expect(result.rows).toEqual([
      { key: 's1', name: 'Retro', sizeBytes: 500, files: 1, pct: 100 },
    ])
  })

  it('gruppiert auf Wunsch nach Typ', async () => {
    seedFile('a', { type: 'video', sizeBytes: 800 })
    seedFile('b', { type: 'audio', sizeBytes: 200 })

    const result = await storage({ query: { by: 'type' } })

    expect(result.by).toBe('type')
    expect(result.rows.map((row: any) => row.name)).toEqual(['Video', 'Audio'])
  })

  it('fällt bei unbekanntem by auf Kanal zurück', async () => {
    expect((await storage({ query: { by: 'quatsch' } })).by).toBe('channel')
  })

  it('zählt nur heute fertige Jobs als bytes today', async () => {
    seedFinishedJob('heute', 4096, 60)
    seedFinishedJob('vorgestern', 8192, 48 * 3600)

    expect((await storage({})).totals.bytesToday).toBe(4096)
  })

  it('liest Used und Free vom Dateisystem des Download-Verzeichnisses', async () => {
    const { totals } = await storage({})

    expect(totals.usedBytes).toBeGreaterThan(0)
    expect(totals.freeBytes).toBeGreaterThan(0)
  })

  it('fällt auf die Bibliotheksgröße zurück, wenn das Verzeichnis fehlt', async () => {
    process.env.DOWNLOADS_DIR = '/nicht/vorhanden/fetcharr-test'
    seedFile('a', { sizeBytes: 1234 })

    const { totals } = await storage({})

    expect(totals.usedBytes).toBe(1234)
    expect(totals.freeBytes).toBeNull()
  })

  it('liefert für eine leere Bibliothek keine Zeilen', async () => {
    const result = await storage({})

    expect(result.rows).toEqual([])
    expect(result.totals.files).toBe(0)
    expect(result.totals.librarySizeBytes).toBe(0)
  })
})
