import { getTask, listTaskRuns, listTasks, seedTasks } from '@fetcharr/db'
import type { Db, Task, TaskRun } from '@fetcharr/db'

/**
 * Die Task-Liste fürs Wartungs-Board. Die Zeilen selbst stehen in der DB, die
 * Beschriftung hier — sie gehört zur Oberfläche, nicht zur Engine im Worker.
 */

export interface TaskOptionSpec {
  key: string
  label: string
  kind: 'boolean' | 'number' | 'string'
  min?: number
  max?: number
}

export interface TaskCatalogEntry {
  key: string
  name: string
  desc: string
  /** Hat der Task eine destruktive zweite Phase? Nur die kennen auto_confirm. */
  twoPhase: boolean
  /** Bauplan des Options-Dialogs; zugleich die Whitelist für PUT /options. */
  optionSpecs: TaskOptionSpec[]
}

const AUTO_CONFIRM: TaskOptionSpec = {
  key: 'auto_confirm',
  label: 'Auto confirm',
  kind: 'boolean',
}

export const TASK_CATALOG: TaskCatalogEntry[] = [
  {
    key: 'backup_db',
    name: 'Backup DB',
    desc: 'VACUUM INTO /config/backups/ + settings & cookies',
    twoPhase: false,
    optionSpecs: [{ key: 'keep', label: 'Backups kept', kind: 'number', min: 1, max: 100 }],
  },
  {
    key: 'missing_files_check',
    name: 'Missing files check',
    desc: 'find DB entries whose file is gone',
    twoPhase: true,
    optionSpecs: [AUTO_CONFIRM],
  },
  {
    key: 'import_missing_files',
    name: 'Import missing DB records',
    desc: 'scan /downloads for unknown files, import with sidecar/ffprobe',
    twoPhase: false,
    optionSpecs: [],
  },
  {
    key: 'duplicate_files_check',
    name: 'Find duplicate files',
    desc: 'duplicates by URL/hash',
    twoPhase: true,
    optionSpecs: [AUTO_CONFIRM],
  },
  {
    key: 'update_ytdlp',
    name: 'Update yt-dlp',
    desc: 'version check → binary to /config/bin',
    twoPhase: true,
    optionSpecs: [AUTO_CONFIRM],
  },
  {
    key: 'delete_old_files',
    name: 'Delete old files',
    desc: 'older than threshold; favorites & subs excluded',
    twoPhase: true,
    optionSpecs: [
      { key: 'threshold_days', label: 'Older than (days)', kind: 'number', min: 1, max: 3650 },
      { key: 'keep_favorites', label: 'Keep favorites', kind: 'boolean' },
      { key: 'keep_subscriptions', label: 'Keep subscription downloads', kind: 'boolean' },
      AUTO_CONFIRM,
    ],
  },
  {
    key: 'rebuild_database',
    name: 'Rebuild database',
    desc: 'rebuild DB from filesystem (auto-backup first)',
    twoPhase: false,
    optionSpecs: [],
  },
  {
    key: 'import_youtubedl_material',
    name: 'Import from YoutubeDL-Material',
    desc: 'analyze old instance: local_db.json, archives, media',
    twoPhase: false,
    optionSpecs: [{ key: 'path', label: 'Path to the old instance', kind: 'string' }],
  },
]

const CATALOG_ORDER = new Map(TASK_CATALOG.map((entry, index) => [entry.key, index]))

export type TaskStatus = 'running' | 'confirming' | 'auto_confirm' | 'ok' | 'idle'

export interface TaskListEntry extends Task, TaskCatalogEntry {
  status: TaskStatus
  autoConfirm: boolean
  lastRun: TaskRun | null
  /** Kurzfassung des confirm_payload für den Button „Confirm: delete 3". */
  confirmSummary: string | null
  confirmCount: number | null
}

export default defineEventHandler(async (event) => {
  const db = await useDb()
  seedTasks(db)

  const runs = lastRunByTask(db)
  const tasks = listTasks(db)
    .map((task) => toListEntry(task, runs.get(task.key) ?? null))
    .sort((a, b) => (CATALOG_ORDER.get(a.key) ?? 99) - (CATALOG_ORDER.get(b.key) ?? 99))

  return { tasks, total: tasks.length }
})

/** Wirft 404, damit sich die Handler das immer gleiche Vorspiel sparen. */
export function requireTask(db: Db, key: string): Task {
  const task = getTask(db, key)
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })

  return task
}

export function toListEntry(task: Task, lastRun: TaskRun | null): TaskListEntry {
  const catalog = catalogFor(task.key)
  const autoConfirm = catalog.twoPhase && task.options.auto_confirm === true

  return {
    ...task,
    ...catalog,
    autoConfirm,
    status: statusOf(task, autoConfirm),
    lastRun,
    confirmSummary: summarizePayload(task.confirmPayload),
    confirmCount: countPayload(task.confirmPayload),
  }
}

/** Ein Task ohne Katalog-Eintrag ist neu in der Engine — er wird trotzdem gezeigt. */
export function catalogFor(key: string): TaskCatalogEntry {
  return (
    TASK_CATALOG.find((entry) => entry.key === key)
    ?? { key, name: key, desc: '', twoPhase: false, optionSpecs: [] }
  )
}

function statusOf(task: Task, autoConfirm: boolean): TaskStatus {
  if (task.running) return 'running'
  if (task.confirming) return 'confirming'
  if (autoConfirm) return 'auto_confirm'

  return task.lastRanAt ? 'ok' : 'idle'
}

/** Nur der jüngste Lauf je Task — die volle Historie hängt an /api/tasks/:key/runs. */
function lastRunByTask(db: Db): Map<string, TaskRun> {
  const runs = new Map<string, TaskRun>()
  for (const run of listTaskRuns(db, { limit: 500 })) {
    if (!runs.has(run.taskKey)) runs.set(run.taskKey, run)
  }

  return runs
}

/**
 * Der Payload ist pro Task anders aufgebaut; für den Button reicht die Anzahl
 * der betroffenen Einträge oder ein mitgeschickter Text.
 */
export function summarizePayload(payload: unknown): string | null {
  if (!payload) return null
  if (typeof payload === 'string') return payload
  if (Array.isArray(payload)) return `${String(payload.length)} entries`

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.summary === 'string') return record.summary

    const count = countPayload(payload)
    return count === null ? null : `${String(count)} entries`
  }

  return null
}

export function countPayload(payload: unknown): number | null {
  if (Array.isArray(payload)) return payload.length
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  if (typeof record.count === 'number') return record.count

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) return value.length
  }

  return null
}
