import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDb,
  createSubscription,
  getSubscription,
  requestCheck,
  updateSubscription,
  type Db,
  type Subscription,
} from '@fetcharr/db'

import { startScheduler, type Scheduler } from '../src/scheduler.ts'

let db: Db
let scheduler: Scheduler | null

beforeEach(() => {
  db = createDb(':memory:')
  scheduler = null
})

afterEach(async () => {
  await scheduler?.stop()
})

const EVERY_SECOND = '* * * * * *'

function sub(overrides: Partial<Parameters<typeof createSubscription>[1]> = {}) {
  return createSubscription(db, {
    url: 'https://www.youtube.com/@channel',
    name: 'Channel',
    ...overrides,
  })
}

function recorder() {
  const checked: string[] = []

  return {
    checked,
    runCheck: (subscription: Subscription) => {
      checked.push(subscription.id)
      return Promise.resolve()
    },
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('startScheduler', () => {
  it('plant aktive Subscriptions ein und lässt pausierte aus', () => {
    const active = sub({ name: 'Aktiv' })
    sub({ name: 'Pausiert', paused: true })

    scheduler = startScheduler({ db, runCheck: () => Promise.resolve() })

    expect(scheduler.scheduled).toEqual([active.id])
  })

  it('führt einen Check nach Cron-Plan aus', async () => {
    const subscription = sub({ cron: EVERY_SECOND })
    const runs = recorder()

    scheduler = startScheduler({ db, runCheck: runs.runCheck })

    await waitFor(() => runs.checked.length > 0)
    expect(runs.checked[0]).toBe(subscription.id)
  })

  it('übernimmt Änderungen an der Tabelle beim Poll', async () => {
    const runs = recorder()
    scheduler = startScheduler({ db, runCheck: runs.runCheck, pollMs: 5 })
    expect(scheduler.scheduled).toEqual([])

    const subscription = sub({ cron: EVERY_SECOND })

    await waitFor(() => scheduler!.scheduled.length === 1)
    expect(scheduler.scheduled).toEqual([subscription.id])
  })

  it('nimmt eine pausierte Subscription wieder aus dem Plan', async () => {
    const subscription = sub({ cron: EVERY_SECOND })
    scheduler = startScheduler({ db, runCheck: () => Promise.resolve(), pollMs: 5 })

    updateSubscription(db, subscription.id, { paused: true })

    await waitFor(() => scheduler!.scheduled.length === 0)
  })

  it('startet einen angeforderten Check sofort und setzt das Flag zurück', async () => {
    const subscription = sub({ cron: '0 0 1 1 *' })
    const runs = recorder()
    scheduler = startScheduler({ db, runCheck: runs.runCheck, pollMs: 5 })

    requestCheck(db, subscription.id)

    await waitFor(() => runs.checked.length === 1)
    expect(getSubscription(db, subscription.id)?.checkRequested).toBe(false)
  })

  it('führt einen angeforderten Check auch für pausierte Subscriptions aus', async () => {
    const subscription = sub({ paused: true })
    const runs = recorder()
    scheduler = startScheduler({ db, runCheck: runs.runCheck, pollMs: 5 })
    expect(scheduler.scheduled).toEqual([])

    requestCheck(db, subscription.id)

    await waitFor(() => runs.checked.length === 1)
    expect(runs.checked[0]).toBe(subscription.id)
  })

  it('weist einen angeforderten Check ab, solange ein Check läuft', async () => {
    const subscription = sub({ cron: '0 0 1 1 *' })
    const checked: string[] = []
    let resolveCheck!: () => void
    const gate = new Promise<void>((resolve) => (resolveCheck = resolve))

    scheduler = startScheduler({
      db,
      pollMs: 5,
      runCheck: (entry) => {
        checked.push(entry.id)
        return gate
      },
    })

    const first = scheduler.trigger(subscription.id)
    await waitFor(() => checked.length === 1)

    requestCheck(db, subscription.id)
    await waitFor(() => getSubscription(db, subscription.id)?.checkRequested === false)

    expect(checked).toHaveLength(1)
    resolveCheck()
    await first
  })

  it('setzt das checking-Flag über den Lauf und gibt es danach frei', async () => {
    const subscription = sub({ cron: '0 0 1 1 *' })
    let resolveCheck!: () => void
    const gate = new Promise<void>((resolve) => (resolveCheck = resolve))

    scheduler = startScheduler({ db, runCheck: () => gate, pollMs: 5 })
    const running = scheduler.trigger(subscription.id)

    await waitFor(() => getSubscription(db, subscription.id)?.checking === true)
    resolveCheck()
    await running

    const after = getSubscription(db, subscription.id)
    expect(after?.checking).toBe(false)
    expect(after?.lastCheckAt).toBeInstanceOf(Date)
  })

  it('lässt keinen zweiten Lauf zu, solange einer läuft', async () => {
    const subscription = sub({ cron: '0 0 1 1 *' })
    const checked: string[] = []
    let resolveCheck!: () => void
    const gate = new Promise<void>((resolve) => (resolveCheck = resolve))

    scheduler = startScheduler({
      db,
      pollMs: 5,
      runCheck: (entry) => {
        checked.push(entry.id)
        return gate
      },
    })

    const first = scheduler.trigger(subscription.id)
    await waitFor(() => checked.length === 1)
    await scheduler.trigger(subscription.id)

    expect(checked).toHaveLength(1)
    resolveCheck()
    await first
  })

  it('gibt das checking-Flag auch nach einem Fehler frei', async () => {
    const subscription = sub({ cron: '0 0 1 1 *' })
    scheduler = startScheduler({
      db,
      pollMs: 5,
      runCheck: () => Promise.reject(new Error('kaputt')),
    })

    await scheduler.trigger(subscription.id)

    expect(getSubscription(db, subscription.id)?.checking).toBe(false)
  })

  it('überspringt eine Subscription mit unbrauchbarem Cron-Ausdruck', () => {
    sub({ name: 'Kaputt', cron: 'jeden dritten Blutmond' })
    const logged: string[] = []

    scheduler = startScheduler({
      db,
      runCheck: () => Promise.resolve(),
      log: (message) => logged.push(message),
    })

    expect(scheduler.scheduled).toEqual([])
    expect(logged.join('\n')).toContain('invalid cron')
  })
})
