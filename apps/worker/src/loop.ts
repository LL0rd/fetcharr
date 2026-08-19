import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
  addArchiveEntry,
  claimNextJob,
  failJob,
  finishJob,
  getJobSubId,
  requeueRunning,
  setFileSubscription,
  setJobMeta,
  updateProgress,
  type Db,
  type Job,
} from '@fetcharr/db'
import { JobOptionsSchema, type GlobalSettings, type JobOptions } from '@fetcharr/shared'

import {
  postProcess,
  postProcessSettings,
  type PostProcessFn,
  type PostProcessInput,
  type PostProcessResult,
} from './postprocess.ts'
import { notifyDownloadError, notifyDownloadFinished } from './notify.ts'
import { runDownload, type DownloadHandle, type DownloadResult } from './runner.ts'
import { extractorFromUrl } from './subscriptions.ts'
import {
  getJobStatus,
  getMaxConcurrent,
  insertFile,
  readGlobalSettings,
  writeHeartbeat,
} from './store.ts'
import { createThrottle } from './throttle.ts'

export interface LoopOptions {
  db: Db
  downloadsDir: string
  configDir?: string
  /** Injizierbar für Tests; per Default der echte yt-dlp-Runner. */
  run?: typeof runDownload
  /** Injizierbar für Tests; per Default NFO/Thumbnail/Crop über ffmpeg. */
  postProcess?: PostProcessFn
  /** Test-Override; im Betrieb kommen die Settings pro Job frisch aus der DB. */
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

  // Die Schalter werden pro Download gelesen, damit Änderungen ohne Neustart greifen.
  const postProcessor: PostProcessFn =
    options.postProcess ?? ((input) => postProcess(input, { ...postProcessSettings(db), log }))

  /**
   * Jeder Fehlschlag geht auch als Notification raus — inklusive der Zwischen-
   * versuche, damit im Center sichtbar bleibt, dass noch ein Retry aussteht.
   */
  function fail(job: Job, reason: string): void {
    const failed = failJob(db, job.uid, reason)
    if (!failed) return

    notify(
      notifyDownloadError(
        db,
        {
          title: failed.title ?? failed.url,
          attempts: failed.attempts,
          maxAttempts: failed.maxAttempts,
        },
        { log },
      ),
    )
  }

  /** Notifications dürfen den Download-Ablauf weder bremsen noch scheitern lassen. */
  function notify(pending: Promise<unknown>): void {
    void pending.catch((error: unknown) => log(`notification failed: ${String(error)}`))
  }

  function startJob(job: Job): void {
    const parsed = JobOptionsSchema.safeParse(job.options ?? {})
    if (!parsed.success) {
      fail(job, `Invalid job options: ${parsed.error.message}`)
      return
    }

    const throttle = createThrottle(Date.now, progressThrottleMs)
    const handle = run({
      job: { uid: job.uid, url: job.url, type: job.type, options: parsed.data },
      downloadsDir,
      settings: options.settings ?? readGlobalSettings(db),
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
      .then((result) => complete(job, parsed.data, result))
      .catch((error: unknown) => {
        fail(job, String(error))
      })
      .finally(() => active.delete(job.uid))
  }

  async function complete(
    job: Job,
    jobOptions: JobOptions,
    result: DownloadResult,
  ): Promise<void> {
    if (result.status === 'cancelled') {
      log(`cancelled ${job.uid}`)
      return
    }

    if (result.status === 'failed') {
      fail(job, result.stderr.slice(-STDERR_LIMIT) || 'yt-dlp failed without output')
      log(`failed ${job.uid}`)
      return
    }

    const info = result.info ?? {}
    const media = await runPostProcess({
      mediaPath: result.path,
      thumbnailPath: result.thumbnailPath,
      info: result.info,
      options: jobOptions,
      durationSec: typeof info.duration === 'number' ? info.duration : null,
      sizeBytes: result.sizeBytes,
    })

    const title = str(info.title) ?? job.title ?? job.url

    insertFile(db, {
      uid: job.uid,
      url: job.url,
      title,
      uploader: str(info.uploader) ?? job.uploader,
      type: job.type,
      path: toLibraryPath(media.mediaPath),
      sizeBytes: media.sizeBytes,
      durationSec: media.durationSec,
      thumbnailPath: media.thumbnailPath ? toLibraryPath(media.thumbnailPath) : null,
      uploadDate: str(info.upload_date),
      info: result.info,
    })
    finishJob(db, job.uid)
    recordSubscriptionResult(job, info)
    notify(
      notifyDownloadFinished(db, { title, sizeBytes: media.sizeBytes, uid: job.uid }, { log }),
    )
    log(`finished ${job.uid} -> ${media.mediaPath}`)
  }

  /**
   * Der Archiv-Eintrag entsteht erst hier: Ein abgebrochener oder gescheiterter
   * Download darf beim nächsten Check nicht als „schon geladen" gelten.
   */
  function recordSubscriptionResult(job: Job, info: Record<string, unknown>): void {
    const subId = getJobSubId(db, job.uid)
    if (!subId) return

    setFileSubscription(db, job.uid, subId)

    const mediaId = str(info.id)
    if (!mediaId) {
      log(`no media id for ${job.uid} — skipping archive entry`)
      return
    }

    addArchiveEntry(db, {
      extractor: str(info.extractor_key) ?? str(info.extractor) ?? extractorFromUrl(job.url),
      mediaId,
      type: job.type,
      subId,
      title: str(info.title) ?? job.title,
    })
  }

  /** Sidecars und Schnitt dürfen einen fertigen Download nie scheitern lassen. */
  async function runPostProcess(input: PostProcessInput): Promise<PostProcessResult> {
    try {
      return await postProcessor(input)
    } catch (error) {
      log(`post-processing failed for ${input.mediaPath}: ${String(error)}`)
      return {
        mediaPath: input.mediaPath,
        thumbnailPath: input.thumbnailPath,
        durationSec: input.durationSec,
        sizeBytes: input.sizeBytes ?? null,
        nfoPath: null,
      }
    }
  }

  /**
   * `files` hält Pfade relativ zu DOWNLOADS_DIR: der Mount-Punkt unterscheidet sich
   * zwischen Host und Container, absolute Pfade würden den Umzug nicht überleben.
   */
  function toLibraryPath(absolute: string): string {
    return relative(downloadsDir, absolute)
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

  // Kein unref: diese Intervalle sind es, die den Worker-Prozess am Leben halten.
  const timers = [
    setInterval(tick, pollMs),
    setInterval(checkCancelled, cancelCheckMs),
    setInterval(() => writeHeartbeat(db), heartbeatMs),
  ]

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
