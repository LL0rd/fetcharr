import { describe, expect, it } from 'vitest'

import { DIRECT, maskProxy, parseProxyList, pickProxy } from '../src/proxy'

describe('parseProxyList', () => {
  it('takes one proxy per line and ignores blanks and comments', () => {
    expect(
      parseProxyList('  http://a:3128 \n\n# kommentar\nsocks5://10.0.0.5:1080\n'),
    ).toEqual(['http://a:3128', 'socks5://10.0.0.5:1080'])
  })

  it('turns the direct keyword into the no-proxy marker', () => {
    expect(parseProxyList('http://a:3128\nDirect')).toEqual(['http://a:3128', DIRECT])
  })

  it('is empty for nothing', () => {
    expect(parseProxyList('')).toEqual([])
    expect(parseProxyList(null)).toEqual([])
    expect(parseProxyList(undefined)).toEqual([])
  })
})

describe('pickProxy', () => {
  const list = ['http://a', 'http://b', 'http://c']

  it('returns null for an empty list, so nothing changes without proxies', () => {
    expect(pickProxy([], 'job', 0)).toBeNull()
    expect(pickProxy(null, 'job', 0)).toBeNull()
  })

  it('is deterministic for the same seed and attempt', () => {
    expect(pickProxy(list, 'job-1', 0)).toBe(pickProxy(list, 'job-1', 0))
  })

  /** Der Kern: ein Proxy, der 403 liefert, wird beim Retry nicht noch einmal getroffen. */
  it('moves to the next entry on every attempt and wraps around', () => {
    const first = list.indexOf(pickProxy(list, 'job-1', 0)!)
    expect(pickProxy(list, 'job-1', 1)).toBe(list[(first + 1) % 3])
    expect(pickProxy(list, 'job-1', 2)).toBe(list[(first + 2) % 3])
    expect(pickProxy(list, 'job-1', 3)).toBe(list[first])
  })

  it('spreads different jobs across the list', () => {
    const seen = new Set(
      Array.from({ length: 50 }, (_, i) => pickProxy(list, `job-${i}`, 0)),
    )
    expect(seen.size).toBe(3)
  })

  it('hands out the direct marker like any other slot', () => {
    expect(pickProxy([DIRECT], 'x', 0)).toBe(DIRECT)
  })
})

describe('maskProxy', () => {
  it('hides credentials but keeps scheme and host readable', () => {
    expect(maskProxy('http://user:s3cret@proxy.example:3128')).toBe('http://***@proxy.example:3128')
    expect(maskProxy('socks5://u:p@10.0.0.5:1080')).toBe('socks5://***@10.0.0.5:1080')
  })

  it('leaves a proxy without credentials alone', () => {
    expect(maskProxy('http://proxy.example:3128')).toBe('http://proxy.example:3128')
  })

  it('names the no-proxy case', () => {
    expect(maskProxy(DIRECT)).toBe('direct')
    expect(maskProxy(null)).toBe('direct')
  })
})
