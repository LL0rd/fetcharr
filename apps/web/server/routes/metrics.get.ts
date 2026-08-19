import { Gauge, Registry } from 'prom-client'

import { storageBySubscription, storageTotals } from '@fetcharr/db'
import type { Db } from '@fetcharr/db'

/**
 * Prometheus-Export unter /metrics — ohne Auth, wie der Healthcheck (die
 * Middleware schützt nur /api/**). Registry und Metriken entstehen pro Abruf:
 * verschwindet eine Subscription, verschwindet auch ihre Zeitreihe, statt mit
 * dem letzten Wert stehenzubleiben.
 */

/** Sekunden, die der Heartbeat alt sein darf, bevor der Worker als down gilt. */
const HEARTBEAT_MAX_AGE_SEC = 5

const JOB_STATUSES = ['queued', 'running', 'paused', 'finished', 'errored', 'cancelled'] as const

export default defineEventHandler(async (event) => {
  const db = await useDb()
  setHeader(event, 'content-type', 'text/plain; version=0.0.4; charset=utf-8')
  return await collectMetrics(db)
})

export async function collectMetrics(db: Db): Promise<string> {
  const registry = new Registry()
  const jobsByStatus = countJobsByStatus(db)

  gauge(registry, 'fetcharr_jobs', 'Jobs in the queue by status', ['status'], (metric) => {
    for (const status of JOB_STATUSES) metric.set({ status }, jobsByStatus.get(status) ?? 0)
  })

  gauge(
    registry,
    'fetcharr_downloads_total',
    'Downloads that reached a final state',
    ['status'],
    (metric) => {
      metric.set({ status: 'finished' }, jobsByStatus.get('finished') ?? 0)
      metric.set({ status: 'errored' }, jobsByStatus.get('errored') ?? 0)
    },
  )

  gauge(registry, 'fetcharr_bytes_downloaded_total', 'Bytes of all finished downloads', [], (metric) =>
    metric.set(bytesDownloaded(db)),
  )

  const totals = storageTotals(db)
  gauge(registry, 'fetcharr_files_total', 'Files in the library', [], metric =>
    metric.set(totals.files),
  )

  gauge(
    registry,
    'fetcharr_storage_bytes',
    'Library size by subscription',
    ['subscription'],
    (metric) => {
      for (const group of storageBySubscription(db)) {
        metric.set({ subscription: group.name }, group.sizeBytes)
      }
    },
  )

  gauge(registry, 'fetcharr_worker_up', 'Worker heartbeat is fresh', [], metric =>
    metric.set(workerUp(db) ? 1 : 0),
  )

  gauge(registry, 'fetcharr_info', 'Build information', ['version', 'ytdlp'], metric =>
    metric.set({ version: appVersion(), ytdlp: ytdlpVersion(db) }, 1),
  )

  return await registry.metrics()
}

function gauge(
  registry: Registry,
  name: string,
  help: string,
  labelNames: string[],
  fill: (metric: Gauge<string>) => void,
): void {
  fill(new Gauge({ name, help, labelNames, registers: [registry] }))
}

function countJobsByStatus(db: Db): Map<string, number> {
  const rows = db.$client
    .prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status')
    .all() as { status: string; n: number }[]

  return new Map(rows.map(row => [row.status, row.n]))
}

function bytesDownloaded(db: Db): number {
  const row = db.$client
    .prepare(`SELECT COALESCE(SUM(size_bytes), 0) AS size FROM jobs WHERE status = 'finished'`)
    .get() as { size: number }

  return row.size
}

function workerUp(db: Db): boolean {
  const row = db.$client
    .prepare(
      `SELECT CAST(unixepoch() - CAST(value AS INTEGER) AS INTEGER) AS age
         FROM settings WHERE key = 'worker_heartbeat'`,
    )
    .get() as { age: number | null } | undefined

  const age = row?.age
  return typeof age === 'number' && age >= 0 && age < HEARTBEAT_MAX_AGE_SEC
}

function appVersion(): string {
  return process.env.FETCHARR_VERSION || 'dev'
}

function ytdlpVersion(db: Db): string {
  const row = db.$client.prepare(`SELECT value FROM settings WHERE key = 'ytdlp_version'`).get() as
    | { value: unknown }
    | undefined

  if (typeof row?.value !== 'string') return 'unknown'
  try {
    const parsed = JSON.parse(row.value)
    return typeof parsed === 'string' ? parsed : row.value
  }
  catch {
    return row.value
  }
}
