/** Eine Zeile aus `files`, so wie sie `/api/files` über die Leitung schickt. */
export interface LibraryFile {
  uid: string
  url: string
  title: string
  uploader: string | null
  type: 'video' | 'audio' | 'subtitle'
  path: string
  sizeBytes: number | null
  durationSec: number | null
  thumbnailPath: string | null
  uploadDate: string | null
  favorite: boolean
  viewCount: number
  resumePositionSec: number | null
  createdAt: string
}

export interface LibraryPage {
  files: LibraryFile[]
  total: number
  limit: number
  offset: number
}

/** Wie viele Kacheln eine Seite bringt — „Load more" hängt die nächste an. */
export const LIBRARY_PAGE_SIZE = 48

export const LIBRARY_FILTERS = ['All', 'Video', 'Audio', 'Subs', 'Favs'] as const
export const LIBRARY_SORTS = ['Date', 'Title', 'Size'] as const

export type LibraryFilter = (typeof LIBRARY_FILTERS)[number]
export type LibrarySort = (typeof LIBRARY_SORTS)[number]

/** Die Segment-Beschriftungen aus dem Mockup in die Query-Parameter der API. */
export function filterQuery(filter: LibraryFilter): { type?: string; favorite?: string } {
  if (filter === 'Video') return { type: 'video' }
  if (filter === 'Audio') return { type: 'audio' }
  if (filter === 'Subs') return { type: 'subtitle' }
  if (filter === 'Favs') return { favorite: 'true' }
  return {}
}

/** Titel liest sich A→Z, Datum und Größe wollen das Größte zuerst. */
export function sortQuery(sort: LibrarySort): { sort: string; order: string } {
  return { sort: sort.toLowerCase(), order: sort === 'Title' ? 'asc' : 'desc' }
}

/** Kurzes Datum wie im Mockup („Aug 18"), Upload-Datum vor Download-Datum. */
export function fileDateLabel(file: LibraryFile): string {
  const raw = file.uploadDate
    ? file.uploadDate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    : file.createdAt
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
}

export function thumbnailUrl(file: LibraryFile): string {
  return `/api/thumbnail/${file.uid}`
}

/** Was im schraffierten Platzhalter steht, wenn kein Bild geladen werden kann. */
export function thumbLabel(file: LibraryFile): string {
  if (file.type === 'audio') return 'cover art'
  if (file.type === 'subtitle') return 'subtitles'
  return 'video thumb'
}

/** Untertitel haben keinen Player — die Watch-Seite zeigt sie als Text. */
export function isSubtitleFile(file: LibraryFile): boolean {
  return file.type === 'subtitle'
}
