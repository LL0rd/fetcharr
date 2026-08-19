import { statfs } from 'node:fs/promises'

import {
  bytesFinishedSince,
  storageByType,
  storageBySubscription,
  storageByUploader,
  type StorageGroup,
} from '@fetcharr/db'

import { downloadsDir } from '../utils/media'

/**
 * Zahlen für das Storage-Dashboard: Kacheln oben, darunter die Balkenliste in
 * der gewählten Gruppierung. Used/Free kommen vom Dateisystem — steht das
 * Download-Verzeichnis noch nicht (frischer Container), zählt ersatzweise die
 * Summe der Bibliothek als belegt und Free bleibt unbekannt.
 */

export type StorageGrouping = 'channel' | 'subscription' | 'type'

export interface StorageRow extends StorageGroup {
  /** Anteil an der Summe der gezeigten Zeilen, auf eine Nachkommastelle. */
  pct: number
}

const GROUPINGS: StorageGrouping[] = ['channel', 'subscription', 'type']

export default defineEventHandler(async (event) => {
  const db = await useDb()
  const by = grouping(getQuery(event).by)

  const groups = groupsFor(db, by)
  const files = groups.reduce((sum, group) => sum + group.files, 0)
  const librarySizeBytes = groups.reduce((sum, group) => sum + group.sizeBytes, 0)
  const disk = await readDisk()

  return {
    by,
    totals: {
      usedBytes: disk?.usedBytes ?? librarySizeBytes,
      freeBytes: disk?.freeBytes ?? null,
      files,
      librarySizeBytes,
      bytesToday: bytesFinishedSince(db, startOfToday()),
    },
    rows: groups.map((group) => withPct(group, librarySizeBytes)),
  }
})

export function grouping(value: unknown): StorageGrouping {
  return GROUPINGS.find(option => option === value) ?? 'channel'
}

function groupsFor(db: Awaited<ReturnType<typeof useDb>>, by: StorageGrouping): StorageGroup[] {
  if (by === 'subscription') return storageBySubscription(db)
  if (by === 'type') return storageByType(db)
  return storageByUploader(db)
}

function withPct(group: StorageGroup, total: number): StorageRow {
  const pct = total > 0 ? Math.round((group.sizeBytes / total) * 1000) / 10 : 0
  return { ...group, pct }
}

function startOfToday(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

async function readDisk(): Promise<{ usedBytes: number; freeBytes: number } | null> {
  try {
    const stats = await statfs(downloadsDir())
    const block = Number(stats.bsize)
    return {
      usedBytes: (Number(stats.blocks) - Number(stats.bfree)) * block,
      freeBytes: Number(stats.bavail) * block,
    }
  }
  catch {
    return null
  }
}
