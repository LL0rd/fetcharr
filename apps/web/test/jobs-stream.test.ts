import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createJob } from '@fetcharr/db'
import type { Db } from '@fetcharr/db'

import { setupNitroGlobals } from './jobs-harness'

type Handler = (event: unknown) => Promise<unknown>

let db: Db
let handler: Handler
let collectUpdates: typeof import('../server/api/events.get.ts').collectUpdates
let stream: { push: ReturnType<typeof vi.fn>; onClosed: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())

  stream = {
    push: vi.fn(async () => {}),
    onClosed: vi.fn(),
    close: vi.fn(async () => {}),
    send: vi.fn(() => 'stream'),
  }
  vi.stubGlobal('createEventStream', () => stream)

  const module = await import('../server/api/events.get.ts')
  handler = module.default as Handler
  collectUpdates = module.collectUpdates
})

afterEach(() => {
  vi.useRealTimers()
})

function seed(url: string, updatedAtSeconds: number): string {
  const job = createJob(db, { url, type: 'video', options: {} })
  db.$client
    .prepare('UPDATE jobs SET updated_at = ? WHERE uid = ?')
    .run(updatedAtSeconds, job.uid)
  return job.uid
}

describe('collectUpdates', () => {
  it('returns every job on the first poll and reports the newest timestamp', () => {
    seed('https://youtu.be/a', 100)
    seed('https://youtu.be/b', 200)

    const update = collectUpdates(db, 0)

    expect(update.jobs).toHaveLength(2)
    expect(update.cursor).toBe(200_000)
  })

  it('returns nothing while no job is touched', () => {
    seed('https://youtu.be/a', 100)

    const update = collectUpdates(db, 101_000)

    expect(update.jobs).toEqual([])
    expect(update.cursor).toBe(101_000)
  })

  it('picks up a status change because every mutation bumps updated_at', () => {
    const uid = seed('https://youtu.be/a', 100)
    db.$client
      .prepare("UPDATE jobs SET status = 'cancelled', updated_at = 200 WHERE uid = ?")
      .run(uid)

    const update = collectUpdates(db, 101_000)

    expect(update.jobs).toHaveLength(1)
    expect(update.jobs[0]!.status).toBe('cancelled')
    expect(update.cursor).toBe(200_000)
  })
})

describe('GET /api/events', () => {
  it('pushes the current jobs right away and polls once per second', async () => {
    vi.useFakeTimers()
    seed('https://youtu.be/a', 100)

    const result = await handler({})

    expect(result).toBe('stream')
    expect(stream.push).toHaveBeenCalledTimes(1)
    const [message] = stream.push.mock.calls[0]!
    expect(message.event).toBe('jobs')
    expect(JSON.parse(message.data)).toHaveLength(1)

    // Ohne Änderung bleibt der Stream still, eine Mutation kommt im nächsten Tick.
    await vi.advanceTimersByTimeAsync(1000)
    expect(stream.push).toHaveBeenCalledTimes(1)

    seed('https://youtu.be/b', 300)
    await vi.advanceTimersByTimeAsync(1000)
    expect(stream.push).toHaveBeenCalledTimes(2)
    expect(JSON.parse(stream.push.mock.calls[1]![0].data)).toHaveLength(2)
  })

  it('stops polling when the client disconnects', async () => {
    vi.useFakeTimers()
    await handler({})

    const onClosed = stream.onClosed.mock.calls[0]![0] as () => Promise<void>
    await onClosed()

    seed('https://youtu.be/a', 300)
    await vi.advanceTimersByTimeAsync(2000)

    expect(stream.push).not.toHaveBeenCalled()
    expect(stream.close).toHaveBeenCalled()
  })
})
