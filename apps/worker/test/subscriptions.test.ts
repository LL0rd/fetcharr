import { beforeEach, describe, expect, it } from 'vitest'
import {
  addArchiveEntry,
  createDb,
  createSubscription,
  getJobSubId,
  hasArchiveEntry,
  listArchive,
  listJobs,
  type Db,
  type Subscription,
} from '@fetcharr/db'

import {
  checkSubscription,
  extractorFromUrl,
  parsePlaylistJson,
  type PlaylistEntry,
} from '../src/subscriptions.ts'

let db: Db

beforeEach(() => {
  db = createDb(':memory:')
})

const NOW = Date.parse('2026-08-19T12:00:00Z')
const HOUR = 3600_000

function sub(overrides: Partial<Parameters<typeof createSubscription>[1]> = {}): Subscription {
  return createSubscription(db, {
    url: 'https://www.youtube.com/@channel',
    name: 'Channel',
    ...overrides,
  })
}

function entry(overrides: Partial<PlaylistEntry> = {}): PlaylistEntry {
  const id = overrides.id ?? 'a1'
  return {
    id,
    title: 'Folge 1',
    url: `https://youtu.be/${id}`,
    timestamp: (NOW - 10 * 24 * HOUR) / 1000,
    ie_key: 'Youtube',
    ...overrides,
  }
}

function check(subscription: Subscription, entries: PlaylistEntry[]) {
  return checkSubscription({
    db,
    sub: subscription,
    fetchEntries: () => Promise.resolve(entries),
    now: () => NOW,
  })
}

describe('checkSubscription', () => {
  it('legt für neue Einträge Jobs mit subId und Priorität 2 an', async () => {
    const subscription = sub()

    const result = await check(subscription, [entry(), entry({ id: 'b2', url: 'https://youtu.be/b2' })])

    expect(result.created).toBe(2)
    const jobs = listJobs(db)
    expect(jobs).toHaveLength(2)
    expect(jobs[0]?.priority).toBe(2)
    // listJobs mappt sub_id (noch) nicht — der Wert kommt direkt aus dem Repository.
    expect(jobs.every((job) => getJobSubId(db, job.uid) === subscription.id)).toBe(true)
    expect(jobs.map((job) => job.url).sort()).toEqual([
      'https://youtu.be/a1',
      'https://youtu.be/b2',
    ])
  })

  it('schreibt Format, SponsorBlock, Args und Zielordner in die Job-Optionen', async () => {
    const subscription = sub({
      maxQuality: '720p',
      sponsorblock: 'remove',
      customArgs: '--no-playlist',
      customOutput: '%(title)s',
    })

    await check(subscription, [entry()])

    expect(listJobs(db)[0]?.options).toMatchObject({
      format: '720p',
      sponsorblock: 'remove',
      customArgs: '--no-playlist',
      outputTemplate: '%(title)s',
      targetFolder: `subscriptions/${subscription.name}`,
    })
  })

  it('lädt Audio-Subscriptions als Audio', async () => {
    await check(sub({ mediaType: 'audio', maxQuality: '1080p' }), [entry()])

    const job = listJobs(db)[0]
    expect(job?.type).toBe('audio')
    expect(job?.options).toMatchObject({ format: 'audio' })
  })

  it('überspringt Einträge, die schon im Archiv der Subscription stehen', async () => {
    const subscription = sub()
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', subId: subscription.id })

    const result = await check(subscription, [entry(), entry({ id: 'b2' })])

    expect(result.created).toBe(1)
    expect(listJobs(db)[0]?.url).toContain('b2')
  })

  it('ignoriert Archiv-Einträge einer anderen Subscription', async () => {
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', subId: 'fremd' })

    expect((await check(sub(), [entry()])).created).toBe(1)
  })

  it('filtert nach titleRegex', async () => {
    const result = await check(sub({ titleRegex: '^Folge' }), [
      entry(),
      entry({ id: 'b2', title: 'Trailer' }),
    ])

    expect(result.created).toBe(1)
    expect(listJobs(db)[0]?.title).toBe('Folge 1')
  })

  it('ignoriert einen kaputten titleRegex, statt den Check abzubrechen', async () => {
    const result = await check(sub({ titleRegex: '([' }), [entry()])

    expect(result.created).toBe(1)
  })

  it('filtert Einträge vor timerangeFrom aus', async () => {
    const result = await check(sub({ timerangeFrom: '20260810' }), [
      entry({ id: 'alt', upload_date: '20260801', timestamp: null }),
      entry({ id: 'neu', upload_date: '20260815', timestamp: null }),
    ])

    expect(result.created).toBe(1)
    expect(listJobs(db)[0]?.url).toContain('neu')
  })

  it('überspringt laufende Livestreams ohne recordLivestreams', async () => {
    const result = await check(sub(), [entry({ live_status: 'is_live' })])

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('nimmt Livestreams mit --live-from-start auf, wenn erlaubt', async () => {
    await check(sub({ recordLivestreams: true, customArgs: '--no-part' }), [
      entry({ live_status: 'is_live' }),
    ])

    expect(listJobs(db)[0]?.options).toMatchObject({
      customArgs: '--no-part --live-from-start',
    })
  })

  it('lädt beendete Livestreams wie normale Videos', async () => {
    const result = await check(sub(), [entry({ live_status: 'was_live' })])

    expect(result.created).toBe(1)
    expect(listJobs(db)[0]?.options).not.toMatchObject({ customArgs: expect.any(String) })
  })

  it('lädt frische Uploads bei redownloadFreshUploads erneut', async () => {
    const subscription = sub({ redownloadFreshUploads: true })
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'frisch', subId: subscription.id })
    addArchiveEntry(db, { extractor: 'youtube', mediaId: 'alt', subId: subscription.id })

    const result = await check(subscription, [
      entry({ id: 'frisch', timestamp: (NOW - 3 * HOUR) / 1000 }),
      entry({ id: 'alt', timestamp: (NOW - 90 * HOUR) / 1000 }),
    ])

    expect(result.created).toBe(1)
    expect(listJobs(db)[0]?.url).toContain('frisch')
  })

  it('ergänzt fehlende URLs aus der YouTube-Video-id', async () => {
    await check(sub(), [entry({ url: null, webpage_url: null })])

    expect(listJobs(db)[0]?.url).toBe('https://www.youtube.com/watch?v=a1')
  })

  it('meldet Fehler des Abrufs zurück, ohne zu werfen', async () => {
    const result = await checkSubscription({
      db,
      sub: sub(),
      fetchEntries: () => Promise.reject(new Error('yt-dlp exit 1')),
      now: () => NOW,
    })

    expect(result.created).toBe(0)
    expect(result.error).toContain('yt-dlp exit 1')
    expect(listJobs(db)).toHaveLength(0)
  })

  it('schreibt beim Check noch nichts ins Archiv', async () => {
    const subscription = sub()

    await check(subscription, [entry()])

    expect(hasArchiveEntry(db, { extractor: 'youtube', mediaId: 'a1', subId: subscription.id })).toBe(
      false,
    )
    expect(listArchive(db).total).toBe(0)
  })
})

describe('parsePlaylistJson', () => {
  it('liest die Einträge einer Playlist', () => {
    const entries = parsePlaylistJson(
      JSON.stringify({ _type: 'playlist', entries: [{ id: 'a1' }, { id: 'b2' }] }),
    )

    expect(entries.map((item) => item.id)).toEqual(['a1', 'b2'])
  })

  it('flacht verschachtelte Playlists ab', () => {
    const entries = parsePlaylistJson(
      JSON.stringify({ entries: [{ _type: 'playlist', entries: [{ id: 'a1' }] }, { id: 'b2' }] }),
    )

    expect(entries.map((item) => item.id)).toEqual(['a1', 'b2'])
  })

  it('behandelt ein einzelnes Video als einelementige Liste', () => {
    expect(parsePlaylistJson(JSON.stringify({ id: 'a1', title: 'Solo' }))).toHaveLength(1)
  })

  it('liefert bei kaputtem JSON eine leere Liste', () => {
    expect(parsePlaylistJson('nope')).toEqual([])
  })
})

describe('extractorFromUrl', () => {
  it('erkennt YouTube', () => {
    expect(extractorFromUrl('https://www.youtube.com/@channel')).toBe('youtube')
    expect(extractorFromUrl('https://youtu.be/a1')).toBe('youtube')
  })

  it('fällt auf den Host zurück', () => {
    expect(extractorFromUrl('https://vimeo.com/channels/x')).toBe('vimeo')
    expect(extractorFromUrl('kein-url')).toBe('generic')
  })
})
