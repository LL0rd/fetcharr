import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  beginCheck,
  endCheck,
  getSubscription,
  listSubscriptions,
  subscriptionsRevision,
  takeCheckRequests,
  type Db,
  type Subscription,
} from '@fetcharr/db'
import { Cron } from 'croner'

import { checkSubscription, fetchPlaylistEntries } from './subscriptions.ts'

/**
 * Hält für jede aktive Subscription einen croner-Job. Die Tabelle ist die
 * einzige Quelle: ein Poll auf `subscriptionsRevision` baut die Cron-Jobs neu
 * auf, sobald die Web-App etwas ändert, und holt im selben Takt die von der API
 * gesetzten Sofort-Checks ab.
 */

export type RunCheckFn = (sub: Subscription) => Promise<unknown>

export interface SchedulerOptions {
  db: Db
  /** Takt für Reload-Erkennung und Sofort-Checks. */
  pollMs?: number
  /** Injizierbar für Tests; per Default der echte Check-Flow. */
  runCheck?: RunCheckFn
  /** Für die Cookies-Datei, mit der private Kanäle abgefragt werden. */
  configDir?: string
  log?: (message: string) => void
}

export interface Scheduler {
  reload(): void
  trigger(id: string): Promise<void>
  stop(): Promise<void>
  readonly scheduled: string[]
  readonly running: number
}

const DEFAULT_POLL_MS = 10_000

export function startScheduler(options: SchedulerOptions): Scheduler {
  const { db } = options
  const log = options.log ?? (() => {})
  const runCheck: RunCheckFn =
    options.runCheck ??
    ((sub) =>
      checkSubscription({
        db,
        sub,
        log,
        fetchEntries: (entry) =>
          fetchPlaylistEntries(entry, { cookiesPath: cookiesPath(options.configDir) }),
      }))

  const crons = new Map<string, Cron>()
  const pending = new Set<Promise<void>>()
  let revision = ''
  let stopping = false

  function reload(): void {
    for (const cron of crons.values()) cron.stop()
    crons.clear()
    revision = subscriptionsRevision(db)
    if (stopping) return

    for (const sub of listSubscriptions(db)) {
      if (sub.paused) continue

      try {
        crons.set(
          sub.id,
          new Cron(sub.cron, () => {
            void trigger(sub.id)
          }),
        )
      } catch (error) {
        log(`subscription ${sub.name}: invalid cron "${sub.cron}": ${message(error)}`)
      }
    }
  }

  /**
   * Ein Check pro Subscription: `beginCheck` ist das Schloss, das auch einen
   * gleichzeitig angeforderten Sofort-Check abweist.
   */
  async function trigger(id: string): Promise<void> {
    const sub = getSubscription(db, id)
    if (!sub || stopping) return

    if (!beginCheck(db, id)) {
      log(`subscription ${sub.name}: check already running`)
      return
    }

    const task = (async () => {
      try {
        await runCheck(sub)
      } catch (error) {
        log(`subscription ${sub.name}: check failed: ${message(error)}`)
      } finally {
        endCheck(db, id)
      }
    })()

    pending.add(task)
    try {
      await task
    } finally {
      pending.delete(task)
    }
  }

  function poll(): void {
    if (stopping) return

    if (subscriptionsRevision(db) !== revision) {
      reload()
      log(`reloaded ${String(crons.size)} subscription schedule(s)`)
    }

    for (const id of takeCheckRequests(db)) void trigger(id)
  }

  reload()
  const timer = setInterval(poll, options.pollMs ?? DEFAULT_POLL_MS)

  return {
    reload,
    trigger,
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
      log('scheduler stopped')
    },
  }
}

/** Wie im Loop: der Pfad zählt nur, wenn die Datei auch da ist. */
function cookiesPath(configDir: string | undefined): string | null {
  const path = join(configDir ?? process.env.CONFIG_DIR ?? './data/config', 'cookies.txt')
  return existsSync(path) ? path : null
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
