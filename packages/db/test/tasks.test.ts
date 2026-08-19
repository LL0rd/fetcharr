import { describe, it, expect, beforeEach } from 'vitest'

import { createDb, type Db } from '../src/index.ts'
import {
  TASK_KEYS,
  beginTaskConfirm,
  beginTaskRun,
  endTaskConfirm,
  endTaskRun,
  ensureTask,
  getTask,
  listTaskRuns,
  listTasks,
  recordTaskRun,
  requestTaskConfirm,
  requestTaskRun,
  resetStuckTasks,
  seedTasks,
  setTaskOptions,
  setTaskSchedule,
  takeConfirmRequests,
  takeRunRequests,
  tasksRevision,
} from '../src/tasks.ts'

let db: Db

beforeEach(() => {
  db = createDb(':memory:')
})

describe('seedTasks', () => {
  it('legt alle bekannten Tasks an', () => {
    seedTasks(db)

    expect(listTasks(db).map((task) => task.key).sort()).toEqual([...TASK_KEYS].sort())
  })

  it('gibt update_ytdlp einen nächtlichen Zeitplan und auto_confirm', () => {
    seedTasks(db)

    const task = getTask(db, 'update_ytdlp')!
    expect(task.schedule).toEqual({ type: 'recurring', cron: '0 4 * * *' })
    expect(task.options.auto_confirm).toBe(true)
  })

  it('lässt bestehende Einstellungen unangetastet', () => {
    seedTasks(db)
    setTaskSchedule(db, 'update_ytdlp', null)
    setTaskOptions(db, 'update_ytdlp', { auto_confirm: false })

    seedTasks(db)

    const task = getTask(db, 'update_ytdlp')!
    expect(task.schedule).toBeNull()
    expect(task.options).toEqual({ auto_confirm: false })
  })
})

describe('ensureTask', () => {
  it('legt einen Task mit Defaults an und liefert ihn zurück', () => {
    const task = ensureTask(db, { key: 'backup_db', options: { keep: 7 } })

    expect(task).toMatchObject({ key: 'backup_db', running: false, confirming: false })
    expect(task.options).toEqual({ keep: 7 })
    expect(task.updatedAt).toBeInstanceOf(Date)
  })
})

describe('setTaskSchedule / setTaskOptions', () => {
  beforeEach(() => {
    ensureTask(db, { key: 'delete_old_files' })
  })

  it('speichert wiederkehrende und einmalige Zeitpläne', () => {
    expect(setTaskSchedule(db, 'delete_old_files', { type: 'recurring', cron: '0 3 * * *' })).
      toMatchObject({ schedule: { type: 'recurring', cron: '0 3 * * *' } })

    const once = setTaskSchedule(db, 'delete_old_files', { type: 'once', timestamp: 1_800_000_000 })
    expect(once!.schedule).toEqual({ type: 'once', timestamp: 1_800_000_000 })

    expect(setTaskSchedule(db, 'delete_old_files', null)!.schedule).toBeNull()
  })

  it('ersetzt die Optionen vollständig', () => {
    setTaskOptions(db, 'delete_old_files', { threshold_days: 30 })
    expect(getTask(db, 'delete_old_files')!.options).toEqual({ threshold_days: 30 })

    setTaskOptions(db, 'delete_old_files', { threshold_days: 10, keep_favorites: false })
    expect(getTask(db, 'delete_old_files')!.options).toEqual({
      threshold_days: 10,
      keep_favorites: false,
    })
  })

  it('meldet unbekannte Tasks als null', () => {
    expect(setTaskSchedule(db, 'unbekannt', null)).toBeNull()
    expect(setTaskOptions(db, 'unbekannt', {})).toBeNull()
  })
})

describe('Anforderungs-Flags', () => {
  beforeEach(() => {
    seedTasks(db)
  })

  it('holt gesetzte Run-Anforderungen genau einmal ab', () => {
    expect(requestTaskRun(db, 'backup_db')).toBe(true)
    expect(getTask(db, 'backup_db')!.runRequested).toBe(true)

    expect(takeRunRequests(db)).toEqual(['backup_db'])
    expect(takeRunRequests(db)).toEqual([])
  })

  it('holt gesetzte Confirm-Anforderungen genau einmal ab', () => {
    expect(requestTaskConfirm(db, 'missing_files_check')).toBe(true)

    expect(takeConfirmRequests(db)).toEqual(['missing_files_check'])
    expect(takeConfirmRequests(db)).toEqual([])
  })

  it('meldet unbekannte Tasks als false', () => {
    expect(requestTaskRun(db, 'unbekannt')).toBe(false)
    expect(requestTaskConfirm(db, 'unbekannt')).toBe(false)
  })
})

describe('Lauf-Phasen', () => {
  beforeEach(() => {
    seedTasks(db)
  })

  it('sperrt einen zweiten Lauf, solange der erste läuft', () => {
    expect(beginTaskRun(db, 'backup_db')).toBe(true)
    expect(beginTaskRun(db, 'backup_db')).toBe(false)

    endTaskRun(db, 'backup_db', {})
    expect(getTask(db, 'backup_db')!.running).toBe(false)
    expect(beginTaskRun(db, 'backup_db')).toBe(true)
  })

  it('hinterlegt das Run-Ergebnis für die Bestätigung', () => {
    beginTaskRun(db, 'missing_files_check')
    endTaskRun(db, 'missing_files_check', { confirmPayload: { uids: ['a', 'b'] } })

    const task = getTask(db, 'missing_files_check')!
    expect(task.confirmPayload).toEqual({ uids: ['a', 'b'] })
    expect(task.lastRanAt).toBeInstanceOf(Date)
    expect(task.lastConfirmedAt).toBeNull()
  })

  it('räumt das Ergebnis nach der Bestätigung weg', () => {
    beginTaskRun(db, 'missing_files_check')
    endTaskRun(db, 'missing_files_check', { confirmPayload: { uids: ['a'] } })

    expect(beginTaskConfirm(db, 'missing_files_check')).toBe(true)
    expect(beginTaskConfirm(db, 'missing_files_check')).toBe(false)
    expect(getTask(db, 'missing_files_check')!.confirming).toBe(true)

    endTaskConfirm(db, 'missing_files_check')
    const task = getTask(db, 'missing_files_check')!
    expect(task.confirming).toBe(false)
    expect(task.confirmPayload).toBeNull()
    expect(task.lastConfirmedAt).toBeInstanceOf(Date)
  })

  it('setzt hängende Flags zurück', () => {
    beginTaskRun(db, 'backup_db')
    beginTaskRun(db, 'update_ytdlp')
    endTaskRun(db, 'update_ytdlp', { confirmPayload: { latest: '2026.01.01' } })
    beginTaskConfirm(db, 'update_ytdlp')

    expect(resetStuckTasks(db)).toBe(2)
    expect(listTasks(db).filter((task) => task.running || task.confirming)).toEqual([])
  })
})

describe('recordTaskRun', () => {
  it('schreibt Historie mit Dauer, Zusammenfassung und Fehler', () => {
    seedTasks(db)
    recordTaskRun(db, { taskKey: 'backup_db', phase: 'run', durationMs: 12, summary: 'ok' })
    recordTaskRun(db, {
      taskKey: 'backup_db',
      phase: 'confirm',
      durationMs: 3,
      error: 'kaputt',
    })
    recordTaskRun(db, { taskKey: 'update_ytdlp', phase: 'run', summary: 'aktuell' })

    const all = listTaskRuns(db)
    expect(all).toHaveLength(3)
    expect(all[0]).toMatchObject({ taskKey: 'update_ytdlp', phase: 'run', summary: 'aktuell' })
    expect(all[0]!.startedAt).toBeInstanceOf(Date)

    const backup = listTaskRuns(db, { key: 'backup_db' })
    expect(backup.map((run) => run.phase)).toEqual(['confirm', 'run'])
    expect(backup[0]).toMatchObject({ error: 'kaputt', durationMs: 3 })
    expect(listTaskRuns(db, { limit: 1 })).toHaveLength(1)
  })
})

describe('tasksRevision', () => {
  it('ändert sich bei Zeitplan-Änderungen, nicht bei einem Lauf', () => {
    seedTasks(db)
    const before = tasksRevision(db)

    beginTaskRun(db, 'backup_db')
    endTaskRun(db, 'backup_db', {})
    expect(tasksRevision(db)).toBe(before)

    setTaskSchedule(db, 'backup_db', { type: 'recurring', cron: '0 5 * * *' })
    expect(tasksRevision(db)).not.toBe(before)
  })
})
