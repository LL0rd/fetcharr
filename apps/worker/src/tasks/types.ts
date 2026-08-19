import type { Db } from '@fetcharr/db'

/**
 * Ein Wartungs-Task besteht aus zwei Phasen: `run` prüft und sammelt, `confirm`
 * führt die destruktive Aktion auf dem gesammelten Ergebnis aus. Tasks ohne
 * `confirm` sind in einem Zug fertig.
 */

export interface TaskContext {
  db: Db
  configDir: string
  downloadsDir: string
  /** Die in `tasks.options` gespeicherten Einstellungen des Tasks. */
  options: Record<string, unknown>
  log: (message: string) => void
}

export interface TaskRunOutcome {
  summary: string
  /** Wird für die Bestätigung aufbewahrt — nur was `confirm` wirklich braucht. */
  payload?: unknown
  /** `false`, wenn es nichts zu bestätigen gibt (z. B. keine Treffer). */
  needsConfirm?: boolean
  /** Anzahl der gefundenen Einträge — steht so in der Notification. */
  count?: number
}

export interface TaskConfirmOutcome {
  summary: string
}

export interface TaskDefinition {
  key: string
  title: string
  run(ctx: TaskContext): Promise<TaskRunOutcome>
  confirm?(ctx: TaskContext, payload: unknown): Promise<TaskConfirmOutcome>
}

export function numberOption(
  options: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = Number(options[key])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export function boolOption(
  options: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = options[key]
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return String(value).toLowerCase() !== 'false' && String(value) !== '0'
}

export function stringOption(options: Record<string, unknown>, key: string): string | null {
  const value = options[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
