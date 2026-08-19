/** Ein Abo, so wie `/api/subscriptions` es über die Leitung schickt. */
export interface Subscription {
  id: string
  url: string
  name: string
  type: 'channel' | 'playlist' | 'generic'
  mediaType: 'video' | 'audio'
  cron: string
  paused: boolean
  timerangeFrom: string | null
  titleRegex: string | null
  maxQuality: string | null
  customArgs: string | null
  customOutput: string | null
  sponsorblock: 'remove' | 'mark' | 'off'
  recordLivestreams: boolean
  redownloadFreshUploads: boolean
  rssEnabled: boolean
  checking: boolean
  checkRequested: boolean
  lastCheckAt: string | null
  createdAt: string
  updatedAt: string
  archiveCount: number
  nextCheckAt: string | null
}

export interface SubscriptionList {
  subscriptions: Subscription[]
  total: number
}

/** Der Dialog arbeitet mit lauter Strings — leere Felder heißen „nicht gesetzt". */
export interface SubscriptionDraft {
  url: string
  name: string
  type: Subscription['type']
  mediaType: Subscription['mediaType']
  cron: string
  timerangeFrom: string
  titleRegex: string
  maxQuality: string
  customArgs: string
  customOutput: string
  sponsorblock: Subscription['sponsorblock']
  recordLivestreams: boolean
  redownloadFreshUploads: boolean
  rssEnabled: boolean
}

export const TYPES = ['channel', 'playlist', 'generic'] as const
export const MEDIA_TYPES = ['video', 'audio'] as const
export const QUALITIES = ['best', '1080p', '720p', 'audio'] as const
export const SPONSORBLOCK = ['remove', 'mark', 'off'] as const

export function emptyDraft(): SubscriptionDraft {
  return {
    url: '',
    name: '',
    type: 'channel',
    mediaType: 'video',
    cron: '0 */6 * * *',
    timerangeFrom: '',
    titleRegex: '',
    maxQuality: 'best',
    customArgs: '',
    customOutput: '',
    sponsorblock: 'off',
    recordLivestreams: false,
    redownloadFreshUploads: false,
    rssEnabled: false,
  }
}

export function draftFrom(subscription: Subscription): SubscriptionDraft {
  return {
    url: subscription.url,
    name: subscription.name,
    type: subscription.type,
    mediaType: subscription.mediaType,
    cron: subscription.cron,
    timerangeFrom: subscription.timerangeFrom ?? '',
    titleRegex: subscription.titleRegex ?? '',
    maxQuality: subscription.maxQuality ?? 'best',
    customArgs: subscription.customArgs ?? '',
    customOutput: subscription.customOutput ?? '',
    sponsorblock: subscription.sponsorblock,
    recordLivestreams: subscription.recordLivestreams,
    redownloadFreshUploads: subscription.redownloadFreshUploads,
    rssEnabled: subscription.rssEnabled,
  }
}

/** Der Server nimmt leere Strings als „Feld löschen" — deshalb gehen alle mit. */
export function draftBody(draft: SubscriptionDraft): Record<string, unknown> {
  return { ...draft, url: draft.url.trim(), name: draft.name.trim() }
}

/** „12 min", „3 h", „2 d" — dieselbe Kurzform für vorher und nachher. */
export function relativeLabel(iso: string | null, suffix: 'ago' | 'in' | ''): string {
  if (!iso) return '—'

  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return '—'

  const seconds = Math.max(0, Math.round(Math.abs(time - Date.now()) / 1000))
  const span = spanLabel(seconds)

  if (suffix === 'ago') return `${span} ago`
  if (suffix === 'in') return `in ${span}`
  return span
}

function spanLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h`
  return `${Math.round(seconds / 86_400)} d`
}

/**
 * Kopfzeile des Mockups: „5 subscriptions · next check in 12 min". Der frühste
 * anstehende Lauf gewinnt; pausierte Abos haben keinen.
 */
export function nextCheckLabel(subscriptions: Subscription[]): string {
  const next = subscriptions
    .map((subscription) => subscription.nextCheckAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0]

  return next ? `next check ${relativeLabel(next, 'in')}` : 'no check scheduled'
}
