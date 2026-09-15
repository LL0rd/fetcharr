import { describe, expect, it, vi } from 'vitest'

import {
  ACTION_TIMEOUT_MS,
  LOST_CONTACT,
  actionMessage,
  useQueueActions,
} from '../app/composables/useQueueActions'

function setup(refresh = vi.fn().mockResolvedValue(undefined)) {
  return { refresh, ...useQueueActions(refresh) }
}

describe('useQueueActions', () => {
  it('releases the toolbar after a successful action', async () => {
    const { busy, error, run } = setup()

    await run('Clear finished', () => Promise.resolve())

    expect(busy.value).toBe(false)
    expect(error.value).toBe('')
  })

  /**
   * Der Fall, der die Seite als „hängt" erscheinen liess: ein leeres catch liess
   * den Knopf wieder aktiv werden, ohne dass sich etwas tat oder etwas dastand.
   */
  it('surfaces a failure instead of swallowing it', async () => {
    const { busy, error, run } = setup()

    await run('Clear finished', () => Promise.reject(new Error('boom')))

    expect(error.value).toBe('Clear finished failed: boom')
    expect(busy.value).toBe(false)
  })

  it('never leaves the toolbar locked, whatever the action does', async () => {
    const { busy, run } = setup()

    await run('Clear queue', () => Promise.reject(new Error('nope')))
    expect(busy.value).toBe(false)

    await run('Clear queue', () => {
      throw new Error('synchron geworfen')
    })
    expect(busy.value).toBe(false)
  })

  /** Der Stream meldet nur Änderungen — gelöschte Jobs verschwinden nur hierdurch. */
  it('refreshes after success AND after failure', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const { run } = setup(refresh)

    await run('Clear finished', () => Promise.resolve())
    expect(refresh).toHaveBeenCalledTimes(1)

    await run('Clear finished', () => Promise.reject(new Error('boom')))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('reports a dead server when even the refresh fails', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('offline'))
    const { error, busy, run } = setup(refresh)

    await run('Clear finished', () => Promise.resolve())

    expect(error.value).toBe(LOST_CONTACT)
    expect(busy.value).toBe(false)
  })

  it('keeps the action error when the refresh fails too', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('offline'))
    const { error, run } = setup(refresh)

    await run('Clear queue', () => Promise.reject(new Error('boom')))

    expect(error.value).toBe('Clear queue failed: boom')
  })

  it('clears a stale error when the next action starts', async () => {
    const { error, run } = setup()

    await run('Clear queue', () => Promise.reject(new Error('boom')))
    expect(error.value).not.toBe('')

    await run('Clear queue', () => Promise.resolve())
    expect(error.value).toBe('')
  })

  it('marks the toolbar busy while the action is in flight', async () => {
    const { busy, run } = setup()
    let release = (): void => {}
    const pending = run('Pause all', () => new Promise<void>((resolve) => { release = resolve }))

    expect(busy.value).toBe(true)
    release()
    await pending
    expect(busy.value).toBe(false)
  })
})

describe('actionMessage', () => {
  it('explains a timeout in plain words', () => {
    expect(actionMessage({ name: 'TimeoutError' })).toBe('the server did not answer in time')
    expect(actionMessage(new Error('The operation was aborted due to timeout')))
      .toBe('the server did not answer in time')
  })

  it('prefers the server statusMessage', () => {
    expect(actionMessage({ data: { statusMessage: 'Queue is locked' } })).toBe('Queue is locked')
    expect(actionMessage({ statusMessage: 'Nope' })).toBe('Nope')
  })

  it('falls back to something rather than an empty string', () => {
    expect(actionMessage({})).toBe('unknown error')
    expect(actionMessage(null)).toBe('unknown error')
  })
})

describe('ACTION_TIMEOUT_MS', () => {
  it('is short enough that a stuck request cannot freeze the page for long', () => {
    expect(ACTION_TIMEOUT_MS).toBeGreaterThan(0)
    expect(ACTION_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })
})
