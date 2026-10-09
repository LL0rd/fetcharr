import { describe, expect, it, vi } from 'vitest'
import { describePotProvider, potProviderStatus } from '../src/pot.ts'

describe('potProviderStatus', () => {
  it('reports the version of a reachable provider', async () => {
    const fetchFn = vi.fn(async () => Response.json({ version: '2.0.2', server_uptime: 5 }))
    const status = await potProviderStatus('http://pot:4416', fetchFn as typeof fetch)

    expect(status).toEqual({ available: true, version: '2.0.2' })
    expect(fetchFn.mock.calls[0]?.[0]).toBe('http://pot:4416/ping')
  })

  it('turns a connection failure into an unavailable status instead of throwing', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const status = await potProviderStatus('http://pot:4416', fetchFn as typeof fetch)

    expect(status).toEqual({ available: false, reason: 'ECONNREFUSED' })
  })

  it('treats a non-2xx answer as unavailable', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 503 }))
    expect(await potProviderStatus('http://pot:4416', fetchFn as typeof fetch)).toEqual({
      available: false,
      reason: 'HTTP 503',
    })
  })
})

describe('describePotProvider', () => {
  it('spells out both outcomes for the log', () => {
    expect(describePotProvider({ available: true, version: '2.0.2' })).toContain('2.0.2')
    expect(describePotProvider({ available: false, reason: 'x' })).toMatch(/without tokens/)
  })
})
