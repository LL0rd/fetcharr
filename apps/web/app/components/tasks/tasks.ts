import { relativeLabel } from '../subscriptions/subscriptions'

/** Ein Task, so wie `/api/tasks` ihn über die Leitung schickt. */

export type TaskStatus = 'running' | 'confirming' | 'auto_confirm' | 'ok' | 'idle'

export type TaskSchedule =
  | { type: 'recurring', cron: string }
  | { type: 'once', timestamp: number }

export interface TaskOptionSpec {
  key: string
  label: string
  kind: 'boolean' | 'number' | 'string'
  min?: number
  max?: number
}

export interface TaskRun {
  id: number
  taskKey: string
  phase: 'run' | 'confirm'
  startedAt: string
  durationMs: number | null
  summary: string | null
  error: string | null
}

export interface Task {
  key: string
  name: string
  desc: string
  twoPhase: boolean
  optionSpecs: TaskOptionSpec[]
  schedule: TaskSchedule | null
  options: Record<string, unknown>
  running: boolean
  confirming: boolean
  runRequested: boolean
  confirmRequested: boolean
  confirmPayload: unknown
  confirmSummary: string | null
  confirmCount: number | null
  status: TaskStatus
  autoConfirm: boolean
  lastRanAt: string | null
  lastConfirmedAt: string | null
  lastRun: TaskRun | null
}

export interface TaskList {
  tasks: Task[]
  total: number
}

export interface Backup {
  file: string
  sizeBytes: number
  createdAt: string
}

export function lastRunLabel(iso: string | null): string {
  return iso ? relativeLabel(iso, 'ago') : 'never'
}

/** Mockup-Wording: „daily 03:00", „once 2026-09-01 03:00", sonst „manual". */
export function scheduleLabel(schedule: TaskSchedule | null): string {
  if (!schedule) return 'manual'
  if (schedule.type === 'once') return `once ${localLabel(schedule.timestamp * 1000)}`

  return schedule.cron
}

/** Beschriftet den Confirm-Button: „Confirm: delete 3" wie im Mockup. */
export function confirmLabel(task: Task): string {
  if (task.confirmCount !== null) return `Confirm: ${String(task.confirmCount)}`
  if (task.confirmSummary) return `Confirm: ${task.confirmSummary}`

  return 'Confirm'
}

export function durationLabel(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${String(ms)} ms`

  return `${(ms / 1000).toFixed(1)} s`
}

export function sizeLabel(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** Datum/Uhrzeit ohne Sekunden, in der Zeitzone des Browsers. */
export function localLabel(input: string | number): string {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return '—'

  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Wert für ein `datetime-local`-Feld — dasselbe Format, aber ohne Leerzeichen. */
export function toDatetimeLocal(date: Date): string {
  return localLabel(date.getTime()).replace(' ', 'T')
}
