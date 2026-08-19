import { describe, expect, it } from 'vitest'

import type { Subscription } from '../app/components/subscriptions/subscriptions'
import {
  draftBody,
  draftFrom,
  emptyDraft,
  nextCheckLabel,
  relativeLabel,
} from '../app/components/subscriptions/subscriptions'

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    url: 'https://example.com/@channel',
    name: 'Studio Vier',
    type: 'channel',
    mediaType: 'video',
    cron: '0 */6 * * *',
    paused: false,
    timerangeFrom: null,
    titleRegex: null,
    maxQuality: null,
    customArgs: null,
    customOutput: null,
    sponsorblock: 'off',
    recordLivestreams: false,
    redownloadFreshUploads: false,
    rssEnabled: false,
    checking: false,
    checkRequested: false,
    lastCheckAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archiveCount: 0,
    nextCheckAt: null,
    ...overrides,
  }
}

function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

describe('relativeLabel', () => {
  it('formats past and future in the same short units', () => {
    expect(relativeLabel(inMinutes(-12), 'ago')).toBe('12 min ago')
    expect(relativeLabel(inMinutes(12), 'in')).toBe('in 12 min')
    expect(relativeLabel(inMinutes(-180), 'ago')).toBe('3 h ago')
    expect(relativeLabel(inMinutes(60 * 24 * 2), '')).toBe('2 d')
  })

  it('falls back to a dash without a usable timestamp', () => {
    expect(relativeLabel(null, 'ago')).toBe('—')
    expect(relativeLabel('not a date', 'ago')).toBe('—')
  })
})

describe('nextCheckLabel', () => {
  it('reports the earliest scheduled check', () => {
    const label = nextCheckLabel([
      subscription({ id: 'a', nextCheckAt: inMinutes(45) }),
      subscription({ id: 'b', nextCheckAt: inMinutes(9) }),
    ])
    expect(label).toBe('next check in 9 min')
  })

  it('says nothing is scheduled when every subscription is paused', () => {
    expect(nextCheckLabel([subscription({ paused: true })])).toBe('no check scheduled')
    expect(nextCheckLabel([])).toBe('no check scheduled')
  })
})

describe('draft helpers', () => {
  it('turns null columns into empty form fields and back into a body', () => {
    const draft = draftFrom(subscription({ titleRegex: '^Episode', maxQuality: '720p' }))
    expect(draft).toMatchObject({
      titleRegex: '^Episode',
      maxQuality: '720p',
      timerangeFrom: '',
      customArgs: '',
    })

    const body = draftBody({ ...draft, url: '  https://example.com/@c  ', name: ' Sub ' })
    expect(body).toMatchObject({ url: 'https://example.com/@c', name: 'Sub', timerangeFrom: '' })
  })

  it('starts a new subscription on the server defaults', () => {
    expect(emptyDraft()).toMatchObject({
      type: 'channel',
      mediaType: 'video',
      cron: '0 */6 * * *',
      sponsorblock: 'off',
      rssEnabled: false,
    })
  })
})
