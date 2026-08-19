import { describe, it, expect, beforeEach } from 'vitest'

import { createDb, type Db } from '../src/index.ts'
import {
  createJob,
  claimNextJob,
  updateProgress,
  finishJob,
  failJob,
  cancelJob,
  retryJob,
  requeueRunning,
  clearFinished,
  getJob,
  listJobs,
} from '../src/jobs.ts'

let db: Db

beforeEach(() => {
  db = createDb(':memory:')
})

function newJob(overrides: Partial<Parameters<typeof createJob>[1]> = {}) {
  return createJob(db, {
    url: 'https://example.com/watch?v=1',
    type: 'video',
    options: { format: 'best' },
    ...overrides,
  })
}

/** Setzt updated_at künstlich zurück, um eine spätere Aktualisierung nachweisen zu können. */
function backdate(uid: string, secondsAgo: number): void {
  db.$client
    .prepare('UPDATE jobs SET updated_at = unixepoch() - ?, created_at = unixepoch() - ? WHERE uid = ?')
    .run(secondsAgo, secondsAgo, uid)
}

describe('createJob', () => {
  it('creates a queued job with a generated uid and timestamps', () => {
    const job = newJob()
    expect(job.uid).toMatch(/^[\w-]{10,}$/)
    expect(job.status).toBe('queued')
    expect(job.priority).toBe(0)
    expect(job.attempts).toBe(0)
    expect(job.options).toEqual({ format: 'best' })
    expect(job.createdAt).toBeInstanceOf(Date)
    expect(job.updatedAt).toBeInstanceOf(Date)
    expect(getJob(db, job.uid)).toMatchObject({ uid: job.uid, status: 'queued' })
  })

  it('accepts priority, title and uploader', () => {
    const job = newJob({ priority: 2, title: 'Clip', uploader: 'Channel' })
    expect(job).toMatchObject({ priority: 2, title: 'Clip', uploader: 'Channel' })
  })
})

describe('claimNextJob', () => {
  it('returns null when nothing is queued', () => {
    expect(claimNextJob(db)).toBeNull()
  })

  it('claims the oldest queued job by priority and sets it running', () => {
    const bulk = newJob({ priority: 1, url: 'https://example.com/bulk' })
    backdate(bulk.uid, 300)
    const manualOld = newJob({ priority: 0, url: 'https://example.com/manual-old' })
    backdate(manualOld.uid, 120)
    newJob({ priority: 0, url: 'https://example.com/manual-new' })
    const beforeClaim = getJob(db, manualOld.uid)!.updatedAt

    const claimed = claimNextJob(db)
    expect(claimed?.uid).toBe(manualOld.uid)
    expect(claimed?.status).toBe('running')
    expect(claimed?.startedAt).toBeInstanceOf(Date)
    expect(claimed!.updatedAt.getTime()).toBeGreaterThan(beforeClaim.getTime())
  })

  it('two sequential claims never return the same job', () => {
    const job = newJob()
    expect(claimNextJob(db)?.uid).toBe(job.uid)
    expect(claimNextJob(db)).toBeNull()
  })

  it('ignores paused jobs', () => {
    const job = newJob()
    db.$client.prepare("UPDATE jobs SET status = 'paused' WHERE uid = ?").run(job.uid)
    expect(claimNextJob(db)).toBeNull()
  })
})

describe('updateProgress', () => {
  it('writes progress fields and bumps updated_at', () => {
    const job = newJob()
    backdate(job.uid, 60)
    const before = getJob(db, job.uid)!.updatedAt
    updateProgress(db, job.uid, { pct: 62.4, speed: '8.40MiB/s', eta: '00:41', sizeBytes: 327155712 })

    const updated = getJob(db, job.uid)!
    expect(updated).toMatchObject({
      progressPct: 62.4,
      progressSpeed: '8.40MiB/s',
      progressEta: '00:41',
      sizeBytes: 327155712,
    })
    expect(updated.updatedAt.getTime()).toBeGreaterThan(before.getTime())
  })
})

describe('finishJob', () => {
  it('marks the job finished with full progress and a finish timestamp', () => {
    const job = newJob()
    claimNextJob(db)
    const finished = finishJob(db, job.uid)!
    expect(finished.status).toBe('finished')
    expect(finished.progressPct).toBe(100)
    expect(finished.finishedAt).toBeInstanceOf(Date)
    expect(finished.pid).toBeNull()
  })
})

describe('failJob', () => {
  it('increments attempts; requeues while attempts < maxAttempts, errored afterwards', () => {
    const job = newJob({ maxAttempts: 2 })

    claimNextJob(db)
    const first = failJob(db, job.uid, 'boom')!
    expect(first).toMatchObject({ status: 'queued', attempts: 1, stderr: 'boom' })

    claimNextJob(db)
    const second = failJob(db, job.uid, 'boom again')!
    expect(second).toMatchObject({ status: 'errored', attempts: 2, stderr: 'boom again' })
    expect(second.finishedAt).toBeInstanceOf(Date)

    expect(claimNextJob(db)).toBeNull()
  })
})

describe('cancelJob', () => {
  it('cancels queued, running and paused jobs', () => {
    const queued = newJob()
    expect(cancelJob(db, queued.uid)?.status).toBe('cancelled')

    const running = newJob({ url: 'https://example.com/2' })
    claimNextJob(db)
    expect(cancelJob(db, running.uid)?.status).toBe('cancelled')

    const paused = newJob({ url: 'https://example.com/3' })
    db.$client.prepare("UPDATE jobs SET status = 'paused' WHERE uid = ?").run(paused.uid)
    expect(cancelJob(db, paused.uid)?.status).toBe('cancelled')
  })

  it('refuses finished and errored jobs', () => {
    const job = newJob()
    claimNextJob(db)
    finishJob(db, job.uid)
    expect(cancelJob(db, job.uid)).toBeNull()
    expect(getJob(db, job.uid)?.status).toBe('finished')
  })
})

describe('retryJob', () => {
  it('requeues an errored job and resets attempts and stderr', () => {
    const job = newJob({ maxAttempts: 1 })
    claimNextJob(db)
    failJob(db, job.uid, 'boom')

    const retried = retryJob(db, job.uid)!
    expect(retried).toMatchObject({ status: 'queued', attempts: 0, stderr: null })
    expect(retried.finishedAt).toBeNull()
    expect(claimNextJob(db)?.uid).toBe(job.uid)
  })

  it('refuses jobs that are not errored', () => {
    const job = newJob()
    expect(retryJob(db, job.uid)).toBeNull()
  })
})

describe('requeueRunning', () => {
  it('resets running jobs to queued (crash recovery)', () => {
    const job = newJob()
    claimNextJob(db)
    expect(getJob(db, job.uid)?.status).toBe('running')

    expect(requeueRunning(db)).toBe(1)
    const requeued = getJob(db, job.uid)!
    expect(requeued.status).toBe('queued')
    expect(requeued.startedAt).toBeNull()
    expect(requeued.pid).toBeNull()
    expect(claimNextJob(db)?.uid).toBe(job.uid)
  })

  it('leaves attempts untouched so a crash loop still ends', () => {
    const job = newJob()
    claimNextJob(db)
    failJob(db, job.uid, 'boom')
    claimNextJob(db)
    requeueRunning(db)
    expect(getJob(db, job.uid)?.attempts).toBe(1)
  })
})

describe('clearFinished', () => {
  it('deletes finished, errored and cancelled jobs but keeps active ones', () => {
    const finished = newJob({ url: 'https://example.com/finished' })
    claimNextJob(db)
    finishJob(db, finished.uid)

    const errored = newJob({ url: 'https://example.com/errored', maxAttempts: 1 })
    claimNextJob(db)
    failJob(db, errored.uid, 'boom')

    const cancelled = newJob({ url: 'https://example.com/cancelled' })
    cancelJob(db, cancelled.uid)

    const queued = newJob({ url: 'https://example.com/queued' })
    const running = newJob({ url: 'https://example.com/running' })
    claimNextJob(db)

    expect(clearFinished(db)).toBe(3)
    expect(listJobs(db).map((j) => j.uid).sort()).toEqual([running.uid, queued.uid].sort())
  })
})

describe('listJobs', () => {
  it('returns jobs newest first', () => {
    const older = newJob({ url: 'https://example.com/older' })
    backdate(older.uid, 600)
    const newer = newJob({ url: 'https://example.com/newer' })
    expect(listJobs(db).map((j) => j.uid)).toEqual([newer.uid, older.uid])
  })
})
