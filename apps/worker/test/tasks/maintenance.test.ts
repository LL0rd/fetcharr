import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { countFiles, createDb, listFilesForMaintenance, type Db } from '@fetcharr/db'

import { backupDbTask } from '../../src/tasks/backup.ts'
import { deleteOldFilesTask } from '../../src/tasks/delete-old.ts'
import { duplicateFilesCheckTask } from '../../src/tasks/duplicates.ts'
import { importMissingFilesTask } from '../../src/tasks/import-files.ts'
import { missingFilesCheckTask } from '../../src/tasks/missing-files.ts'
import { rebuildDatabaseTask } from '../../src/tasks/rebuild.ts'
import type { TaskContext } from '../../src/tasks/types.ts'

let db: Db
let configDir: string
let downloadsDir: string

beforeEach(() => {
  db = createDb(':memory:')
  configDir = mkdtempSync(join(tmpdir(), 'fetcharr-task-config-'))
  downloadsDir = mkdtempSync(join(tmpdir(), 'fetcharr-task-downloads-'))
})

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true })
  rmSync(downloadsDir, { recursive: true, force: true })
})

function ctx(options: Record<string, unknown> = {}): TaskContext {
  return { db, configDir, downloadsDir, options, log: () => {} }
}

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
      `INSERT INTO files (uid, url, title, type, path, thumbnail_path, size_bytes, favorite, sub_id, created_at)
       VALUES (?, ?, ?, 'video', ?, NULL, 100, ?, ?, unixepoch() - ?)`,
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

function writeMedia(relative: string, content = 'video'): string {
  const target = join(downloadsDir, relative)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content)
  return target
}

describe('backup_db', () => {
  it('schreibt ein Backup samt Cookies-Kopie', async () => {
    writeFileSync(join(configDir, 'cookies.txt'), '# cookies')

    const outcome = await backupDbTask().run(ctx({ keep: 7 }))

    const backups = readdirSync(join(configDir, 'backups'))
    expect(backups.filter((name) => name.endsWith('.db'))).toHaveLength(1)
    expect(backups.some((name) => name.startsWith('cookies-'))).toBe(true)
    expect(outcome.needsConfirm).toBe(false)
    expect(outcome.summary).toContain('fetcharr-')
  })

  it('behält nur die eingestellte Anzahl Backups', async () => {
    const task = backupDbTask()
    const stamps = ['2026-01-01', '2026-01-02', '2026-01-03']
    let index = 0
    const clocked = backupDbTask({ now: () => new Date(`${stamps[index++]!}T00:00:00.000Z`) })

    await clocked.run(ctx({ keep: 2 }))
    await clocked.run(ctx({ keep: 2 }))
    await clocked.run(ctx({ keep: 2 }))
    expect(task.key).toBe('backup_db')

    const backups = readdirSync(join(configDir, 'backups')).filter((name) => name.endsWith('.db'))
    expect(backups).toHaveLength(2)
    expect(backups.some((name) => name.includes('2026-01-01'))).toBe(false)
  })
})

describe('missing_files_check', () => {
  it('findet Einträge ohne Datei und löscht sie erst nach Bestätigung', async () => {
    writeMedia('vorhanden.mp4')
    seedFile({ uid: 'da', path: 'vorhanden.mp4' })
    seedFile({ uid: 'weg', path: 'verschwunden.mp4' })

    const task = missingFilesCheckTask()
    const outcome = await task.run(ctx())
    expect(outcome.needsConfirm).toBe(true)
    expect(outcome.summary).toContain('1')
    expect(countFiles(db)).toBe(2)

    const confirmed = await task.confirm!(ctx(), outcome.payload)
    expect(confirmed.summary).toContain('1')
    expect(listFilesForMaintenance(db).map((file) => file.uid)).toEqual(['da'])
  })

  it('meldet nichts zu tun, wenn alle Dateien da sind', async () => {
    writeMedia('vorhanden.mp4')
    seedFile({ uid: 'da', path: 'vorhanden.mp4' })

    const outcome = await missingFilesCheckTask().run(ctx())
    expect(outcome.needsConfirm).toBe(false)
  })
})

describe('import_missing_files', () => {
  it('importiert unbekannte Dateien mit Sidecar-Metadaten', async () => {
    writeMedia('Kanal/Clip.mp4')
    writeFileSync(
      join(downloadsDir, 'Kanal/Clip.info.json'),
      JSON.stringify({
        title: 'Ein Clip',
        uploader: 'Kanal',
        webpage_url: 'https://example.com/clip',
        duration: 42,
        upload_date: '20260101',
      }),
    )
    writeFileSync(join(downloadsDir, 'Kanal/Clip.jpg'), 'jpg')
    writeMedia('Ton.mp3')
    seedFile({ uid: 'bekannt', path: 'bekannt.mp4' })

    const task = importMissingFilesTask({ probe: () => Promise.resolve({ durationSec: 7 }) })
    const outcome = await task.run(ctx())

    expect(task.confirm).toBeUndefined()
    expect(outcome.summary).toContain('2')

    const files = listFilesForMaintenance(db)
    const clip = files.find((file) => file.path === 'Kanal/Clip.mp4')!
    expect(clip).toMatchObject({ title: 'Ein Clip', type: 'video', sizeBytes: 5 })
    expect(clip.thumbnailPath).toBe('Kanal/Clip.jpg')

    const audio = files.find((file) => file.path === 'Ton.mp3')!
    expect(audio.type).toBe('audio')
    expect(audio.title).toBe('Ton')
  })

  it('holt die Dauer über ffprobe, wenn kein Sidecar da ist', async () => {
    writeMedia('Ohne.mp4')
    const probed: string[] = []
    await importMissingFilesTask({
      probe: (path) => {
        probed.push(path)
        return Promise.resolve({ durationSec: 12.5 })
      },
    }).run(ctx())

    expect(probed).toHaveLength(1)
    const row = db.$client.prepare('SELECT duration_sec AS d FROM files').get() as { d: number }
    expect(row.d).toBe(12.5)
  })
})

describe('duplicate_files_check', () => {
  it('behält den ältesten Eintrag und entfernt die neueren erst nach Bestätigung', async () => {
    writeMedia('alt.mp4')
    writeMedia('neu.mp4')
    seedFile({ uid: 'alt', url: 'https://example.com/x', path: 'alt.mp4', ageDays: 5 })
    seedFile({ uid: 'neu', url: 'https://example.com/x', path: 'neu.mp4' })
    seedFile({ uid: 'einzeln', url: 'https://example.com/y' })

    const task = duplicateFilesCheckTask()
    const outcome = await task.run(ctx())
    expect(outcome.needsConfirm).toBe(true)

    await task.confirm!(ctx(), outcome.payload)

    expect(listFilesForMaintenance(db).map((file) => file.uid).sort()).toEqual(['alt', 'einzeln'])
    expect(existsSync(join(downloadsDir, 'alt.mp4'))).toBe(true)
    expect(existsSync(join(downloadsDir, 'neu.mp4'))).toBe(false)
  })
})

describe('delete_old_files', () => {
  it('listet alte Dateien und löscht sie samt Sidecars nach Bestätigung', async () => {
    writeMedia('alt.mp4')
    writeFileSync(join(downloadsDir, 'alt.info.json'), '{}')
    writeMedia('neu.mp4')
    writeMedia('favorit.mp4')
    seedFile({ uid: 'alt', path: 'alt.mp4', ageDays: 40 })
    seedFile({ uid: 'neu', path: 'neu.mp4', ageDays: 1 })
    seedFile({ uid: 'favorit', path: 'favorit.mp4', ageDays: 40, favorite: true })

    const task = deleteOldFilesTask()
    const options = { threshold_days: 30 }
    const outcome = await task.run(ctx(options))
    expect(outcome.needsConfirm).toBe(true)
    expect(outcome.summary).toContain('1')

    await task.confirm!(ctx(options), outcome.payload)

    expect(listFilesForMaintenance(db).map((file) => file.uid).sort()).toEqual(['favorit', 'neu'])
    expect(existsSync(join(downloadsDir, 'alt.mp4'))).toBe(false)
    expect(existsSync(join(downloadsDir, 'alt.info.json'))).toBe(false)
  })
})

describe('rebuild_database', () => {
  it('sichert die DB, leert die Bibliothek und liest sie neu ein', async () => {
    writeMedia('Kanal/Clip.mp4')
    seedFile({ uid: 'veraltet', path: 'gibt-es-nicht.mp4' })

    const task = rebuildDatabaseTask({ probe: () => Promise.resolve({ durationSec: null }) })
    const outcome = await task.run(ctx())
    expect(outcome.needsConfirm).toBe(true)

    await task.confirm!(ctx(), outcome.payload)

    const files = listFilesForMaintenance(db)
    expect(files.map((file) => file.path)).toEqual(['Kanal/Clip.mp4'])
    expect(readdirSync(join(configDir, 'backups')).some((name) => name.endsWith('.db'))).toBe(true)
  })
})
