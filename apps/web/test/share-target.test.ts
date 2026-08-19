import { describe, expect, it } from 'vitest'

import { extractSharedUrl } from '../app/utils/share-target'

describe('extractSharedUrl', () => {
  it('takes the url field when the sharing app filled it', () => {
    expect(extractSharedUrl({ url: 'https://www.youtube.com/watch?v=abc' })).toBe(
      'https://www.youtube.com/watch?v=abc',
    )
  })

  it('digs the link out of a shared sentence', () => {
    expect(extractSharedUrl({ text: 'Look at this https://youtu.be/abc it is great' })).toBe(
      'https://youtu.be/abc',
    )
  })

  it('prefers the url field over the text field', () => {
    const query = { url: 'https://youtu.be/real', text: 'https://youtu.be/decoy' }
    expect(extractSharedUrl(query)).toBe('https://youtu.be/real')
  })

  it('falls back to the title when nothing else carries a link', () => {
    expect(extractSharedUrl({ text: 'no link here', title: 'https://youtu.be/abc' })).toBe(
      'https://youtu.be/abc',
    )
  })

  it('strips punctuation the sentence glued onto the link', () => {
    expect(extractSharedUrl({ text: 'watch this: https://youtu.be/abc.' })).toBe(
      'https://youtu.be/abc',
    )
  })

  it('keeps query strings intact', () => {
    expect(extractSharedUrl({ text: 'https://www.youtube.com/watch?v=abc&t=90s now' })).toBe(
      'https://www.youtube.com/watch?v=abc&t=90s',
    )
  })

  it('reads the first entry when the router hands over repeated params', () => {
    expect(extractSharedUrl({ url: ['https://youtu.be/abc', 'https://youtu.be/def'] })).toBe(
      'https://youtu.be/abc',
    )
  })

  it('ignores non-http schemes so no javascript: url reaches the dialog', () => {
    expect(extractSharedUrl({ url: 'javascript:alert(1)' })).toBe('')
    expect(extractSharedUrl({ text: 'file:///etc/passwd' })).toBe('')
  })

  it('returns an empty string for an empty or link-free share', () => {
    expect(extractSharedUrl({})).toBe('')
    expect(extractSharedUrl({ text: '', url: null })).toBe('')
    expect(extractSharedUrl({ text: 'just some words' })).toBe('')
  })
})
