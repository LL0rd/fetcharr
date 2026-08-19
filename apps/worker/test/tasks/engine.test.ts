import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDb,
  ensureTask,
  getTask,
  listNotifications,
  listTaskRuns,
  requestTaskConfirm,
  requestTaskRun,
  seedTasks,
  setTaskOptions,
  setTaskSchedule,
  type Db,
} from '@fetcharr/db'

import { startTaskEngine, type TaskEngine } from '../../src/tasks/engine.ts'
import type { TaskContext, TaskDefinition } from '../../src/tasks/types.ts'

let db: Db
let engine: TaskEngine | null

beforeEach(() => {
  db = createDb(':memory:')
  engine = null
})

afterEach(async () => {
  await engine?.stop()
})

interface Recorder {
  runs: unknown[]
  confirms: unknown[]
}

function fakeTask(
  key: string,
  recorder: Recorder,
  overrides: Partial<TaskDefinition> = {},
): TaskDefinition {
  return {
    key,
    title: key,
    run: (ctx: TaskContext) => {
      recorder.runs.push(ctx.options)
      return Promise.resolve({ summary: `${key} geprüft`, payload: { uids: ['a'] } })
    },
    confirm: (_ctx: TaskContext, payload: unknown) => {
      recorder.confirms.push(payload)
      return Promise.resolve({ summary: `${key} bestätigt` })
    },
    ...overrides,
  }
}

function recorder(): Recorder {
  return { runs: [], confirms: [] }
}

interface NotifyCall {
  task: string
  count: number | null
}

let notified: NotifyCall[]

function start(tasks: TaskDefinition[], pollMs = 20): TaskEngine {
  notified = []
  engine = startTaskEngine({
    db,
    tasks,
    pollMs,
    configDir: '/tmp',
    downloadsDir: '/tmp',
    notifyConfirm: (call) => {
      notified.push({ task: call.task, count: call.count ?? null })
      return Promise.resolve()
    },
  })
  return engine
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Bedingung nicht rechtzeitig erfüllt')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('run-Phase', () => {
  it('führt den Task aus und hinterlegt das Ergebnis zur Bestätigung', async () => {
    const rec = recorder()
    ensureTask(db, { key: 'demo', options: { threshold_days: 5 } })
    await start([fakeTask('demo', rec)]).run('demo')

    expect(rec.runs).toEqual([{ threshold_days: 5 }])
    expect(rec.confirms).toEqual([])

    const task = getTask(db, 'demo')!
    expect(task.running).toBe(false)
    expect(task.confirmPayload).toEqual({ uids: ['a'] })
    expect(task.lastRanAt).toBeInstanceOf(Date)

    const history = listTaskRuns(db, { key: 'demo' })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ phase: 'run', summary: 'demo geprüft', error: null })
    expect(history[0]!.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('legt einen unbekannten Task selbst an', async () => {
    const rec = recorder()
    await start([fakeTask('demo', rec)]).run('demo')

    expect(getTask(db, 'demo')).not.toBeNull()
    expect(rec.runs).toHaveLength(1)
  })

  it('bestätigt sofort, wenn auto_confirm gesetzt ist', async () => {
    const rec = recorder()
    ensureTask(db, { key: 'demo', options: { auto_confirm: true } })
    await start([fakeTask('demo', rec)]).run('demo')

    expect(rec.confirms).toEqual([{ uids: ['a'] }])
    const task = getTask(db, 'demo')!
    expect(task.confirmPayload).toBeNull()
    expect(task.lastConfirmedAt).toBeInstanceOf(Date)
    expect(listTaskRuns(db, { key: 'demo' }).map((run) => run.phase)).toEqual(['confirm', 'run'])
  })

  it('meldet einen wartenden Task als Notification', async () => {
    const rec = recorder()
    const task = fakeTask('demo', rec, {
      run: () =>
        Promise.resolve({ summary: 'demo geprüft', payload: { uids: ['a', 'b', 'c'] }, count: 3 }),
    })
    ensureTask(db, { key: 'demo' })
    await start([task]).run('demo')

    expect(notified).toEqual([{ task: 'demo', count: 3 }])
  })

  it('schreibt die Notification per Default in die Datenbank', async () => {
    const rec = recorder()
    ensureTask(db, { key: 'demo' })
    engine = startTaskEngine({
      db,
      tasks: [fakeTask('demo', rec, { title: 'Missing files check' })],
      pollMs: 20,
      configDir: '/tmp',
      downloadsDir: '/tmp',
    })
    await engine.run('demo')

    const entries = listNotifications(db).notifications
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'task_confirm', title: 'Task needs confirmation' })
    expect(entries[0]!.body).toContain('Missing files check')
  })

  it('meldet nichts, wenn der Task sich selbst bestätigt', async () => {
    const rec = recorder()
    ensureTask(db, { key: 'demo', options: { auto_confirm: true } })
    await start([fakeTask('demo', rec)]).run('demo')

    expect(notified).toEqual([])
  })

  it('meldet nichts, wenn es nichts zu bestätigen gibt', async () => {
    const rec = recorder()
    const task = fakeTask('demo', rec, {
      run: () => Promise.resolve({ summary: 'nichts gefunden', needsConfirm: false }),
    })
    await start([task]).run('demo')

    expect(notified).toEqual([])
  })

  it('speichert kein Ergebnis, wenn der Task keine Bestätigung braucht', async () => {
    const rec = recorder()
    const task = fakeTask('demo', rec, {
      run: () => Promise.resolve({ summary: 'nichts zu tun', needsConfirm: false }),
    })
    await start([task]).run('demo')

    expect(getTask(db, 'demo')!.confirmPayload).toBeNull()
    expect(rec.confirms).toEqual([])
  })

  it('läuft ohne Confirm-Phase direkt durch', async () => {
    const rec = recorder()
    const task: TaskDefinition = {
      key: 'direkt',
      title: 'direkt',
      run: () => {
        rec.runs.push('ok')
        return Promise.resolve({ summary: '3 importiert', payload: { count: 3 } })
      },
    }
    await start([task]).run('direkt')

    expect(getTask(db, 'direkt')!.confirmPayload).toBeNull()
    expect(listTaskRuns(db, { key: 'direkt' })[0]!.summary).toBe('3 importiert')
  })

  it('überspringt einen bereits laufenden Task', async () => {
    const rec = recorder()
    let release = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const task = fakeTask('demo', rec, {
      run: async () => {
        rec.runs.push('start')
        await blocked
        return { summary: 'fertig' }
      },
    })

    const started = start([task])
    const first = started.run('demo')
    await waitFor(() => rec.runs.length === 1)
    await started.run('demo')
    expect(rec.runs).toHaveLength(1)

    release()
    await first
    expect(getTask(db, 'demo')!.running).toBe(false)
  })

  it('schreibt Fehler in die Historie und gibt den Task wieder frei', async () => {
    const rec = recorder()
    const task = fakeTask('demo', rec, {
      run: () => Promise.reject(new Error('kaputt')),
    })
    await start([task]).run('demo')

    const history = listTaskRuns(db, { key: 'demo' })
    expect(history[0]).toMatchObject({ phase: 'run', error: 'kaputt' })
    expect(getTask(db, 'demo')!.running).toBe(false)
  })
})

describe('confirm-Phase', () => {
  it('bestätigt das hinterlegte Ergebnis', async () => {
    const rec = recorder()
    const started = start([fakeTask('demo', rec)])
    await started.run('demo')
    await started.confirm('demo')

    expect(rec.confirms).toEqual([{ uids: ['a'] }])
    expect(getTask(db, 'demo')!.confirmPayload).toBeNull()
  })

  it('tut nichts ohne hinterlegtes Ergebnis', async () => {
    const rec = recorder()
    ensureTask(db, { key: 'demo' })
    await start([fakeTask('demo', rec)]).confirm('demo')

    expect(rec.confirms).toEqual([])
    expect(listTaskRuns(db, { key: 'demo' })).toEqual([])
  })

  it('behält das Ergebnis, wenn die Bestätigung scheitert', async () => {
    const rec = recorder()
    const task = fakeTask('demo', rec, {
      confirm: () => Promise.reject(new Error('platt')),
    })
    const started = start([task])
    await started.run('demo')
    await started.confirm('demo')

    const stored = getTask(db, 'demo')!
    expect(stored.confirmPayload).toEqual({ uids: ['a'] })
    expect(stored.confirming).toBe(false)
    expect(listTaskRuns(db, { key: 'demo' })[0]).toMatchObject({ phase: 'confirm', error: 'platt' })
  })
})

describe('Poll', () => {
  it('führt angeforderte Läufe und Bestätigungen aus', async () => {
    const rec = recorder()
    seedTasks(db, [{ key: 'demo' }])
    start([fakeTask('demo', rec)])

    requestTaskRun(db, 'demo')
    await waitFor(() => rec.runs.length === 1)
    await waitFor(() => getTask(db, 'demo')!.confirmPayload !== null)

    requestTaskConfirm(db, 'demo')
    await waitFor(() => rec.confirms.length === 1)
  })

  it('plant Tasks nach ihrem Zeitplan ein und lädt Änderungen nach', async () => {
    const rec = recorder()
    ensureTask(db, { key: 'demo' })
    const started = start([fakeTask('demo', rec)])
    expect(started.scheduled).toEqual([])

    setTaskSchedule(db, 'demo', { type: 'recurring', cron: '* * * * * *' })
    await waitFor(() => started.scheduled.includes('demo'))
    await waitFor(() => rec.runs.length >= 1, 3000)
  })

  it('räumt einen einmaligen Zeitplan nach dem Lauf weg', async () => {
    const rec = recorder()
    ensureTask(db, { key: 'demo' })
    const started = start([fakeTask('demo', rec)])

    setTaskSchedule(db, 'demo', {
      type: 'once',
      timestamp: Math.floor(Date.now() / 1000) + 1,
    })
    await waitFor(() => rec.runs.length === 1, 4000)
    await waitFor(() => getTask(db, 'demo')!.schedule === null)
    await waitFor(() => started.scheduled.length === 0)
  })

  it('ignoriert einen einmaligen Zeitplan in der Vergangenheit', async () => {
    const rec = recorder()
    ensureTask(db, { key: 'demo' })
    setTaskSchedule(db, 'demo', { type: 'once', timestamp: 1_600_000_000 })

    const started = start([fakeTask('demo', rec)])
    expect(started.scheduled).toEqual([])
    expect(rec.runs).toEqual([])
  })

  it('überspringt einen ungültigen Cron-Ausdruck, ohne zu stürzen', () => {
    const rec = recorder()
    ensureTask(db, { key: 'demo' })
    setTaskOptions(db, 'demo', {})
    setTaskSchedule(db, 'demo', { type: 'recurring', cron: 'kein cron' })

    const started = start([fakeTask('demo', rec)])
    expect(started.scheduled).toEqual([])
  })
})
