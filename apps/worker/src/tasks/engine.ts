import {
  beginTaskConfirm,
  beginTaskRun,
  cancelTaskConfirm,
  endTaskConfirm,
  endTaskRun,
  ensureTask,
  getTask,
  listTasks,
  recordTaskRun,
  setTaskSchedule,
  takeConfirmRequests,
  takeRunRequests,
  tasksRevision,
  type Db,
  type Task,
} from '@fetcharr/db'
import { Cron } from 'croner'

import { defaultTasks } from './registry.ts'
import { boolOption, message, type TaskContext, type TaskDefinition } from './types.ts'

/**
 * Führt die Wartungs-Tasks aus. Die `tasks`-Tabelle ist Zeitplan und Fernsteuerung
 * zugleich: ein Poll baut die croner-Jobs neu auf, sobald sich ein Zeitplan
 * ändert, und holt im selben Takt die von der Web-App gesetzten Sofort-Läufe und
 * Bestätigungen ab.
 */

export interface TaskEngineOptions {
  db: Db
  configDir?: string
  downloadsDir?: string
  /** Injizierbar für Tests; per Default die echten Wartungs-Tasks. */
  tasks?: TaskDefinition[]
  pollMs?: number
  log?: (message: string) => void
}

export interface TaskEngine {
  run(key: string): Promise<void>
  confirm(key: string): Promise<void>
  reload(): void
  stop(): Promise<void>
  readonly scheduled: string[]
  readonly running: number
}

const DEFAULT_POLL_MS = 10_000

export function startTaskEngine(options: TaskEngineOptions): TaskEngine {
  const { db } = options
  const log = options.log ?? (() => {})
  const configDir = options.configDir ?? process.env.CONFIG_DIR ?? './data/config'
  const downloadsDir = options.downloadsDir ?? process.env.DOWNLOADS_DIR ?? './data/downloads'
  const definitions = new Map(
    (options.tasks ?? defaultTasks()).map((task) => [task.key, task] as const),
  )

  const crons = new Map<string, Cron>()
  const pending = new Set<Promise<void>>()
  let revision = ''
  let stopping = false

  function context(task: Task): TaskContext {
    return { db, configDir, downloadsDir, options: task.options, log }
  }

  /**
   * Hält den laufenden Task für `stop()` fest. Der Fehler selbst wird an der
   * Aufrufstelle behandelt — hier zählt nur, dass die Phase vorbei ist.
   */
  function track<T>(work: Promise<T>): Promise<T> {
    const tracked = work.then(
      () => undefined,
      () => undefined,
    )
    pending.add(tracked)
    void tracked.finally(() => pending.delete(tracked))
    return work
  }

  async function run(key: string): Promise<void> {
    const definition = definitions.get(key)
    if (!definition || stopping) return

    const task = getTask(db, key) ?? ensureTask(db, { key })
    if (!beginTaskRun(db, key)) {
      log(`task ${key}: already running`)
      return
    }

    const startedAt = new Date()
    try {
      const outcome = await track(definition.run(context(task)))
      const needsConfirm = Boolean(definition.confirm) && outcome.needsConfirm !== false
      endTaskRun(db, key, { confirmPayload: needsConfirm ? (outcome.payload ?? null) : null })
      record(key, 'run', startedAt, outcome.summary, null)
      log(`task ${key}: ${outcome.summary}`)

      if (needsConfirm && outcome.payload != null) {
        if (boolOption(task.options, 'auto_confirm', false)) await confirm(key)
        else log(`task ${key}: waiting for confirmation`)
      }
    } catch (error) {
      endTaskRun(db, key, {})
      record(key, 'run', startedAt, null, message(error))
      log(`task ${key} failed: ${message(error)}`)
    }
  }

  async function confirm(key: string): Promise<void> {
    const definition = definitions.get(key)
    if (!definition?.confirm || stopping) return

    const task = getTask(db, key)
    if (!task || task.confirmPayload == null) {
      log(`task ${key}: nothing to confirm`)
      return
    }

    if (!beginTaskConfirm(db, key)) {
      log(`task ${key}: already confirming`)
      return
    }

    const startedAt = new Date()
    try {
      const outcome = await track(definition.confirm(context(task), task.confirmPayload))
      endTaskConfirm(db, key)
      record(key, 'confirm', startedAt, outcome.summary, null)
      log(`task ${key}: ${outcome.summary}`)
    } catch (error) {
      cancelTaskConfirm(db, key)
      record(key, 'confirm', startedAt, null, message(error))
      log(`task ${key} confirm failed: ${message(error)}`)
    }
  }

  function record(
    key: string,
    phase: 'run' | 'confirm',
    startedAt: Date,
    summary: string | null,
    error: string | null,
  ): void {
    recordTaskRun(db, {
      taskKey: key,
      phase,
      startedAt,
      durationMs: Date.now() - startedAt.getTime(),
      summary,
      error,
    })
  }

  /** Baut die Cron-Jobs aus der Tabelle neu auf; unbekannte Tasks bleiben außen vor. */
  function reload(): void {
    for (const cron of crons.values()) cron.stop()
    crons.clear()
    revision = tasksRevision(db)
    if (stopping) return

    for (const task of listTasks(db)) {
      if (!task.schedule || !definitions.has(task.key)) continue

      try {
        crons.set(task.key, schedule(task))
      } catch (error) {
        log(`task ${task.key}: invalid schedule: ${message(error)}`)
        crons.delete(task.key)
      }
    }
  }

  /**
   * Einmalige Termine in der Vergangenheit lässt croner nicht zu — und ein
   * verpasster Termin soll beim Worker-Start auch nicht nachgeholt werden.
   */
  function schedule(task: Task): Cron {
    if (task.schedule?.type === 'once') {
      const at = new Date(task.schedule.timestamp * 1000)
      if (at.getTime() <= Date.now()) throw new Error('timestamp is in the past')

      return new Cron(at, () => {
        setTaskSchedule(db, task.key, null)
        void run(task.key)
      })
    }

    return new Cron(task.schedule!.type === 'recurring' ? task.schedule.cron : '', () => {
      void run(task.key)
    })
  }

  function poll(): void {
    if (stopping) return

    if (tasksRevision(db) !== revision) {
      reload()
      log(`reloaded ${String(crons.size)} task schedule(s)`)
    }

    for (const key of takeRunRequests(db)) void run(key)
    for (const key of takeConfirmRequests(db)) void confirm(key)
  }

  reload()
  const timer = setInterval(poll, options.pollMs ?? DEFAULT_POLL_MS)

  return {
    run,
    confirm,
    reload,
    get scheduled() {
      return [...crons.keys()]
    },
    get running() {
      return pending.size
    },
    async stop() {
      if (stopping) return
      stopping = true
      clearInterval(timer)
      for (const cron of crons.values()) cron.stop()
      crons.clear()
      await Promise.allSettled([...pending])
      log('task engine stopped')
    },
  }
}
