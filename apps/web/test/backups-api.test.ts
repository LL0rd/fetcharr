import { mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>

let handlers: Record<string, Handler>
let configDir: string
const envBackup = { config: process.env.CONFIG_DIR }

beforeEach(async () => {
  setupNitroGlobals()

  configDir = mkdtempSync(join(tmpdir(), 'fetcharr-backups-'))
  process.env.CONFIG_DIR = configDir

  handlers = {
    list: (await import('../server/api/backups/index.get.ts')).default as Handler,
    restore: (await import('../server/api/backups/restore.post.ts')).default as Handler,
  }
})

afterEach(() => {
  process.env.CONFIG_DIR = envBackup.config
})

/**
 * `mtime` wird explizit gesetzt: sonst tragen zwei in derselben Millisekunde
 * geschriebene Dateien dieselbe Zeit und die erwartete Reihenfolge wäre Zufall.
 */
function seedBackup(name: string, content = 'backup', mtime?: Date): void {
  mkdirSync(join(configDir, 'backups'), { recursive: true })
  const path = join(configDir, 'backups', name)
  writeFileSync(path, content)
  if (mtime) utimesSync(path, mtime, mtime)
}

describe('GET /api/backups', () => {
  it('is empty while the backup task never ran', async () => {
    const result = await handlers.list({})
    expect(result.backups).toEqual([])
    expect(result.directory).toBe(join(configDir, 'backups'))
  })

  it('lists .db files newest first and ignores everything else', async () => {
    seedBackup('fetcharr-2026-08-01.db', 'backup', new Date('2026-08-01T03:00:00Z'))
    seedBackup('fetcharr-2026-08-18.db', 'newer backup', new Date('2026-08-18T03:00:00Z'))
    seedBackup('notes.txt')

    const result = await handlers.list({})
    expect(result.backups.map((entry: any) => entry.file)).toEqual([
      'fetcharr-2026-08-18.db',
      'fetcharr-2026-08-01.db',
    ])
    expect(result.backups[0].sizeBytes).toBe('newer backup'.length)
  })

  it('falls back to the file name when two backups share their mtime', async () => {
    const sameMoment = new Date('2026-08-18T03:00:00Z')
    seedBackup('fetcharr-2026-08-18T03-00-00.db', 'backup', sameMoment)
    seedBackup('fetcharr-2026-08-18T04-00-00.db', 'backup', sameMoment)

    const result = await handlers.list({})
    expect(result.backups.map((entry: any) => entry.file)).toEqual([
      'fetcharr-2026-08-18T04-00-00.db',
      'fetcharr-2026-08-18T03-00-00.db',
    ])
  })
})

describe('POST /api/backups/restore', () => {
  it('copies the backup over the database and asks for a restart', async () => {
    seedBackup('fetcharr-2026-08-18.db', 'restored content')
    writeFileSync(join(configDir, 'fetcharr.db'), 'live content')
    writeFileSync(join(configDir, 'fetcharr.db-wal'), 'stale wal')

    const result = await handlers.restore({ body: { file: 'fetcharr-2026-08-18.db' } })

    expect(result.restartRequired).toBe(true)
    expect(readFileSync(join(configDir, 'fetcharr.db'), 'utf8')).toBe('restored content')
    expect(readdirSync(configDir)).not.toContain('fetcharr.db-wal')
  })

  it('keeps the previous database as a backup', async () => {
    seedBackup('fetcharr-2026-08-18.db', 'restored content')
    writeFileSync(join(configDir, 'fetcharr.db'), 'live content')

    const result = await handlers.restore({ body: { file: 'fetcharr-2026-08-18.db' } })

    expect(result.previousBackup).toMatch(/^pre-restore-/)
    expect(readFileSync(join(configDir, 'backups', result.previousBackup), 'utf8')).toBe(
      'live content',
    )
  })

  it('rejects a path instead of a file name', async () => {
    seedBackup('fetcharr-2026-08-18.db')
    const error = await expectHttpError(handlers.restore({ body: { file: '../fetcharr.db' } }))
    expect(error.statusCode).toBe(400)
  })

  it('rejects a file that is not in the backup list', async () => {
    seedBackup('fetcharr-2026-08-18.db')
    const error = await expectHttpError(handlers.restore({ body: { file: 'other.db' } }))
    expect(error.statusCode).toBe(404)
  })

  it('rejects a missing file name', async () => {
    const error = await expectHttpError(handlers.restore({ body: {} }))
    expect(error.statusCode).toBe(400)
  })
})
