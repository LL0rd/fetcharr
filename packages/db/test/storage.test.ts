import { describe, it, expect, beforeEach } from 'vitest'

import { createDb, type Db } from '../src/index.ts'
import {
  bytesFinishedSince,
  storageByType,
  storageBySubscription,
  storageByUploader,
  storageTotals,
} from '../src/storage.ts'

let db: Db

beforeEach(() => {
  db = createDb(':memory:')
})

interface FileSeed {
  uid: string
  uploader?: string | null
  type?: 'video' | 'audio'
  sizeBytes?: number | null
  subId?: string | null
}

function seedFile(seed: FileSeed): void {
  db.$client
    .prepare(
      `INSERT INTO files (uid, url, title, uploader, type, path, size_bytes, sub_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
    )
    .run(
      seed.uid,
      `https://example.com/${seed.uid}`,
      `Titel ${seed.uid}`,
      seed.uploader === undefined ? 'Kanal A' : seed.uploader,
      seed.type ?? 'video',
      `${seed.uid}.mp4`,
      seed.sizeBytes === undefined ? 1000 : seed.sizeBytes,
      seed.subId ?? null,
      )
}

function seedSubscription(id: string, name: string): void {
  db.$client
    .prepare(
      `INSERT INTO subscriptions (id, url, name, created_at, updated_at)
       VALUES (?, ?, ?, unixepoch(), unixepoch())`,
    )
    .run(id, `https://example.com/sub/${id}`, name)
}

function seedJob(uid: string, status: string, sizeBytes: number | null, finishedAgoSec: number | null): void {
  db.$client
    .prepare(
      `INSERT INTO jobs (uid, url, type, status, options, size_bytes, created_at, updated_at, finished_at)
       VALUES (?, ?, 'video', ?, '{}', ?, unixepoch(), unixepoch(),
               CASE WHEN ? IS NULL THEN NULL ELSE unixepoch() - ? END)`,
    )
    .run(uid, `https://example.com/${uid}`, status, sizeBytes, finishedAgoSec, finishedAgoSec)
}

describe('storageTotals', () => {
  it('zählt Dateien und summiert die Größen', () => {
    seedFile({ uid: 'a', sizeBytes: 1500 })
    seedFile({ uid: 'b', sizeBytes: 500 })

    expect(storageTotals(db)).toEqual({ files: 2, sizeBytes: 2000 })
  })

  it('behandelt eine leere Bibliothek als Null statt als null', () => {
    expect(storageTotals(db)).toEqual({ files: 0, sizeBytes: 0 })
  })

  it('ignoriert Dateien ohne bekannte Größe in der Summe', () => {
    seedFile({ uid: 'a', sizeBytes: 700 })
    seedFile({ uid: 'b', sizeBytes: null })

    expect(storageTotals(db)).toEqual({ files: 2, sizeBytes: 700 })
  })
})

describe('storageByUploader', () => {
  it('gruppiert nach Kanal, größte Gruppe zuerst', () => {
    seedFile({ uid: 'a', uploader: 'Klein', sizeBytes: 100 })
    seedFile({ uid: 'b', uploader: 'Groß', sizeBytes: 900 })
    seedFile({ uid: 'c', uploader: 'Groß', sizeBytes: 100 })

    expect(storageByUploader(db)).toEqual([
      { key: 'Groß', name: 'Groß', sizeBytes: 1000, files: 2 },
      { key: 'Klein', name: 'Klein', sizeBytes: 100, files: 1 },
    ])
  })

  it('fasst Dateien ohne Kanal unter einem sprechenden Namen zusammen', () => {
    seedFile({ uid: 'a', uploader: null, sizeBytes: 50 })

    expect(storageByUploader(db)).toEqual([
      { key: '', name: 'Unknown channel', sizeBytes: 50, files: 1 },
    ])
  })
})

describe('storageBySubscription', () => {
  it('nimmt den Namen aus der subscriptions-Tabelle', () => {
    seedSubscription('sub1', 'Vintage Computing')
    seedFile({ uid: 'a', subId: 'sub1', sizeBytes: 400 })
    seedFile({ uid: 'b', subId: 'sub1', sizeBytes: 200 })

    expect(storageBySubscription(db)).toEqual([
      { key: 'sub1', name: 'Vintage Computing', sizeBytes: 600, files: 2 },
    ])
  })

  it('gruppiert Dateien ohne Subscription separat', () => {
    seedSubscription('sub1', 'Vintage Computing')
    seedFile({ uid: 'a', subId: 'sub1', sizeBytes: 100 })
    seedFile({ uid: 'b', subId: null, sizeBytes: 900 })

    expect(storageBySubscription(db)).toEqual([
      { key: '', name: 'No subscription', sizeBytes: 900, files: 1 },
      { key: 'sub1', name: 'Vintage Computing', sizeBytes: 100, files: 1 },
    ])
  })

  it('fällt auf die id zurück, wenn die Subscription gelöscht wurde', () => {
    seedFile({ uid: 'a', subId: 'weg', sizeBytes: 100 })

    expect(storageBySubscription(db)).toEqual([
      { key: 'weg', name: 'weg', sizeBytes: 100, files: 1 },
    ])
  })
})

describe('storageByType', () => {
  it('trennt Video und Audio', () => {
    seedFile({ uid: 'a', type: 'video', sizeBytes: 800 })
    seedFile({ uid: 'b', type: 'audio', sizeBytes: 100 })
    seedFile({ uid: 'c', type: 'audio', sizeBytes: 100 })

    expect(storageByType(db)).toEqual([
      { key: 'video', name: 'Video', sizeBytes: 800, files: 1 },
      { key: 'audio', name: 'Audio', sizeBytes: 200, files: 2 },
    ])
  })

  it('liefert für eine leere Bibliothek keine Zeilen', () => {
    expect(storageByType(db)).toEqual([])
  })
})

describe('bytesFinishedSince', () => {
  it('summiert nur fertige Jobs ab dem Zeitpunkt', () => {
    seedJob('frisch', 'finished', 500, 60)
    seedJob('alt', 'finished', 900, 7200)
    seedJob('laufend', 'running', 400, null)
    seedJob('fehler', 'errored', 300, 60)

    const since = new Date(Date.now() - 3600 * 1000)

    expect(bytesFinishedSince(db, since)).toBe(500)
  })

  it('liefert 0 statt null, wenn nichts passt', () => {
    expect(bytesFinishedSince(db, new Date())).toBe(0)
  })
})
