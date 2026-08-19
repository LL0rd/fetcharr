import type { Settings } from '@fetcharr/shared'

/** Reine Hilfslogik der Settings-Seite — ohne Vue, damit sie testbar bleibt. */

export const SETTINGS_TABS = [
  'Downloader',
  'Extra',
  'API',
  'Subscriptions',
  'Notifications',
  'Advanced',
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]

export const FORMAT_OPTIONS = ['best', '1080p', '720p', 'audio'] as const
export const SPONSORBLOCK_OPTIONS = ['remove', 'mark', 'off'] as const
export const LOG_LEVEL_OPTIONS = ['debug', 'info', 'warn', 'error'] as const

export interface NotifyTypeOption {
  key: string
  label: string
  desc: string
}

export const NOTIFY_TYPE_OPTIONS: NotifyTypeOption[] = [
  { key: 'download_finished', label: 'Download finished', desc: 'every completed download' },
  { key: 'download_error', label: 'Download error', desc: 'a job gave up after its retries' },
  { key: 'subscription_found', label: 'Subscription found', desc: 'a check queued new videos' },
  { key: 'task_confirm', label: 'Task needs confirmation', desc: 'a maintenance task waits for you' },
]

export interface SettingsResponse {
  settings: Settings
  apiKey: string | null
}

/**
 * Nur die geänderten Keys gehen an PUT — so bleibt „Save" ohne Änderung ein
 * No-op und ein Feld, das jemand anderes gerade gesetzt hat, wird nicht
 * versehentlich mit einem alten Formularstand überschrieben.
 */
export function diffSettings(base: Settings, draft: Settings): Partial<Settings> {
  const patch: Record<string, unknown> = {}

  for (const key of Object.keys(draft) as (keyof Settings)[]) {
    if (!equals(base[key], draft[key])) patch[key] = draft[key]
  }

  return patch as Partial<Settings>
}

function equals(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => entry === b[index])
  }
  return a === b
}

/** Reihenfolge der Checkboxen soll den Stand nicht „geändert" aussehen lassen. */
export function toggleNotifyType(current: string[], key: string, on: boolean): string[] {
  const next = new Set(current)
  if (on) next.add(key)
  else next.delete(key)

  return NOTIFY_TYPE_OPTIONS.filter((option) => next.has(option.key)).map((option) => option.key)
}
