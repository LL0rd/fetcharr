import { describe, expect, it } from 'vitest'
import { AGE_GATE_CLIENTS, isAgeRestricted, withAgeGateClients } from '../src/age-gate'

describe('isAgeRestricted', () => {
  it('recognises the yt-dlp age gate message', () => {
    expect(
      isAgeRestricted(
        'ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate for some users.',
      ),
    ).toBe(true)
  })

  it('ignores unrelated failures', () => {
    expect(isAgeRestricted('ERROR: unable to download video data: HTTP Error 403')).toBe(false)
    expect(isAgeRestricted('')).toBe(false)
  })
})

describe('withAgeGateClients', () => {
  it('swaps the client pin for the embed clients and keeps everything else', () => {
    const args = [
      '-f',
      'best',
      '--extractor-args',
      'youtube:player_client=web_safari,mweb',
      '--cookies',
      '/c',
      '-o',
      '/out',
    ]
    expect(withAgeGateClients(args)).toEqual([
      '-f',
      'best',
      '--extractor-args',
      AGE_GATE_CLIENTS,
      '--cookies',
      '/c',
      '-o',
      '/out',
    ])
  })

  it('appends the embed clients when no pin was set', () => {
    expect(withAgeGateClients(['-f', 'best'])).toEqual([
      '-f',
      'best',
      '--extractor-args',
      AGE_GATE_CLIENTS,
    ])
  })

  it('leaves extractor args for other extractors alone', () => {
    const args = ['--extractor-args', 'youtubetab:approximate_date']
    expect(withAgeGateClients(args)).toEqual([...args, '--extractor-args', AGE_GATE_CLIENTS])
  })

  it('does not mutate its input', () => {
    const args = ['--extractor-args', 'youtube:player_client=web_safari,mweb']
    withAgeGateClients(args)
    expect(args[1]).toBe('youtube:player_client=web_safari,mweb')
  })
})
