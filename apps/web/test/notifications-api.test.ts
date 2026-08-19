import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addNotification, countUnreadNotifications, listNotifications, type Db } from '@fetcharr/db'

import { expectHttpError, setupNitroGlobals, type TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>

let db: Db
let handlers: Record<string, Handler>

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())

  handlers = {
    list: (await import('../server/api/notifications/index.get.ts')).default as Handler,
    read: (await import('../server/api/notifications/read.post.ts')).default as Handler,
    clear: (await import('../server/api/notifications/index.delete.ts')).default as Handler,
  }
})

function seed(count: number): number[] {
  const ids: number[] = []
  for (let index = 1; index <= count; index += 1) {
    ids.push(addNotification(db, { type: 'system', title: `N${String(index)}` }).id)
  }
  return ids
}

describe('GET /api/notifications', () => {
  it('liefert die neuesten Einträge mit Zählern', async () => {
    seed(3)

    const result = await handlers.list!({ query: {} })

    expect(result.total).toBe(3)
    expect(result.unread).toBe(3)
    expect(result.notifications.map((row: { title: string }) => row.title)).toEqual(['N3', 'N2', 'N1'])
  })

  it('paginiert über limit und offset', async () => {
    seed(5)

    const result = await handlers.list!({ query: { limit: '2', offset: '1' } })

    expect(result.limit).toBe(2)
    expect(result.offset).toBe(1)
    expect(result.notifications.map((row: { title: string }) => row.title)).toEqual(['N4', 'N3'])
  })

  it('filtert auf ungelesene', async () => {
    const ids = seed(3)
    await handlers.read!({ body: { ids: [ids[0]] } })

    const result = await handlers.list!({ query: { unread: 'true' } })

    expect(result.notifications).toHaveLength(2)
    expect(result.unread).toBe(2)
  })

  it('lehnt kaputte Zahlenparameter ab', async () => {
    const error = await expectHttpError(handlers.list!({ query: { limit: 'viele' } }))

    expect(error.statusCode).toBe(400)
  })
})

describe('POST /api/notifications/read', () => {
  it('quittiert einzelne Einträge', async () => {
    const ids = seed(3)

    const result = await handlers.read!({ body: { ids: [ids[0], ids[1]] } })

    expect(result).toEqual({ read: 2, unread: 1 })
  })

  it('quittiert alles', async () => {
    seed(4)

    const result = await handlers.read!({ body: { all: true } })

    expect(result).toEqual({ read: 4, unread: 0 })
    expect(countUnreadNotifications(db)).toBe(0)
  })

  it('verlangt ids oder all', async () => {
    const error = await expectHttpError(handlers.read!({ body: {} }))

    expect(error.statusCode).toBe(400)
  })

  it('weist unbrauchbare ids ab', async () => {
    const error = await expectHttpError(handlers.read!({ body: { ids: ['abc'] } }))

    expect(error.statusCode).toBe(400)
  })
})

describe('DELETE /api/notifications', () => {
  it('leert die Liste', async () => {
    seed(3)

    const result = await handlers.clear!({})

    expect(result).toEqual({ deleted: 3, unread: 0 })
    expect(listNotifications(db).total).toBe(0)
  })

  it('meldet auch die leere Liste ohne Fehler', async () => {
    expect(await handlers.clear!({})).toEqual({ deleted: 0, unread: 0 })
  })
})

describe('Notification-Stream', () => {
  it('liefert nur Einträge nach dem Cursor und den Zähler', async () => {
    const { collectNotifications } = await import('../server/api/events.get.ts')
    const [first] = seed(1)
    const second = addNotification(db, { type: 'system', title: 'Neu' })

    const update = collectNotifications(db, first!)

    expect(update.notifications.map((row) => row.id)).toEqual([second.id])
    expect(update.cursor).toBe(second.id)
    expect(update.unread).toBe(2)
  })

  it('schickt beim Verbinden den offenen Zählerstand, danach die neuen Einträge', async () => {
    vi.useFakeTimers()
    seed(2)

    const stream = {
      push: vi.fn(async () => {}),
      onClosed: vi.fn(),
      close: vi.fn(async () => {}),
      send: vi.fn(() => 'stream'),
    }
    vi.stubGlobal('createEventStream', () => stream)

    const handler = (await import('../server/api/events.get.ts')).default as Handler
    await handler({})

    const pushes = () => stream.push.mock.calls.map(([message]) => message as { event: string; data: string })
    const initial = pushes().find((message) => message.event === 'notifications')
    expect(initial).toBeDefined()
    expect(JSON.parse(initial!.data)).toMatchObject({ notifications: [], unread: 2 })

    addNotification(db, { type: 'download_finished', title: 'Fertig' })
    await vi.advanceTimersByTimeAsync(1000)

    const latest = pushes().filter((message) => message.event === 'notifications').at(-1)!
    const payload = JSON.parse(latest.data)
    expect(payload.unread).toBe(3)
    expect(payload.notifications).toHaveLength(1)
    expect(payload.notifications[0].title).toBe('Fertig')

    vi.useRealTimers()
  })
})
