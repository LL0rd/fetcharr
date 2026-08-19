import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDb, listNotifications, type Db } from '@fetcharr/db'

import {
  createNotification,
  notifyDownloadError,
  notifyDownloadFinished,
  notifySubscriptionFound,
  notifyTaskConfirm,
} from '../src/notify.ts'

let db: Db
let fetchMock: ReturnType<typeof vi.fn>
let logged: string[]

beforeEach(() => {
  db = createDb(':memory:')
  logged = []
  fetchMock = vi.fn(async () => new Response('', { status: 200 }))
})

function setting(key: string, value: unknown): void {
  db.$client
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value))
}

function options() {
  return { fetch: fetchMock as unknown as typeof fetch, log: (message: string) => logged.push(message) }
}

interface Call {
  url: string
  init: RequestInit & { headers?: Record<string, string> }
}

function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: (init ?? {}) as Call['init'] }))
}

function bodyOf(call: Call): any {
  return JSON.parse(String(call.init.body))
}

describe('createNotification', () => {
  it('schreibt die Notification in die DB', async () => {
    await createNotification(db, {
      type: 'download_finished',
      title: 'Download finished',
      body: 'Timekeeping',
      url: '/library',
    }, options())

    const { notifications, unread } = listNotifications(db)
    expect(unread).toBe(1)
    expect(notifications[0]).toMatchObject({
      type: 'download_finished',
      title: 'Download finished',
      body: 'Timekeeping',
      url: '/library',
      read: false,
    })
  })

  it('ruft ohne konfigurierte Kanäle kein fetch auf', async () => {
    await createNotification(db, { type: 'system', title: 'Hallo' }, options())

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('schickt an ntfy als Plain-Text mit Titel-Header', async () => {
    setting('ntfy_url', 'https://ntfy.sh/fetcharr')

    await createNotification(
      db,
      { type: 'system', title: 'Download finished', body: '481 MB', url: '/library' },
      options(),
    )

    const [call] = calls()
    expect(call!.url).toBe('https://ntfy.sh/fetcharr')
    expect(call!.init.method).toBe('POST')
    expect(call!.init.headers?.Title).toBe('Download finished')
    expect(call!.init.body).toBe('481 MB')
  })

  it('schickt an Gotify mit Token in der Query', async () => {
    setting('gotify_url', 'https://gotify.example.com/')
    setting('gotify_token', 'abc123')

    await createNotification(db, { type: 'system', title: 'Titel', body: 'Text' }, options())

    const [call] = calls()
    expect(call!.url).toBe('https://gotify.example.com/message?token=abc123')
    expect(bodyOf(call!)).toMatchObject({ title: 'Titel', message: 'Text' })
  })

  it('lässt Gotify aus, wenn der Token fehlt', async () => {
    setting('gotify_url', 'https://gotify.example.com')

    await createNotification(db, { type: 'system', title: 'Titel' }, options())

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('schickt an Discord als Embed', async () => {
    setting('discord_webhook_url', 'https://discord.com/api/webhooks/1/2')

    await createNotification(db, { type: 'system', title: 'Titel', body: 'Text' }, options())

    const [call] = calls()
    const embed = bodyOf(call!).embeds[0]
    expect(embed).toMatchObject({ title: 'Titel', description: 'Text' })
  })

  it('schickt an den generischen Webhook das volle JSON', async () => {
    setting('webhook_url', 'https://example.com/hook')

    await createNotification(
      db,
      { type: 'download_error', title: 'Download failed', body: 'attempt 2/3', url: '/' },
      options(),
    )

    const [call] = calls()
    expect(call!.init.headers?.['Content-Type']).toBe('application/json')
    expect(bodyOf(call!)).toMatchObject({
      type: 'download_error',
      title: 'Download failed',
      body: 'attempt 2/3',
      url: '/',
    })
  })

  it('bedient mehrere Kanäle gleichzeitig', async () => {
    setting('ntfy_url', 'https://ntfy.sh/fetcharr')
    setting('webhook_url', 'https://example.com/hook')

    await createNotification(db, { type: 'system', title: 'Titel' }, options())

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('notify_types', () => {
  beforeEach(() => {
    setting('ntfy_url', 'https://ntfy.sh/fetcharr')
  })

  it('lässt bei leerer Liste alles durch', async () => {
    setting('notify_types', [])

    await createNotification(db, { type: 'download_error', title: 'Titel' }, options())

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('schickt nur freigeschaltete Typen nach außen', async () => {
    setting('notify_types', ['download_error'])

    await createNotification(db, { type: 'download_finished', title: 'Fertig' }, options())
    expect(fetchMock).not.toHaveBeenCalled()

    await createNotification(db, { type: 'download_error', title: 'Fehler' }, options())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('speichert gefilterte Typen trotzdem in der DB', async () => {
    setting('notify_types', ['download_error'])

    await createNotification(db, { type: 'download_finished', title: 'Fertig' }, options())

    expect(listNotifications(db).total).toBe(1)
  })
})

describe('Fehlerbehandlung der Kanäle', () => {
  it('wirft nicht, wenn fetch scheitert, und protokolliert den Fehler', async () => {
    setting('ntfy_url', 'https://ntfy.sh/fetcharr')
    fetchMock.mockRejectedValue(new Error('connection refused'))

    const entry = await createNotification(db, { type: 'system', title: 'Titel' }, options())

    expect(entry.id).toBeGreaterThan(0)
    expect(logged.join('\n')).toContain('connection refused')
  })

  it('protokolliert einen HTTP-Fehlerstatus', async () => {
    setting('webhook_url', 'https://example.com/hook')
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))

    await createNotification(db, { type: 'system', title: 'Titel' }, options())

    expect(logged.join('\n')).toContain('500')
  })

  it('ignoriert eine kaputte URL, ohne den DB-Eintrag zu verlieren', async () => {
    setting('gotify_url', 'nicht-mal-eine-url')
    setting('gotify_token', 'abc')

    await createNotification(db, { type: 'system', title: 'Titel' }, options())

    expect(listNotifications(db).total).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Ereignis-Helfer', () => {
  it('formatiert den fertigen Download mit Größe', async () => {
    await notifyDownloadFinished(
      db,
      { title: 'A Brief History of Timekeeping', sizeBytes: 504_365_056, uid: 'f83a1c' },
      options(),
    )

    const [entry] = listNotifications(db).notifications
    expect(entry!.type).toBe('download_finished')
    expect(entry!.title).toBe('Download finished')
    expect(entry!.body).toBe("'A Brief History of Timekeeping' — 481 MB")
    expect(entry!.url).toBe('/watch/f83a1c')
  })

  it('lässt die Größe weg, wenn sie unbekannt ist', async () => {
    await notifyDownloadFinished(db, { title: 'Ohne Größe', sizeBytes: null, uid: 'x1' }, options())

    expect(listNotifications(db).notifications[0]!.body).toBe("'Ohne Größe'")
  })

  it('nennt beim Fehler den Versuch', async () => {
    await notifyDownloadError(db, { title: 'Data Center', attempts: 2, maxAttempts: 3 }, options())

    const [entry] = listNotifications(db).notifications
    expect(entry!.type).toBe('download_error')
    expect(entry!.title).toBe('Download failed')
    expect(entry!.body).toBe("'Data Center' — attempt 2/3")
    expect(entry!.url).toBe('/')
  })

  it('meldet Subscription-Funde mit Anzahl', async () => {
    await notifySubscriptionFound(db, { name: 'Kurzgesagt', count: 2 }, options())

    const [entry] = listNotifications(db).notifications
    expect(entry!.type).toBe('subscription_found')
    expect(entry!.title).toBe('Subscription found 2 new videos')
    expect(entry!.body).toBe('Kurzgesagt')
    expect(entry!.url).toBe('/subscriptions')
  })

  it('setzt den Singular bei genau einem Fund', async () => {
    await notifySubscriptionFound(db, { name: 'Kurzgesagt', count: 1 }, options())

    expect(listNotifications(db).notifications[0]!.title).toBe('Subscription found 1 new video')
  })

  it('meldet einen bestätigungspflichtigen Task', async () => {
    await notifyTaskConfirm(db, { task: 'Missing files check', count: 3 }, options())

    const [entry] = listNotifications(db).notifications
    expect(entry!.type).toBe('task_confirm')
    expect(entry!.title).toBe('Task needs confirmation')
    expect(entry!.body).toBe("'Missing files check' found 3 items")
    expect(entry!.url).toBe('/tasks')
  })
})
