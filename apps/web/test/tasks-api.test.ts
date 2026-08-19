import { beforeEach, describe, expect, it } from 'vitest'

import { recordTaskRun, setTaskOptions } from '@fetcharr/db'
import type { Db } from '@fetcharr/db'

import { expectHttpError, setupNitroGlobals } from './jobs-harness'
import type { TestEvent } from './jobs-harness'

type Handler = (event: TestEvent) => Promise<any>

let db: Db
let handlers: Record<string, Handler>

beforeEach(async () => {
  ;({ db } = setupNitroGlobals())

  handlers = {
    list: (await import('../server/api/tasks/index.get.ts')).default as Handler,
    run: (await import('../server/api/tasks/[key]/run.post.ts')).default as Handler,
    confirm: (await import('../server/api/tasks/[key]/confirm.post.ts')).default as Handler,
    schedule: (await import('../server/api/tasks/[key]/schedule.put.ts')).default as Handler,
    options: (await import('../server/api/tasks/[key]/options.put.ts')).default as Handler,
    runs: (await import('../server/api/tasks/[key]/runs.get.ts')).default as Handler,
    reset: (await import('../server/api/tasks/reset.post.ts')).default as Handler,
  }
})

function flag(key: string, column: string, value = 1): void {
  db.$client.prepare(`UPDATE tasks SET ${column} = ? WHERE key = ?`).run(value, key)
}

function row(key: string): Record<string, any> {
  return db.$client.prepare('SELECT * FROM tasks WHERE key = ?').get(key) as Record<string, any>
}

describe('GET /api/tasks', () => {
  it('seeds the catalogue on first call and keeps the mockup order', async () => {
    const result = await handlers.list({})

    expect(result.total).toBe(8)
    expect(result.tasks[0].key).toBe('backup_db')
    expect(result.tasks[0].name).toBe('Backup DB')
    expect(result.tasks.at(-1).key).toBe('import_youtubedl_material')
  })

  it('is idempotent and does not duplicate rows', async () => {
    await handlers.list({})
    const result = await handlers.list({})

    expect(result.total).toBe(8)
  })

  it('reports idle before the first run and ok afterwards', async () => {
    await handlers.list({})
    expect(byKey(await handlers.list({}), 'backup_db').status).toBe('idle')

    db.$client.prepare('UPDATE tasks SET last_ran_at = unixepoch() WHERE key = ?').run('backup_db')
    expect(byKey(await handlers.list({}), 'backup_db').status).toBe('ok')
  })

  it('marks a task with auto_confirm and one that is confirming', async () => {
    await handlers.list({})
    flag('missing_files_check', 'confirming')

    const result = await handlers.list({})
    expect(byKey(result, 'missing_files_check').status).toBe('confirming')
    expect(byKey(result, 'update_ytdlp').status).toBe('auto_confirm')
    expect(byKey(result, 'update_ytdlp').autoConfirm).toBe(true)
  })

  it('summarises the pending confirm payload', async () => {
    await handlers.list({})
    db.$client
      .prepare('UPDATE tasks SET confirming = 1, confirm_payload = ? WHERE key = ?')
      .run(JSON.stringify({ missing: ['a', 'b', 'c'] }), 'missing_files_check')

    const entry = byKey(await handlers.list({}), 'missing_files_check')
    expect(entry.confirmCount).toBe(3)
    expect(entry.confirmSummary).toBe('3 entries')
  })

  it('carries the last run of each task', async () => {
    await handlers.list({})
    recordTaskRun(db, { taskKey: 'backup_db', phase: 'run', summary: 'older' })
    recordTaskRun(db, { taskKey: 'backup_db', phase: 'run', summary: 'newest' })

    expect(byKey(await handlers.list({}), 'backup_db').lastRun.summary).toBe('newest')
  })
})

describe('POST /api/tasks/:key/run', () => {
  it('sets run_requested for the worker to pick up', async () => {
    await handlers.list({})
    const result = await handlers.run({ params: { key: 'backup_db' } })

    expect(row('backup_db').run_requested).toBe(1)
    expect(result.task.runRequested).toBe(true)
  })

  it('answers 404 for an unknown task', async () => {
    const error = await expectHttpError(handlers.run({ params: { key: 'nope' } }))
    expect(error.statusCode).toBe(404)
  })

  it('answers 409 while the task is running', async () => {
    await handlers.list({})
    flag('backup_db', 'running')

    const error = await expectHttpError(handlers.run({ params: { key: 'backup_db' } }))
    expect(error.statusCode).toBe(409)
  })
})

describe('POST /api/tasks/:key/confirm', () => {
  it('sets confirm_requested while the task waits', async () => {
    await handlers.list({})
    flag('missing_files_check', 'confirming')

    const result = await handlers.confirm({ params: { key: 'missing_files_check' } })
    expect(row('missing_files_check').confirm_requested).toBe(1)
    expect(result.task.confirmRequested).toBe(true)
  })

  it('answers 409 when nothing is waiting', async () => {
    await handlers.list({})
    const error = await expectHttpError(handlers.confirm({ params: { key: 'backup_db' } }))
    expect(error.statusCode).toBe(409)
  })
})

describe('PUT /api/tasks/:key/schedule', () => {
  it('stores a recurring schedule and reports the next run', async () => {
    await handlers.list({})
    const result = await handlers.schedule({
      params: { key: 'backup_db' },
      body: { type: 'recurring', cron: '0 3 * * *' },
    })

    expect(result.task.schedule).toEqual({ type: 'recurring', cron: '0 3 * * *' })
    expect(new Date(result.nextRunAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('stores a one-off schedule from an iso string', async () => {
    await handlers.list({})
    const result = await handlers.schedule({
      params: { key: 'backup_db' },
      body: { type: 'once', timestamp: '2027-01-01T03:00:00.000Z' },
    })

    expect(result.task.schedule.timestamp).toBe(Math.floor(Date.UTC(2027, 0, 1, 3) / 1000))
  })

  it('clears the schedule when null is sent', async () => {
    await handlers.list({})
    await handlers.schedule({ params: { key: 'backup_db' }, body: { type: 'recurring', cron: '0 3 * * *' } })
    const result = await handlers.schedule({ params: { key: 'backup_db' }, body: { schedule: null } })

    expect(result.task.schedule).toBeNull()
    expect(result.nextRunAt).toBeNull()
  })

  it('rejects an invalid cron and an unknown type', async () => {
    await handlers.list({})
    const cron = await expectHttpError(
      handlers.schedule({ params: { key: 'backup_db' }, body: { type: 'recurring', cron: 'nope' } }),
    )
    expect(cron.statusCode).toBe(400)

    const type = await expectHttpError(
      handlers.schedule({ params: { key: 'backup_db' }, body: { type: 'sometimes' } }),
    )
    expect(type.statusCode).toBe(400)
  })
})

describe('PUT /api/tasks/:key/options', () => {
  it('merges into the stored options', async () => {
    await handlers.list({})
    const result = await handlers.options({
      params: { key: 'delete_old_files' },
      body: { threshold_days: 90 },
    })

    expect(result.task.options).toMatchObject({
      threshold_days: 90,
      keep_favorites: true,
      keep_subscriptions: true,
    })
  })

  it('turns auto_confirm on and reflects it in the status', async () => {
    await handlers.list({})
    await handlers.options({ params: { key: 'missing_files_check' }, body: { auto_confirm: true } })

    expect(byKey(await handlers.list({}), 'missing_files_check').status).toBe('auto_confirm')
  })

  it('rejects an option the task does not have', async () => {
    await handlers.list({})
    const error = await expectHttpError(
      handlers.options({ params: { key: 'backup_db' }, body: { threshold_days: 5 } }),
    )
    expect(error.statusCode).toBe(400)
    expect(error.statusMessage).toContain('no option named threshold_days')
  })

  it('rejects values outside the allowed range and wrong types', async () => {
    await handlers.list({})
    const range = await expectHttpError(
      handlers.options({ params: { key: 'backup_db' }, body: { keep: 0 } }),
    )
    expect(range.statusCode).toBe(400)

    const type = await expectHttpError(
      handlers.options({ params: { key: 'update_ytdlp' }, body: { auto_confirm: 'yes' } }),
    )
    expect(type.statusCode).toBe(400)
  })
})

describe('GET /api/tasks/:key/runs', () => {
  it('lists the history newest first', async () => {
    await handlers.list({})
    recordTaskRun(db, { taskKey: 'backup_db', phase: 'run', summary: 'first' })
    recordTaskRun(db, { taskKey: 'backup_db', phase: 'confirm', summary: 'second' })
    recordTaskRun(db, { taskKey: 'update_ytdlp', phase: 'run', summary: 'other task' })

    const result = await handlers.runs({ params: { key: 'backup_db' } })
    expect(result.runs.map((run: any) => run.summary)).toEqual(['second', 'first'])
  })

  it('honours the limit and 404s for an unknown task', async () => {
    await handlers.list({})
    recordTaskRun(db, { taskKey: 'backup_db', phase: 'run' })
    recordTaskRun(db, { taskKey: 'backup_db', phase: 'run' })

    const limited = await handlers.runs({ params: { key: 'backup_db' }, query: { limit: '1' } })
    expect(limited.runs).toHaveLength(1)

    const error = await expectHttpError(handlers.runs({ params: { key: 'nope' } }))
    expect(error.statusCode).toBe(404)
  })
})

describe('POST /api/tasks/reset', () => {
  it('clears running and confirming flags and reports the count', async () => {
    await handlers.list({})
    flag('backup_db', 'running')
    flag('missing_files_check', 'confirming')
    setTaskOptions(db, 'rebuild_database', {})

    const result = await handlers.reset({})
    expect(result.reset).toBe(2)
    expect(row('backup_db').running).toBe(0)
    expect(row('missing_files_check').confirming).toBe(0)
  })

  it('reports zero when nothing is stuck', async () => {
    await handlers.list({})
    expect((await handlers.reset({})).reset).toBe(0)
  })
})

function byKey(result: any, key: string): any {
  return result.tasks.find((task: any) => task.key === key)
}
