import { describe, expect, it } from 'vitest'

import type { Task } from '../app/components/tasks/tasks'
import {
  confirmLabel,
  durationLabel,
  lastRunLabel,
  localLabel,
  scheduleLabel,
  sizeLabel,
  toDatetimeLocal,
} from '../app/components/tasks/tasks'

function task(overrides: Partial<Task> = {}): Task {
  return {
    key: 'missing_files_check',
    name: 'Missing files check',
    desc: 'find DB entries whose file is gone',
    twoPhase: true,
    optionSpecs: [],
    schedule: null,
    options: {},
    running: false,
    confirming: false,
    runRequested: false,
    confirmRequested: false,
    confirmPayload: null,
    confirmSummary: null,
    confirmCount: null,
    status: 'idle',
    autoConfirm: false,
    lastRanAt: null,
    lastConfirmedAt: null,
    lastRun: null,
    ...overrides,
  }
}

describe('scheduleLabel', () => {
  it('says manual when there is no schedule', () => {
    expect(scheduleLabel(null)).toBe('manual')
  })

  it('shows the cron expression as it was entered', () => {
    expect(scheduleLabel({ type: 'recurring', cron: '0 3 * * *' })).toBe('0 3 * * *')
  })

  it('shows a one-off run with its local date', () => {
    const timestamp = Math.floor(new Date(2027, 0, 2, 3, 4).getTime() / 1000)
    expect(scheduleLabel({ type: 'once', timestamp })).toBe('once 2027-01-02 03:04')
  })
})

describe('lastRunLabel', () => {
  it('says never while the task has not run', () => {
    expect(lastRunLabel(null)).toBe('never')
  })

  it('reports a relative time', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString()
    expect(lastRunLabel(twoHoursAgo)).toBe('2 h ago')
  })
})

describe('confirmLabel', () => {
  it('carries the count like the mockup', () => {
    expect(confirmLabel(task({ confirmCount: 3, confirmSummary: '3 entries' }))).toBe('Confirm: 3')
  })

  it('falls back to the summary and then to a bare label', () => {
    expect(confirmLabel(task({ confirmSummary: 'new version 2026.08.01' }))).toBe(
      'Confirm: new version 2026.08.01',
    )
    expect(confirmLabel(task())).toBe('Confirm')
  })
})

describe('durationLabel', () => {
  it('switches from milliseconds to seconds', () => {
    expect(durationLabel(null)).toBe('—')
    expect(durationLabel(420)).toBe('420 ms')
    expect(durationLabel(1500)).toBe('1.5 s')
  })
})

describe('sizeLabel', () => {
  it('scales the unit', () => {
    expect(sizeLabel(512)).toBe('512 B')
    expect(sizeLabel(2048)).toBe('2.0 KB')
    expect(sizeLabel(15 * 1024 * 1024)).toBe('15 MB')
  })
})

describe('localLabel and toDatetimeLocal', () => {
  it('formats to the minute in local time', () => {
    expect(localLabel(new Date(2026, 7, 19, 15, 4).getTime())).toBe('2026-08-19 15:04')
    expect(localLabel('not a date')).toBe('—')
  })

  it('produces a value a datetime-local input accepts', () => {
    expect(toDatetimeLocal(new Date(2026, 7, 19, 15, 4))).toBe('2026-08-19T15:04')
  })
})
