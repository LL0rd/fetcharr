import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseProgressLine } from '../src/progress.ts'

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/ytdlp-progress.txt', import.meta.url)),
  'utf8',
)
const lines = fixture.split('\n').filter((l) => l.length > 0)

const MiB = 1024 * 1024
const GiB = 1024 * MiB
const KiB = 1024

describe('parseProgressLine', () => {
  it('parses a standard download line', () => {
    expect(parseProgressLine('[download]  62.4% of  312.00MiB at    8.40MiB/s ETA 00:41')).toEqual({
      pct: 62.4,
      speed: '8.40MiB/s',
      eta: '00:41',
      sizeBytes: Math.round(312 * MiB),
    })
  })

  it('parses approximate sizes marked with ~', () => {
    expect(
      parseProgressLine('[download]  45.3% of ~   1.02GiB at    5.22MiB/s ETA 01:03:10 (frag 3/35)'),
    ).toEqual({
      pct: 45.3,
      speed: '5.22MiB/s',
      eta: '01:03:10',
      sizeBytes: Math.round(1.02 * GiB),
    })
  })

  it('parses KiB and GiB sizes', () => {
    expect(parseProgressLine('[download]  17.0% of  850.25KiB at  900.00KiB/s ETA 00:01')).toEqual({
      pct: 17,
      speed: '900.00KiB/s',
      eta: '00:01',
      sizeBytes: Math.round(850.25 * KiB),
    })
  })

  it('reports unknown speed and eta as null', () => {
    expect(parseProgressLine('[download]   0.0% of  312.00MiB at  Unknown B/s ETA Unknown')).toEqual({
      pct: 0,
      speed: null,
      eta: null,
      sizeBytes: Math.round(312 * MiB),
    })
  })

  it('parses the completion line, which reports elapsed time instead of an eta', () => {
    expect(parseProgressLine('[download] 100% of  312.00MiB in 00:00:38 at 8.10MiB/s')).toEqual({
      pct: 100,
      speed: '8.10MiB/s',
      eta: null,
      sizeBytes: Math.round(312 * MiB),
    })
  })

  it('parses fragment lines without leaking the fragment counter into the eta', () => {
    expect(
      parseProgressLine('[download]   3.1% of ~   4.02MiB at  512.00KiB/s ETA 00:07 (frag 1/35)'),
    ).toEqual({
      pct: 3.1,
      speed: '512.00KiB/s',
      eta: '00:07',
      sizeBytes: Math.round(4.02 * MiB),
    })
    expect(
      parseProgressLine('[download] 100% of ~   4.02MiB in 00:00:09 at 445.00KiB/s (frag 35/35)'),
    ).toEqual({
      pct: 100,
      speed: '445.00KiB/s',
      eta: null,
      sizeBytes: Math.round(4.02 * MiB),
    })
  })

  it.each([
    '[youtube] Extracting URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '[info] dQw4w9WgXcQ: Downloading 1 format(s): 137+251',
    '[download] Destination: /data/downloads/.tmp/Ab12Cd34/video.f137.mp4',
    '[download] Resuming download at byte 1048576',
    '[download] Got error: HTTP Error 403: Forbidden. Retrying (1/10)...',
    '[Merger] Merging formats into "/data/downloads/.tmp/Ab12Cd34/video.mp4"',
    '',
    '   ',
    '{"id": "dQw4w9WgXcQ", "title": "Never Gonna Give You Up"}',
  ])('returns null for non-progress line %j', (line) => {
    expect(parseProgressLine(line)).toBeNull()
  })

  it('parses every progress line of the fixture and nothing else', () => {
    const parsed = lines.map(parseProgressLine).filter((p) => p !== null)
    expect(parsed).toHaveLength(11)
    expect(parsed.every((p) => p.pct >= 0 && p.pct <= 100)).toBe(true)
    expect(parsed.at(-1)).toEqual({
      pct: 100,
      speed: '6.61MiB/s',
      eta: null,
      sizeBytes: Math.round(1.24 * GiB),
    })
  })
})
