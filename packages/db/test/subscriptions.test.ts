import { describe, it, expect, beforeEach } from 'vitest'

import { createDb, type Db } from '../src/index.ts'
import { getJob } from '../src/jobs.ts'
import {
  beginCheck,
  createSubscription,
  createSubscriptionJob,
  deleteSubscription,
  endCheck,
  getJobSubId,
  getSubscription,
  listSubscriptions,
  requestCheck,
  setFileSubscription,
  subscriptionsRevision,
  takeCheckRequests,
  updateSubscription,
  type CreateSubscriptionInput,
} from '../src/subscriptions.ts'

let db: Db

beforeEach(() => {
  db = createDb(':memory:')
})

function create(input: Partial<CreateSubscriptionInput> = {}) {
  return createSubscription(db, {
    url: 'https://www.youtube.com/@channel',
    name: 'Channel',
    ...input,
  })
}

describe('createSubscription', () => {
  it('legt eine Subscription mit Defaults an', () => {
    const sub = create()

    expect(sub.id).toMatch(/\S/)
    expect(sub.type).toBe('channel')
    expect(sub.mediaType).toBe('video')
    expect(sub.cron).toBe('0 */6 * * *')
    expect(sub.paused).toBe(false)
    expect(sub.checking).toBe(false)
    expect(sub.checkRequested).toBe(false)
    expect(sub.sponsorblock).toBe('off')
    expect(sub.lastCheckAt).toBeNull()
    expect(sub.createdAt).toBeInstanceOf(Date)
  })

  it('übernimmt alle Felder', () => {
    const sub = create({
      name: 'Podcast',
      type: 'playlist',
      mediaType: 'audio',
      cron: '0 3 * * *',
      paused: true,
      timerangeFrom: '20260101',
      titleRegex: '^Folge',
      maxQuality: '720p',
      customArgs: '--no-playlist',
      customOutput: '%(title)s',
      sponsorblock: 'remove',
      recordLivestreams: true,
      redownloadFreshUploads: true,
      rssEnabled: true,
    })

    expect(sub).toMatchObject({
      name: 'Podcast',
      type: 'playlist',
      mediaType: 'audio',
      cron: '0 3 * * *',
      paused: true,
      timerangeFrom: '20260101',
      titleRegex: '^Folge',
      maxQuality: '720p',
      customArgs: '--no-playlist',
      customOutput: '%(title)s',
      sponsorblock: 'remove',
      recordLivestreams: true,
      redownloadFreshUploads: true,
      rssEnabled: true,
    })
  })
})

describe('listSubscriptions / getSubscription', () => {
  it('liefert alle Subscriptions nach Name sortiert', () => {
    create({ name: 'Zebra' })
    create({ name: 'Alpha' })

    expect(listSubscriptions(db).map((sub) => sub.name)).toEqual(['Alpha', 'Zebra'])
  })

  it('liefert null für unbekannte ids', () => {
    expect(getSubscription(db, 'nope')).toBeNull()
  })
})

describe('updateSubscription', () => {
  it('ändert nur die übergebenen Felder', () => {
    const sub = create({ titleRegex: '^Folge' })

    const updated = updateSubscription(db, sub.id, { name: 'Neuer Name', paused: true })

    expect(updated).toMatchObject({ name: 'Neuer Name', paused: true, titleRegex: '^Folge' })
  })

  it('setzt nullbare Felder mit null zurück', () => {
    const sub = create({ titleRegex: '^Folge', timerangeFrom: '20260101' })

    const updated = updateSubscription(db, sub.id, { titleRegex: null })

    expect(updated?.titleRegex).toBeNull()
    expect(updated?.timerangeFrom).toBe('20260101')
  })

  it('liefert null für unbekannte ids', () => {
    expect(updateSubscription(db, 'nope', { name: 'x' })).toBeNull()
  })
})

describe('deleteSubscription', () => {
  it('entfernt Subscription samt Archiv-Einträgen', () => {
    const sub = create()
    db.$client
      .prepare(
        `INSERT INTO archive (extractor, media_id, type, sub_id, created_at)
         VALUES ('youtube', 'a1', 'video', ?, unixepoch())`,
      )
      .run(sub.id)

    expect(deleteSubscription(db, sub.id)).toBe(true)
    expect(getSubscription(db, sub.id)).toBeNull()
    expect(db.$client.prepare('SELECT COUNT(*) AS n FROM archive').get()).toEqual({ n: 0 })
  })

  it('meldet false, wenn nichts zu löschen war', () => {
    expect(deleteSubscription(db, 'nope')).toBe(false)
  })
})

describe('Check-Flags', () => {
  it('beginCheck greift nur einmal', () => {
    const sub = create()

    expect(beginCheck(db, sub.id)).toBe(true)
    expect(beginCheck(db, sub.id)).toBe(false)
    expect(getSubscription(db, sub.id)?.checking).toBe(true)
  })

  it('endCheck setzt lastCheckAt und gibt den Slot frei', () => {
    const sub = create()
    beginCheck(db, sub.id)

    endCheck(db, sub.id)

    const after = getSubscription(db, sub.id)
    expect(after?.checking).toBe(false)
    expect(after?.lastCheckAt).toBeInstanceOf(Date)
  })

  it('endCheck lässt updated_at unangetastet', () => {
    const sub = create()
    db.$client.prepare('UPDATE subscriptions SET updated_at = 1 WHERE id = ?').run(sub.id)

    beginCheck(db, sub.id)
    endCheck(db, sub.id)

    const row = db.$client
      .prepare('SELECT updated_at FROM subscriptions WHERE id = ?')
      .get(sub.id) as { updated_at: number }
    expect(row.updated_at).toBe(1)
  })

  it('takeCheckRequests liefert angeforderte Checks genau einmal', () => {
    const first = create({ name: 'A' })
    create({ name: 'B' })

    requestCheck(db, first.id)

    expect(takeCheckRequests(db)).toEqual([first.id])
    expect(takeCheckRequests(db)).toEqual([])
  })
})

describe('subscriptionsRevision', () => {
  it('ändert sich bei Anlage, Änderung und Löschung', () => {
    const empty = subscriptionsRevision(db)

    const sub = create()
    const created = subscriptionsRevision(db)
    expect(created).not.toBe(empty)

    db.$client.prepare('UPDATE subscriptions SET updated_at = 999 WHERE id = ?').run(sub.id)
    const changed = subscriptionsRevision(db)
    expect(changed).not.toBe(created)

    deleteSubscription(db, sub.id)
    expect(subscriptionsRevision(db)).not.toBe(changed)
  })

  it('erkennt Cron- und Pause-Änderungen innerhalb derselben Sekunde', () => {
    const sub = create({ cron: '0 * * * *' })
    const before = subscriptionsRevision(db)

    updateSubscription(db, sub.id, { paused: true })
    const paused = subscriptionsRevision(db)
    expect(paused).not.toBe(before)

    updateSubscription(db, sub.id, { cron: '0 3 * * *' })
    expect(subscriptionsRevision(db)).not.toBe(paused)
  })

  it('bleibt bei einem Check stabil', () => {
    const sub = create()
    const before = subscriptionsRevision(db)

    beginCheck(db, sub.id)
    endCheck(db, sub.id)

    expect(subscriptionsRevision(db)).toBe(before)
  })
})

describe('createSubscriptionJob', () => {
  it('legt einen Job mit subId und Priorität an', () => {
    const sub = create()

    const job = createSubscriptionJob(db, {
      url: 'https://youtu.be/a1',
      type: 'video',
      options: { format: 'best' },
      priority: 2,
      subId: sub.id,
      title: 'Folge 1',
    })

    expect(job.priority).toBe(2)
    expect(job.title).toBe('Folge 1')
    expect(getJobSubId(db, job.uid)).toBe(sub.id)
    expect(getJob(db, job.uid)?.status).toBe('queued')
  })
})

describe('setFileSubscription', () => {
  it('schreibt die subId in die Bibliothek', () => {
    const sub = create()
    db.$client
      .prepare(
        `INSERT INTO files (uid, url, title, type, path, view_count, favorite, created_at)
         VALUES ('f1', 'https://youtu.be/a1', 'Folge 1', 'video', 'video/a.mp4', 0, 0, unixepoch())`,
      )
      .run()

    expect(setFileSubscription(db, 'f1', sub.id)).toBe(true)
    const row = db.$client.prepare('SELECT sub_id FROM files WHERE uid = ?').get('f1') as {
      sub_id: string
    }
    expect(row.sub_id).toBe(sub.id)
  })
})
