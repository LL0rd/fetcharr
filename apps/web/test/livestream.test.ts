import { beforeAll, describe, expect, it } from 'vitest'

import { emptyDraft, toJobOptions, withLiveFromStart } from '../app/components/add-download-options'
import { setupNitroGlobals } from './jobs-harness'

type ToProbeResult = typeof import('../server/api/probe.post.ts')['toProbeResult']

let toProbeResult: ToProbeResult

beforeAll(async () => {
  setupNitroGlobals()
  ;({ toProbeResult } = await import('../server/api/probe.post.ts'))
})

describe('toProbeResult live detection', () => {
  it('passes live_status through and flags a running stream', () => {
    const result = toProbeResult('https://youtu.be/live', {
      id: 'live',
      title: 'Stream',
      live_status: 'is_live',
      is_live: true,
    })

    expect(result.liveStatus).toBe('is_live')
    expect(result.isLive).toBe(true)
  })

  it('trusts live_status when is_live is missing', () => {
    const result = toProbeResult('https://x/y', { live_status: 'is_live' })
    expect(result.isLive).toBe(true)
  })

  it('leaves a finished stream and a plain video alone', () => {
    expect(toProbeResult('https://x/y', { live_status: 'was_live' }).isLive).toBe(false)
    expect(toProbeResult('https://x/y', {}).liveStatus).toBeNull()
    expect(toProbeResult('https://x/y', {}).isLive).toBe(false)
  })
})

describe('withLiveFromStart', () => {
  function options(customArgs = ''): any {
    return toJobOptions({ ...emptyDraft(), customArgs })
  }

  it('adds the flag when recording from start', () => {
    expect((withLiveFromStart(options(), true) as any).customArgs).toBe('--live-from-start')
  })

  it('keeps existing custom args', () => {
    const result = withLiveFromStart(options('--no-part'), true) as any
    expect(result.customArgs).toBe('--no-part --live-from-start')
  })

  it('does not add the flag twice', () => {
    const once = withLiveFromStart(options(), true)
    expect((withLiveFromStart(once, true) as any).customArgs).toBe('--live-from-start')
  })

  it('changes nothing when the box stays unchecked', () => {
    const untouched = options('--no-part')
    expect(withLiveFromStart(untouched, false)).toBe(untouched)
  })
})
