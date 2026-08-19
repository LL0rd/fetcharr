import { describe, it, expect, beforeEach } from 'vitest'

import { createDb, type Db } from '../src/index.ts'
import {
  addNotification,
  countUnreadNotifications,
  deleteAllNotifications,
  listNotifications,
  listNotificationsSince,
  markAllNotificationsRead,
  markNotificationsRead,
  NOTIFICATIONS_DEFAULT_LIMIT,
  NOTIFICATIONS_MAX_LIMIT,
} from '../src/notifications.ts'

let db: Db

beforeEach(() => {
  db = createDb(':memory:')
})

describe('addNotification', () => {
  it('legt eine ungelesene Notification an', () => {
    const entry = addNotification(db, {
      type: 'download_finished',
      title: 'Download finished',
      body: "'Timekeeping' — 481 MB",
      url: '/library',
    })

    expect(entry.id).toBeGreaterThan(0)
    expect(entry.read).toBe(false)
    expect(entry.body).toBe("'Timekeeping' — 481 MB")
    expect(entry.url).toBe('/library')
    expect(entry.createdAt).toBeInstanceOf(Date)
  })

  it('lässt body und url weg, wenn nichts mitkommt', () => {
    const entry = addNotification(db, { type: 'system', title: 'Hallo' })

    expect(entry.body).toBeNull()
    expect(entry.url).toBeNull()
  })
})

describe('listNotifications', () => {
  beforeEach(() => {
    for (let index = 1; index <= 5; index += 1) {
      addNotification(db, { type: 'system', title: `N${String(index)}` })
    }
  })

  it('liefert die neuesten zuerst', () => {
    const { notifications, total, unread } = listNotifications(db)

    expect(total).toBe(5)
    expect(unread).toBe(5)
    expect(notifications.map((row) => row.title)).toEqual(['N5', 'N4', 'N3', 'N2', 'N1'])
  })

  it('paginiert über limit/offset', () => {
    const page = listNotifications(db, { limit: 2, offset: 2 })

    expect(page.total).toBe(5)
    expect(page.notifications.map((row) => row.title)).toEqual(['N3', 'N2'])
  })

  it('filtert auf ungelesene', () => {
    const all = listNotifications(db).notifications
    markNotificationsRead(db, [all[0]!.id, all[1]!.id])

    const page = listNotifications(db, { unreadOnly: true })

    expect(page.notifications.map((row) => row.title)).toEqual(['N3', 'N2', 'N1'])
    // total zählt den Filter mit, unread bleibt der globale Zähler.
    expect(page.total).toBe(3)
    expect(page.unread).toBe(3)
  })

  it('begrenzt das Limit auf das erlaubte Maximum', () => {
    const page = listNotifications(db, { limit: NOTIFICATIONS_MAX_LIMIT + 500 })

    expect(page.limit).toBe(NOTIFICATIONS_MAX_LIMIT)
  })

  it('nutzt ohne Angabe das Default-Limit', () => {
    expect(listNotifications(db).limit).toBe(NOTIFICATIONS_DEFAULT_LIMIT)
  })
})

describe('markNotificationsRead / markAllNotificationsRead', () => {
  it('markiert einzelne Einträge und meldet die Anzahl', () => {
    const first = addNotification(db, { type: 'system', title: 'A' })
    addNotification(db, { type: 'system', title: 'B' })

    expect(markNotificationsRead(db, [first.id])).toBe(1)
    expect(countUnreadNotifications(db)).toBe(1)
    // Ein zweiter Aufruf ändert nichts mehr.
    expect(markNotificationsRead(db, [first.id])).toBe(0)
  })

  it('ignoriert leere Id-Listen und unbekannte Ids', () => {
    addNotification(db, { type: 'system', title: 'A' })

    expect(markNotificationsRead(db, [])).toBe(0)
    expect(markNotificationsRead(db, [9999])).toBe(0)
    expect(countUnreadNotifications(db)).toBe(1)
  })

  it('markiert alles auf einen Schlag', () => {
    addNotification(db, { type: 'system', title: 'A' })
    addNotification(db, { type: 'system', title: 'B' })

    expect(markAllNotificationsRead(db)).toBe(2)
    expect(countUnreadNotifications(db)).toBe(0)
  })
})

describe('deleteAllNotifications', () => {
  it('leert die Liste und meldet die Anzahl', () => {
    addNotification(db, { type: 'system', title: 'A' })
    addNotification(db, { type: 'system', title: 'B' })

    expect(deleteAllNotifications(db)).toBe(2)
    expect(listNotifications(db).total).toBe(0)
  })
})

describe('listNotificationsSince', () => {
  it('liefert nur Einträge mit größerer id, älteste zuerst', () => {
    const first = addNotification(db, { type: 'system', title: 'A' })
    const second = addNotification(db, { type: 'system', title: 'B' })
    const third = addNotification(db, { type: 'system', title: 'C' })

    const fresh = listNotificationsSince(db, first.id)

    expect(fresh.map((row) => row.id)).toEqual([second.id, third.id])
    expect(listNotificationsSince(db, third.id)).toEqual([])
  })

  it('liefert ab Cursor 0 alles', () => {
    addNotification(db, { type: 'system', title: 'A' })

    expect(listNotificationsSince(db, 0)).toHaveLength(1)
  })
})
