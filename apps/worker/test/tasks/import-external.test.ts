import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, listArchive, listFilesForMaintenance, type Db } from '@fetcharr/db'

import { importYoutubedlMaterialTask } from '../../src/tasks/import-ytdlm.ts'
import { updateYtdlpTask } from '../../src/tasks/update-ytdlp.ts'
import type { TaskContext } from '../../src/tasks/types.ts'

let db: Db
let configDir: string
let downloadsDir: string
let instanceDir: string

beforeEach(() => {
  db = createDb(':memory:')
  configDir = mkdtempSync(join(tmpdir(), 'fetcharr-ext-config-'))
  downloadsDir = mkdtempSync(join(tmpdir(), 'fetcharr-ext-downloads-'))
  instanceDir = mkdtempSync(join(tmpdir(), 'fetcharr-ytdlm-'))
})

afterEach(() => {
  for (const dir of [configDir, downloadsDir, instanceDir]) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function ctx(options: Record<string, unknown> = {}): TaskContext {
  return { db, configDir, downloadsDir, options, log: () => {} }
}

describe('update_ytdlp', () => {
  it('meldet eine neue Version und lädt sie erst nach Bestätigung', async () => {
    const downloaded: string[] = []
    const task = updateYtdlpTask({
      currentVersion: () => Promise.resolve('2026.01.01'),
      latestVersion: () => Promise.resolve('2026.02.02'),
      download: (version) => {
        downloaded.push(version)
        return Promise.resolve('/config/bin/yt-dlp')
      },
    })

    const outcome = await task.run(ctx())
    expect(outcome.needsConfirm).toBe(true)
    expect(outcome.summary).toContain('2026.02.02')
    expect(downloaded).toEqual([])

    const confirmed = await task.confirm!(ctx(), outcome.payload)
    expect(downloaded).toEqual(['2026.02.02'])
    expect(confirmed.summary).toContain('2026.02.02')
  })

  it('braucht keine Bestätigung, wenn die Version aktuell ist', async () => {
    const outcome = await updateYtdlpTask({
      currentVersion: () => Promise.resolve('2026.02.02'),
      latestVersion: () => Promise.resolve('2026.02.02'),
      download: () => Promise.reject(new Error('darf nicht laufen')),
    }).run(ctx())

    expect(outcome.needsConfirm).toBe(false)
    expect(outcome.summary).toContain('aktuell')
  })

  it('behandelt ein fehlendes Binary als aktualisierbar', async () => {
    const outcome = await updateYtdlpTask({
      currentVersion: () => Promise.reject(new Error('kein yt-dlp')),
      latestVersion: () => Promise.resolve('2026.02.02'),
      download: () => Promise.resolve('/config/bin/yt-dlp'),
    }).run(ctx())

    expect(outcome.needsConfirm).toBe(true)
  })
})

describe('import_youtubedl_material', () => {
  function seedInstance(): void {
    mkdirSync(join(instanceDir, 'video'), { recursive: true })
    mkdirSync(join(instanceDir, 'archives'), { recursive: true })
    writeFileSync(join(instanceDir, 'video', 'Clip.mp4'), 'video')
    writeFileSync(
      join(instanceDir, 'local_db.json'),
      JSON.stringify({
        files: {
          video: [
            {
              id: 'Clip',
              title: 'Ein Clip',
              url: 'https://youtu.be/abc',
              uploader: 'Kanal',
              duration: 61,
              path: join(instanceDir, 'video', 'Clip.mp4'),
              upload_date: '20250101',
            },
            {
              id: 'Weg',
              title: 'Verschwunden',
              url: 'https://youtu.be/def',
              path: join(instanceDir, 'video', 'Weg.mp4'),
            },
          ],
          audio: [],
        },
      }),
    )
    writeFileSync(join(instanceDir, 'archives', 'archive.txt'), 'youtube abc\nyoutube def\n\n')
  }

  it('analysiert die Alt-Instanz und übernimmt sie nach Bestätigung', async () => {
    seedInstance()
    const task = importYoutubedlMaterialTask()
    const options = { path: instanceDir }

    const outcome = await task.run(ctx(options))
    expect(outcome.needsConfirm).toBe(true)
    expect(outcome.summary).toContain('1 Datei')
    expect(outcome.summary).toContain('2 Archiv')
    expect(listFilesForMaintenance(db)).toEqual([])

    await task.confirm!(ctx(options), outcome.payload)

    const files = listFilesForMaintenance(db)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ title: 'Ein Clip', url: 'https://youtu.be/abc' })
    expect(listArchive(db).total).toBe(2)
  })

  it('scheitert mit klarer Meldung ohne Pfad', async () => {
    await expect(importYoutubedlMaterialTask().run(ctx({}))).rejects.toThrow(/Pfad/)
  })

  it('scheitert, wenn die local_db.json fehlt', async () => {
    await expect(
      importYoutubedlMaterialTask().run(ctx({ path: instanceDir })),
    ).rejects.toThrow(/local_db\.json/)
  })
})
