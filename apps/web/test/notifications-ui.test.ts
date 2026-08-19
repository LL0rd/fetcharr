import { describe, expect, it } from 'vitest'

import {
  badgeLabel,
  mergeNotifications,
  notificationAge,
  type NotificationItem,
} from '../app/components/notifications/notifications'

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 1,
    type: 'download_finished',
    title: 'Download finished',
    body: null,
    url: null,
    read: false,
    createdAt: new Date('2026-08-19T10:00:00Z').toISOString(),
    ...overrides,
  }
}

describe('notificationAge', () => {
  const now = new Date('2026-08-19T12:00:00Z').getTime()

  function age(iso: string): string {
    return notificationAge(iso, now)
  }

  it('rechnet in Sekunden, Minuten, Stunden und Tagen', () => {
    expect(age('2026-08-19T11:59:30Z')).toBe('30 s')
    expect(age('2026-08-19T11:58:00Z')).toBe('2 min')
    expect(age('2026-08-19T08:00:00Z')).toBe('4 h')
    expect(age('2026-08-18T12:00:00Z')).toBe('1 d')
  })

  it('behandelt einen Zeitstempel aus der Zukunft als eben erst', () => {
    expect(age('2026-08-19T12:05:00Z')).toBe('0 s')
  })

  it('bleibt bei kaputten Daten still', () => {
    expect(age('gestern')).toBe('—')
  })
})

describe('badgeLabel', () => {
  it('zeigt nichts, solange alles gelesen ist', () => {
    expect(badgeLabel(0)).toBeNull()
    expect(badgeLabel(-1)).toBeNull()
  })

  it('zeigt die Zahl und deckelt bei 99+', () => {
    expect(badgeLabel(3)).toBe('3')
    expect(badgeLabel(99)).toBe('99')
    expect(badgeLabel(100)).toBe('99+')
  })
})

describe('mergeNotifications', () => {
  it('sortiert nach id absteigend', () => {
    const merged = mergeNotifications([item({ id: 1 })], [item({ id: 3 }), item({ id: 2 })])

    expect(merged.map((entry) => entry.id)).toEqual([3, 2, 1])
  })

  it('lässt den neueren Stand gewinnen', () => {
    const merged = mergeNotifications([item({ id: 1, read: false })], [item({ id: 1, read: true })])

    expect(merged).toHaveLength(1)
    expect(merged[0]!.read).toBe(true)
  })

  it('kommt mit leeren Listen zurecht', () => {
    expect(mergeNotifications([], [])).toEqual([])
    expect(mergeNotifications([item()], [])).toHaveLength(1)
  })
})
