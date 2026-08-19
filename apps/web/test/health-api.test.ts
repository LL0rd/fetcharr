import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@fetcharr/db'

import { setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>

let db: Db
let health: Handler

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())
  health = (await import('../server/api/health.get.ts')).default as Handler
})

function setHeartbeat(secondsAgo: number): void {
  db.$client
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('worker_heartbeat', CAST(unixepoch() - ? AS TEXT))
       ON CONFLICT(key) DO UPDATE SET value = CAST(unixepoch() - ? AS TEXT)`,
    )
    .run(secondsAgo, secondsAgo)
}

describe('health endpoint', () => {
  it('reports ok with a reachable database', async () => {
    const result = await health({})

    expect(result.status).toBe('ok')
    expect(result.db).toBe(true)
  })

  it('reports the worker as down when no heartbeat was ever written', async () => {
    expect((await health({})).worker).toBe(false)
  })

  it('reports the worker as up for a fresh heartbeat', async () => {
    setHeartbeat(1)

    expect((await health({})).worker).toBe(true)
  })

  it('reports the worker as down for a stale heartbeat', async () => {
    setHeartbeat(30)

    expect((await health({})).worker).toBe(false)
  })
})

describe('auth middleware', () => {
  it('leaves the health endpoint open', async () => {
    const { isProtectedPath } = await import('../server/middleware/auth.ts')

    expect(isProtectedPath('/api/health')).toBe(false)
    expect(isProtectedPath('/api/jobs')).toBe(true)
  })
})
