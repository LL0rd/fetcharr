import { describe, it, expect } from 'vitest'
import { buildArgs } from '../src/args'
import { JobOptionsSchema } from '../src/job-options'
import type { ArgsJob, ArgsPaths, GlobalSettings } from '../src/args'

const paths: ArgsPaths = { downloadsDir: '/downloads', cookiesPath: null }
const settings: GlobalSettings = {}

const ALWAYS = [
  '--write-info-json',
  '--write-thumbnail',
  '--no-clean-info-json',
  '-j',
  '--no-simulate',
  '--progress',
  '--newline',
  '--extractor-args',
  'youtube:player_client=web_safari,mweb',
]

const DEFAULT_TEMPLATE = '%(uploader)s/%(title)s [%(id)s]'

function job(options: Record<string, unknown>, type: 'video' | 'audio' = 'video'): ArgsJob {
  return { type, options: JobOptionsSchema.parse(options) }
}

function out(dir: string, template = DEFAULT_TEMPLATE): string[] {
  return ['-o', `/downloads/${dir}/${template}.%(ext)s`]
}

describe('buildArgs — formats', () => {
  it('best selects merged best video+audio as mp4', () => {
    expect(buildArgs(job({ format: 'best' }), settings, paths)).toEqual([
      '-f', 'bv*+ba/b',
      '--merge-output-format', 'mp4',
      ...ALWAYS,
      ...out('video'),
    ])
  })

  it('1080p sorts by resolution', () => {
    expect(buildArgs(job({ format: '1080p' }), settings, paths)).toEqual([
      '-S', 'res:1080',
      '--merge-output-format', 'mp4',
      ...ALWAYS,
      ...out('video'),
    ])
  })

  it('720p sorts by resolution', () => {
    expect(buildArgs(job({ format: '720p' }), settings, paths)).toEqual([
      '-S', 'res:720',
      '--merge-output-format', 'mp4',
      ...ALWAYS,
      ...out('video'),
    ])
  })

  it('audio extracts mp3 with thumbnail and metadata', () => {
    expect(buildArgs(job({ format: 'audio' }, 'audio'), settings, paths)).toEqual([
      '-x',
      '--audio-format', 'mp3',
      '--embed-thumbnail',
      '--add-metadata',
      ...ALWAYS,
      ...out('audio'),
    ])
  })
})

describe('buildArgs — sponsorblock', () => {
  it('remove adds --sponsorblock-remove default', () => {
    const args = buildArgs(job({ sponsorblock: 'remove' }), settings, paths)
    expect(args).toEqual([
      '-f', 'bv*+ba/b',
      '--merge-output-format', 'mp4',
      '--sponsorblock-remove', 'default',
      ...ALWAYS,
      ...out('video'),
    ])
  })

  it('mark adds --sponsorblock-mark default', () => {
    expect(buildArgs(job({ sponsorblock: 'mark' }), settings, paths)).toContain('--sponsorblock-mark')
    expect(buildArgs(job({ sponsorblock: 'mark' }), settings, paths)).not.toContain('--sponsorblock-remove')
  })

  it('off adds nothing', () => {
    const args = buildArgs(job({ sponsorblock: 'off' }), settings, paths)
    expect(args.some((a) => a.startsWith('--sponsorblock'))).toBe(false)
  })
})

describe('buildArgs — output path', () => {
  it('uses the default template below <downloads>/<type>', () => {
    expect(buildArgs(job({}), settings, paths)).toContain(
      `/downloads/video/${DEFAULT_TEMPLATE}.%(ext)s`,
    )
  })

  it('uses the global output template when set', () => {
    const args = buildArgs(job({}), { outputTemplate: '%(title)s' }, paths)
    expect(args).toContain('/downloads/video/%(title)s.%(ext)s')
  })

  it('job outputTemplate wins over the global one', () => {
    const args = buildArgs(job({ outputTemplate: '%(id)s' }), { outputTemplate: '%(title)s' }, paths)
    expect(args).toContain('/downloads/video/%(id)s.%(ext)s')
  })

  it('targetFolder replaces the type folder', () => {
    const args = buildArgs(job({ targetFolder: 'music/live' }), settings, paths)
    expect(args).toContain(`/downloads/music/live/${DEFAULT_TEMPLATE}.%(ext)s`)
  })

  it('honours a non-default downloads dir', () => {
    const args = buildArgs(job({}), settings, { downloadsDir: '/data/dl', cookiesPath: null })
    expect(args).toContain(`/data/dl/video/${DEFAULT_TEMPLATE}.%(ext)s`)
  })
})

describe('buildArgs — global settings and custom args', () => {
  it('adds the rate limit', () => {
    const args = buildArgs(job({}), { rateLimit: '2M' }, paths)
    expect(args.slice(0, 6)).toEqual([
      '-f', 'bv*+ba/b',
      '--merge-output-format', 'mp4',
      '-r', '2M',
    ])
  })

  it('appends global custom args, then job custom args last', () => {
    const args = buildArgs(
      job({ customArgs: '--retries 5' }),
      { customArgs: '--user-agent Fetcharr' },
      paths,
    )
    expect(args.slice(-4)).toEqual(['--user-agent', 'Fetcharr', '--retries', '5'])
  })

  it('keeps quoted custom args as a single token', () => {
    const args = buildArgs(job({ customArgs: '--postprocessor-args "-ss 10"' }), settings, paths)
    expect(args.slice(-2)).toEqual(['--postprocessor-args', '-ss 10'])
  })

  it('ignores empty custom args', () => {
    expect(buildArgs(job({ customArgs: '   ' }), { customArgs: '' }, paths)).toEqual(
      buildArgs(job({}), settings, paths),
    )
  })
})

describe('buildArgs — youtube player clients', () => {
  it('pins the player clients for every format', () => {
    for (const format of ['best', '1080p', '720p', 'audio'] as const) {
      const args = buildArgs(job({ format }), settings, paths)
      const index = args.indexOf('--extractor-args')
      expect(args[index + 1]).toBe('youtube:player_client=web_safari,mweb')
    }
  })
})

describe('buildArgs — cookies', () => {
  it('adds --cookies when a cookies file was found', () => {
    const args = buildArgs(job({}), settings, {
      downloadsDir: '/downloads',
      cookiesPath: '/config/cookies.txt',
    })
    expect(args.slice(-4, -2)).toEqual(['--cookies', '/config/cookies.txt'])
  })

  it('adds nothing when there is no cookies file', () => {
    expect(buildArgs(job({}), settings, paths)).not.toContain('--cookies')
  })
})

describe('buildArgs — purity', () => {
  it('never emits crop args (crop runs via ffmpeg in a later phase)', () => {
    const args = buildArgs(job({ cropStart: '00:00:10', cropEnd: '00:01:00' }), settings, paths)
    expect(args).toEqual(buildArgs(job({}), settings, paths))
  })

  it('returns a fresh array on every call', () => {
    const a = buildArgs(job({}), settings, paths)
    const b = buildArgs(job({}), settings, paths)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
