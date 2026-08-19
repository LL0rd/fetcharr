import { describe, it, expect, beforeEach } from 'vitest'

import { createDb, type Db } from '../src/index.ts'
import {
  clearFiles,
  countFiles,
  listDuplicateFileGroups,
  listFilePaths,
  listFilesForMaintenance,
  listFilesOlderThan,
} from '../src/maintenance.ts'

let db: Db

beforeEach(() => {
  db = createDb(':memory:')
})

interface FileSeed {
  uid: string
  url?: string
  path?: string
  favorite?: boolean
  subId?: string | null
  ageDays?: number
}

function seedFile(seed: FileSeed): void {
  db.$client
    .prepare(
      `INSERT INTO files (uid, url, title, type, path, favorite, sub_id, created_at)
       VALUES (?, ?, ?, 'video', ?, ?, ?, unixepoch() - ?)`,
    )
    .run(
      seed.uid,
      seed.url ?? `https://example.com/${seed.uid}`,
      `Titel ${seed.uid}`,
      seed.path ?? `${seed.uid}.mp4`,
      seed.favorite ? 1 : 0,
      seed.subId ?? null,
      (seed.ageDays ?? 0) * 86_400,
    )
}

describe('listFilesForMaintenance', () => {
  it('liefert alle Dateien mit den für Wartung nötigen Feldern', () => {
    seedFile({ uid: 'a', favorite: true, subId: 'sub1' })
    seedFile({ uid: 'b' })

    const files = listFilesForMaintenance(db)
    expect(files).toHaveLength(2)
    expect(files[0]).toMatchObject({
      uid: 'a',
      path: 'a.mp4',
      favorite: true,
      subId: 'sub1',
      title: 'Titel a',
    })
    expect(files[0]!.createdAt).toBeInstanceOf(Date)
  })
})

describe('listFilePaths', () => {
  it('liefert die bekannten Pfade', () => {
    seedFile({ uid: 'a', path: 'Kanal/a.mp4' })
    seedFile({ uid: 'b', path: 'b.mp4' })

    expect(listFilePaths(db).sort()).toEqual(['Kanal/a.mp4', 'b.mp4'])
  })
})

describe('listDuplicateFileGroups', () => {
  it('gruppiert mehrfach vorhandene URLs, ältester Eintrag zuerst', () => {
    seedFile({ uid: 'alt', url: 'https://example.com/x', ageDays: 3 })
    seedFile({ uid: 'neu', url: 'https://example.com/x', ageDays: 1 })
    seedFile({ uid: 'neuer', url: 'https://example.com/x' })
    seedFile({ uid: 'einzeln', url: 'https://example.com/y' })

    const groups = listDuplicateFileGroups(db)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.url).toBe('https://example.com/x')
    expect(groups[0]!.files.map((file) => file.uid)).toEqual(['alt', 'neu', 'neuer'])
  })
})

describe('listFilesOlderThan', () => {
  beforeEach(() => {
    seedFile({ uid: 'alt', ageDays: 40 })
    seedFile({ uid: 'alt-fav', ageDays: 40, favorite: true })
    seedFile({ uid: 'alt-sub', ageDays: 40, subId: 'sub1' })
    seedFile({ uid: 'neu', ageDays: 2 })
  })

  it('schont Favoriten und Subscription-Dateien per Default', () => {
    const files = listFilesOlderThan(db, 30)
    expect(files.map((file) => file.uid)).toEqual(['alt'])
  })

  it('nimmt Favoriten und Subscriptions auf Wunsch mit', () => {
    const files = listFilesOlderThan(db, 30, { keepFavorites: false, keepSubscriptions: false })
    expect(files.map((file) => file.uid).sort()).toEqual(['alt', 'alt-fav', 'alt-sub'])
  })
})

describe('clearFiles', () => {
  it('leert die Tabelle und meldet die Anzahl', () => {
    seedFile({ uid: 'a' })
    seedFile({ uid: 'b' })

    expect(countFiles(db)).toBe(2)
    expect(clearFiles(db)).toBe(2)
    expect(countFiles(db)).toBe(0)
  })
})
