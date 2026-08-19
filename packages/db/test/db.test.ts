import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createDb } from '../src/index.ts'
import { files, jobs } from '../src/schema.ts'

const tmpDirs: string[] = []

function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fetcharr-db-'))
  tmpDirs.push(dir)
  return join(dir, 'fetcharr.db')
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  }
})

describe('createDb', () => {
  it('opens an in-memory db and runs migrations', () => {
    const db = createDb(':memory:')
    for (const table of ['settings', 'auth', 'jobs', 'files']) {
      const row = db.$client
        .prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?')
        .get('table', table)
      expect(row, `table ${table} missing`).toBeTruthy()
    }
  })

  it('leaves an in-memory db on the default journal mode', () => {
    const db = createDb(':memory:')
    const mode = db.$client.pragma('journal_mode', { simple: true })
    expect(String(mode).toLowerCase()).not.toBe('wal')
  })

  it('enables WAL and a busy timeout on file dbs', () => {
    const db = createDb(tmpDbPath())
    expect(String(db.$client.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal')
    expect(db.$client.pragma('busy_timeout', { simple: true })).toBe(5000)
  })

  it('round-trips a job through the drizzle schema', () => {
    const db = createDb(':memory:')
    const now = new Date(1_755_600_000_000)
    db.insert(jobs)
      .values({
        uid: 'job-1',
        url: 'https://example.com/watch?v=1',
        type: 'video',
        options: { format: 'best' },
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const [row] = db.select().from(jobs).all()
    expect(row).toMatchObject({
      uid: 'job-1',
      status: 'queued',
      priority: 0,
      progressPct: 0,
      attempts: 0,
      maxAttempts: 3,
      options: { format: 'best' },
    })
    expect(row!.createdAt.getTime()).toBe(now.getTime())
  })

  it('stores files with boolean and json columns', () => {
    const db = createDb(':memory:')
    db.insert(files)
      .values({
        uid: 'file-1',
        url: 'https://example.com/watch?v=1',
        title: 'Clip',
        type: 'audio',
        path: 'audio/Clip.mp3',
        infoJson: { id: '1' },
        createdAt: new Date(1_755_600_000_000),
      })
      .run()

    const [row] = db.select().from(files).all()
    expect(row).toMatchObject({ favorite: false, viewCount: 0, infoJson: { id: '1' } })
  })
})
