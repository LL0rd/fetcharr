import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  claimNextJob,
  failJob,
  finishJob,
  requeueRunning,
  setJobMeta,
  updateProgress,
  type Db,
  type Job,
} from '@fetcharr/db'
import { JobOptionsSchema, type GlobalSettings } from '@fetcharr/shared'

import { runDownload, type DownloadHandle, type DownloadResult } from './runner.ts'
import { getJobStatus, getMaxConcurrent, insertFile, writeHeartbeat } from './store.ts'
import { createThrottle } from './throttle.ts'

export interface LoopOptions {
  db: Db
  downloadsDir: string
  configDir?: string
  /** Injizierbar für Tests; per Default der echte yt-dlp-Runner. */
  run?: typeof runDownload
  settings?: GlobalSettings
  pollMs?: number
  cancelCheckMs?: number
  heartbeatMs?: number
  progressThrottleMs?: number
  log?: (message: string) => void
}

export interface WorkerLoop {
  /** Laufende Prozesse killen, deren Jobs zurück in die Queue, Timer stoppen. */
  stop(): Promise<void>
  readonly active: number
}

const STDERR_LIMIT = 4000

export function startLoop(options: LoopOptions): WorkerLoop {
  const { db, downloadsDir } = options
  const run = options.run ?? runDownload
  const log = options.log ?? (() => {})
  const pollMs = options.pollMs ?? 500
  const cancelCheckMs = options.cancelCheckMs ?? 1000
  const heartbeatMs = options.heartbeatMs ?? 2000
  const progressThrottleMs = options.progressThrottleMs ?? 1000

  const active = new Map<string, DownloadHandle>()
  let stopping = false

  function startJob(job: Job): void {
    const parsed = JobOptionsSchema.safeParse(job.options ?? {})
    if (!parsed.success) {
      failJob(db, job.uid, `Invalid job options: ${parsed.error.message}`)
      return
    }

    const throttle = createThrottle(Date.now, progressThrottleMs)
    const handle = run({
      job: { uid: job.uid, url: job.url, type: job.type, options: parsed.data },
      downloadsDir,
      settings: options.settings,
      cookiesPath: cookiesPath(options.configDir),
      onInfo: (info) => setJobMeta(db, job.uid, { title: info.title, uploader: info.uploader }),
      onProgress: (update) => {
        if (throttle()) updateProgress(db, job.uid, update)
      },
    })

    active.set(job.uid, handle)
    setJobMeta(db, job.uid, { pid: handle.pid ?? null })
    log(`start ${job.uid} ${job.url}`)

    handle.result
      .then((result) => complete(job, result))
      .catch((error: unknown) => {
        failJob(db, job.uid, String(error))
      })
      .finally(() => active.delete(job.uid))
  }

  function complete(job: Job, result: DownloadResult): void {
    if (result.status === 'cancelled') {
      log(`cancelled ${job.uid}`)
      return
    }

    if (result.status === 'failed') {
      failJob(db, job.uid, result.stderr.slice(-STDERR_LIMIT) || 'yt-dlp failed without output')
      log(`failed ${job.uid}`)
      return
    }

    const info = result.info ?? {}
    insertFile(db, {
      uid: job.uid,
      url: job.url,
      title: str(info.title) ?? job.title ?? job.url,
      uploader: str(info.uploader) ?? job.uploader,
      type: job.type,
      path: result.path,
      sizeBytes: result.sizeBytes,
      durationSec: typeof info.duration === 'number' ? info.duration : null,
      thumbnailPath: result.thumbnailPath,
      uploadDate: str(info.upload_date),
      info: result.info,
    })
    finishJob(db, job.uid)
    log(`finished ${job.uid} -> ${result.path}`)
  }

  function tick(): void {
    if (stopping) return
    const max = getMaxConcurrent(db)

    while (active.size < max) {
      const job = claimNextJob(db)
      if (!job) return
      startJob(job)
    }
  }

  /** Die API setzt `cancelled` nur in der DB — der Worker holt sich das Signal hier ab. */
  function checkCancelled(): void {
    for (const [uid, handle] of active) {
      if (getJobStatus(db, uid) === 'cancelled') handle.abort()
    }
  }

  const timers = [
    setInterval(tick, pollMs),
    setInterval(checkCancelled, cancelCheckMs),
    setInterval(() => writeHeartbeat(db), heartbeatMs),
  ]
  for (const timer of timers) timer.unref?.()

  writeHeartbeat(db)
  tick()

  return {
    get active() {
      return active.size
    },
    async stop() {
      if (stopping) return
      stopping = true
      for (const timer of timers) clearInterval(timer)

      const pending = [...active.values()].map((handle) => {
        handle.abort()
        return handle.result
      })
      await Promise.allSettled(pending)
      requeueRunning(db)
      log('stopped')
    },
  }
}

function cookiesPath(configDir: string | undefined): string | null {
  const path = join(configDir ?? process.env.CONFIG_DIR ?? './data/config', 'cookies.txt')
  return existsSync(path) ? path : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}
