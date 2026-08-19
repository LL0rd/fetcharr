export interface ArchiveEntry {
  id: number
  extractor: string
  mediaId: string
  type: 'video' | 'audio'
  subId: string | null
  subName: string | null
  title: string | null
  createdAt: string
}

export interface ArchivePage {
  entries: ArchiveEntry[]
  total: number
  limit: number
  offset: number
}

export const ARCHIVE_PAGE_SIZE = 100

/** Kurzes Datum ohne Uhrzeit — das Archiv interessiert sich nur für den Tag. */
export function formatArchiveDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
}
