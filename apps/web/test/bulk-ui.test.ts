import { describe, expect, it } from 'vitest'

import { parseBulkUrls } from '../app/components/bulk-import'

describe('parseBulkUrls', () => {
  it('takes one url per line and trims whitespace', () => {
    expect(parseBulkUrls('https://youtu.be/a\n  https://youtu.be/b  ')).toEqual([
      'https://youtu.be/a',
      'https://youtu.be/b',
    ])
  })

  it('drops empty lines and duplicates', () => {
    expect(parseBulkUrls('\nhttps://youtu.be/a\n\nhttps://youtu.be/a\n   \n')).toEqual([
      'https://youtu.be/a',
    ])
  })

  it('is empty for an empty textarea', () => {
    expect(parseBulkUrls('')).toEqual([])
  })
})
