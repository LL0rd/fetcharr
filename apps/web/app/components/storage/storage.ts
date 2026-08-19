/** Was `/api/storage` über die Leitung schickt. */
export interface StorageRow {
  key: string
  name: string
  sizeBytes: number
  files: number
  pct: number
}

export interface StorageResponse {
  by: StorageGrouping
  totals: {
    usedBytes: number
    freeBytes: number | null
    files: number
    librarySizeBytes: number
    bytesToday: number
  }
  rows: StorageRow[]
}

export const STORAGE_TABS = ['By channel', 'By subscription', 'By type'] as const

export type StorageTab = (typeof STORAGE_TABS)[number]
export type StorageGrouping = 'channel' | 'subscription' | 'type'

const TAB_GROUPINGS: Record<StorageTab, StorageGrouping> = {
  'By channel': 'channel',
  'By subscription': 'subscription',
  'By type': 'type',
}

export function tabGrouping(tab: string): StorageGrouping {
  return TAB_GROUPINGS[tab as StorageTab] ?? 'channel'
}

/**
 * Größen wie im Mockup: „1.38 TB", „14.2 GB", „512 MB" — je größer die Einheit,
 * desto mehr Nachkommastellen, damit die Kacheln nicht auf „1 TB" einrasten.
 */
export function storageSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  const digits = unit >= 4 ? 2 : unit >= 3 ? 1 : 0
  return `${value.toFixed(digits)} ${units[unit]}`
}

export function fileCount(files: number): string {
  return files.toLocaleString('en-US')
}

/** Balkenbreite relativ zur größten Zeile — sonst blieben kleine Zeilen unsichtbar. */
export function barWidth(row: StorageRow, rows: StorageRow[]): string {
  const max = rows.reduce((largest, other) => Math.max(largest, other.sizeBytes), 0)
  if (max <= 0) return '0%'
  return `${Math.max(1, Math.round((row.sizeBytes / max) * 100))}%`
}
