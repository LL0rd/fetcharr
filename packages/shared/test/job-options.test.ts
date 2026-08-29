import { describe, it, expect } from 'vitest'
import { JobOptionsSchema } from '../src/job-options'

describe('JobOptionsSchema', () => {
  it('fills defaults for an empty object', () => {
    const parsed = JobOptionsSchema.parse({})
    expect(parsed).toEqual({ format: 'best', sponsorblock: 'off' })
  })

  it('accepts a fully specified valid options object', () => {
    const input = {
      format: '1080p',
      sponsorblock: 'remove',
      customArgs: '--embed-subs',
      outputTemplate: '%(title)s',
      targetFolder: 'music',
      cropStart: '00:01:30',
      cropEnd: '01:00:00',
    }
    expect(JobOptionsSchema.parse(input)).toEqual(input)
  })

  it('rejects an unknown format', () => {
    expect(() => JobOptionsSchema.parse({ format: '4k' })).toThrow()
  })

  it('rejects an unknown sponsorblock mode', () => {
    expect(() => JobOptionsSchema.parse({ sponsorblock: 'maybe' })).toThrow()
  })

  it('rejects a malformed crop timestamp', () => {
    expect(() => JobOptionsSchema.parse({ cropStart: '-00:01:00' })).toThrow()
    expect(() => JobOptionsSchema.parse({ cropEnd: '90' })).toThrow()
    expect(() => JobOptionsSchema.parse({ cropStart: '1:2:3' })).toThrow()
  })

  it('rejects overlong strings', () => {
    expect(() => JobOptionsSchema.parse({ customArgs: 'x'.repeat(2001) })).toThrow()
    expect(() => JobOptionsSchema.parse({ outputTemplate: 'x'.repeat(501) })).toThrow()
    expect(() => JobOptionsSchema.parse({ targetFolder: 'x'.repeat(501) })).toThrow()
  })

  it('accepts the audio format with sponsorblock mark', () => {
    const parsed = JobOptionsSchema.parse({ format: 'audio', sponsorblock: 'mark' })
    expect(parsed.format).toBe('audio')
    expect(parsed.sponsorblock).toBe('mark')
  })

  it('accepts the subtitle format with languages, file format and auto subs', () => {
    const parsed = JobOptionsSchema.parse({
      format: 'subtitle',
      subLangs: 'de,en.*',
      subFormat: 'vtt',
      autoSubs: true,
    })

    expect(parsed.format).toBe('subtitle')
    expect(parsed.subLangs).toBe('de,en.*')
    expect(parsed.subFormat).toBe('vtt')
    expect(parsed.autoSubs).toBe(true)
  })

  it('leaves the subtitle fields undefined when they are not given', () => {
    const parsed = JobOptionsSchema.parse({ format: 'subtitle' })

    expect(parsed.subLangs).toBeUndefined()
    expect(parsed.subFormat).toBeUndefined()
    expect(parsed.autoSubs).toBeUndefined()
  })

  it('rejects a language list that would split into more than one argument', () => {
    expect(() => JobOptionsSchema.parse({ subLangs: 'en --exec rm' })).toThrow()
    expect(() => JobOptionsSchema.parse({ subLangs: 'x'.repeat(201) })).toThrow()
  })

  it('rejects an unknown subtitle file format', () => {
    expect(() => JobOptionsSchema.parse({ subFormat: 'sub' })).toThrow()
  })
})
