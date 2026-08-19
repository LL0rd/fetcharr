import { Feed } from 'feed'
import type { H3Event } from 'h3'

import { getSubscription } from '@fetcharr/db'
import type { Subscription } from '@fetcharr/db'

import { getAdmin } from '../../utils/auth.ts'
import { contentTypeFor } from '../../utils/media.ts'

const MAX_ITEMS = 300

interface EpisodeRow {
  uid: string
  title: string
  uploader: string | null
  path: string
  size_bytes: number | null
  duration_sec: number | null
  created_at: number
}

/**
 * Podcast-Feed einer Audio-Subscription. Der Feed selbst hängt hinter dem
 * Auth-Guard (`?apiKey=`); die enclosure-URLs tragen denselben Key, damit
 * Podcast-Clients die Dateien ohne Session laden können.
 */
export default defineEventHandler(async (event) => {
  const subId = getRouterParam(event, 'subId') ?? ''
  const db = await useDb()

  const sub = getSubscription(db, subId)

  // Ein nicht freigeschalteter Feed verrät nicht, dass es die Subscription gibt.
  if (!sub || !sub.rssEnabled || sub.mediaType !== 'audio') {
    throw createError({ statusCode: 404, statusMessage: 'Feed not found' })
  }

  const rows = db.$client
    .prepare(
      `SELECT uid, title, uploader, path, size_bytes, duration_sec, created_at
         FROM files WHERE sub_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?`,
    )
    .all(subId, MAX_ITEMS) as EpisodeRow[]

  const feed = buildFeed(sub, rows, {
    base: baseUrl(event),
    apiKey: getAdmin(db)?.apiKey ?? '',
  })

  setResponseHeader(event, 'Content-Type', 'application/rss+xml; charset=utf-8')
  return feed
})

export function buildFeed(
  sub: Subscription,
  rows: EpisodeRow[],
  context: { base: string; apiKey: string },
): string {
  const key = encodeURIComponent(context.apiKey)
  const feed = new Feed({
    id: `fetcharr:subscription:${sub.id}`,
    title: sub.name,
    description: `Audio downloads from ${sub.url}`,
    link: sub.url,
    language: 'en',
    podcast: true,
    author: { name: sub.name },
    updated: rows.length ? new Date(rows[0]!.created_at * 1000) : new Date(),
    feedLinks: { rss: `${context.base}/api/rss/${sub.id}?apiKey=${key}` },
    copyright: '',
  })

  for (const row of rows) {
    const url = `${context.base}/api/stream/${row.uid}?apiKey=${key}`
    feed.addItem({
      title: row.title,
      id: row.uid,
      guid: row.uid,
      link: url,
      date: new Date(row.created_at * 1000),
      description: row.uploader ? `${row.title} — ${row.uploader}` : row.title,
      author: row.uploader ? [{ name: row.uploader }] : undefined,
      audio: {
        url,
        type: contentTypeFor(row.path),
        length: row.size_bytes ?? 0,
        duration: row.duration_sec ? Math.round(row.duration_sec) : undefined,
      },
    })
  }

  return feed.rss2()
}

/**
 * Hinter einem Reverse-Proxy stimmt der Request-Host nicht immer — `PUBLIC_URL`
 * setzt die von außen erreichbare Basis, sonst gilt die Request-Herkunft.
 */
function baseUrl(event: H3Event): string {
  const configured = process.env.PUBLIC_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')

  return getRequestURL(event).origin
}
