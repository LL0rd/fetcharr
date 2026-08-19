import { describe, it, expect, beforeEach } from 'vitest'

import {
  addArchiveEntry,
  countArchiveBySub,
  exportArchive,
  hasArchiveEntry,
  importArchive,
  listArchive,
  removeArchiveEntry,
} from '../src/archive.ts'
import { createDb, type Db } from '../src/index.ts'

let db: Db

beforeEach(() => {
  db = createDb(':memory:')
})

describe('addArchiveEntry / hasArchiveEntry', () => {
  it('legt einen Eintrag an und findet ihn wieder', () => {
    const entry = addArchiveEntry(db, {
      extractor: 'youtube',
      mediaId: 'a1',
      title: 'Folge 1',
      subId: 'sub-1',
    })

    expect(entry.id).toBeGreaterThan(0)
    expect(entry.createdAt).toBeInstanceOf(Date)
    expect(hasArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', subId: 'sub-1' })).toBe(true)
  })

  it('trennt Einträge nach Subscription', () => {
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', subId: 'sub-1' })

    expect(hasArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', subId: 'sub-2' })).toBe(false)
    expect(hasArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1' })).toBe(false)
  })

  it('vergleicht den Extractor unabhängig von Groß-/Kleinschreibung', () => {
    addArchiveEntry(db, { extractor: 'YouTube', mediaId: 'a1' })

    expect(hasArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1' })).toBe(true)
  })

  it('dedupliziert auch ohne Subscription', () => {
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1' })
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', title: 'Nachgereicht' })

    const { entries, total } = listArchive(db)
    expect(total).toBe(1)
    expect(entries[0]?.title).toBe('Nachgereicht')
  })
})

describe('listArchive', () => {
  beforeEach(() => {
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', title: 'Rakete', subId: 'sub-1' })
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'b2', title: 'Boot', subId: 'sub-2' })
    addArchiveEntry(db, { extractor: 'vimeo', mediaId: 'c3', title: 'Rakete zwei' })
  })

  it('filtert nach Subscription', () => {
    const { entries, total } = listArchive(db, { subId: 'sub-1' })

    expect(total).toBe(1)
    expect(entries[0]?.mediaId).toBe('a1')
  })

  it('sucht in Titel und media_id', () => {
    expect(listArchive(db, { search: 'rakete' }).total).toBe(2)
    expect(listArchive(db, { search: 'b2' }).total).toBe(1)
  })

  it('paginiert', () => {
    const page = listArchive(db, { limit: 2, offset: 0 })

    expect(page.entries).toHaveLength(2)
    expect(page.total).toBe(3)
  })
})

describe('removeArchiveEntry', () => {
  it('löscht per id', () => {
    const entry = addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1' })

    expect(removeArchiveEntry(db, entry.id)).toBe(true)
    expect(removeArchiveEntry(db, entry.id)).toBe(false)
    expect(hasArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1' })).toBe(false)
  })
})

describe('countArchiveBySub', () => {
  it('zählt je Subscription', () => {
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', subId: 'sub-1' })
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a2', subId: 'sub-1' })
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'b1', subId: 'sub-2' })

    expect(countArchiveBySub(db)).toEqual({ 'sub-1': 2, 'sub-2': 1 })
  })
})

describe('importArchive / exportArchive', () => {
  it('liest das yt-dlp-Archivformat', () => {
    const imported = importArchive(db, 'youtube a1\nyoutube b2\n\n# Kommentar\n', {
      subId: 'sub-1',
    })

    expect(imported).toBe(2)
    expect(hasArchiveEntry(db, { extractor: 'youtube', mediaId: 'b2', subId: 'sub-1' })).toBe(true)
  })

  it('überspringt bereits vorhandene und kaputte Zeilen', () => {
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1' })

    expect(importArchive(db, 'youtube a1\nkaputt\nvimeo c3')).toBe(1)
    expect(listArchive(db).total).toBe(2)
  })

  it('exportiert im yt-dlp-Format', () => {
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', subId: 'sub-1' })
    addArchiveEntry(db, { extractor: 'vimeo', mediaId: 'c3' })

    expect(exportArchive(db)).toBe('vimeo c3\nyoutube a1\n')
    expect(exportArchive(db, { subId: 'sub-1' })).toBe('youtube a1\n')
  })
})
