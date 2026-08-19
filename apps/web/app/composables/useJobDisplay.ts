import type { JobOptions } from '@fetcharr/shared'

import type { QueueJob } from './useJobsStream'

/** Kleinere Zahl heißt weiter vorn in der Queue (`claimNextJob` sortiert `priority ASC`). */
const PRIORITY_LABELS = ['manual', 'bulk', 'subscription'] as const

export function jobOptions(job: QueueJob): Partial<JobOptions> {
  return (job.options ?? {}) as Partial<JobOptions>
}

/** Was in der Format-Spalte steht — `audio` lädt yt-dlp als mp3 herunter. */
export function jobFormatLabel(job: QueueJob): string {
  const format = jobOptions(job).format ?? 'best'
  return format === 'audio' ? 'mp3' : format
}

export function jobPriorityLabel(job: QueueJob): string {
  return PRIORITY_LABELS[Math.min(job.priority, PRIORITY_LABELS.length - 1)]!
}

/** Nur laufende und pausierte Jobs zeigen den Balken, sonst steht dort der Status-Tag. */
export function jobShowsBar(job: QueueJob): boolean {
  return job.status === 'running' || job.status === 'paused'
}

export function jobTitle(job: QueueJob): string {
  return job.title || job.url
}

export function formatPercent(pct: number): string {
  return `${Math.round(pct)}%`
}

export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes < 0) return '—'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export function formatClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return ''

  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number): string => String(value).padStart(2, '0')

  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`
}
