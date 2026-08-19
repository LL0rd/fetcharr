import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildNfo, writeNfoFile } from '../src/nfo.ts'

const INFO = {
  id: 'abc123',
  title: 'Test Video',
  description: 'A short description',
  uploader: 'Test Channel',
  upload_date: '20260101',
  duration: 185,
  categories: ['Music', 'Entertainment'],
  webpage_url: 'https://example.com/watch?v=abc123',
}

describe('buildNfo', () => {
  it('renders the Jellyfin/Kodi movie schema from the info json', () => {
    const xml = buildNfo(INFO)

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    expect(xml).toContain('<movie>')
    expect(xml).toContain('</movie>')
    expect(xml).toContain('<title>Test Video</title>')
    expect(xml).toContain('<plot>A short description</plot>')
    expect(xml).toContain('<studio>Test Channel</studio>')
  })

  it('formats the upload date as an ISO date and the runtime in minutes', () => {
    const xml = buildNfo(INFO)

    expect(xml).toContain('<premiered>2026-01-01</premiered>')
    expect(xml).toContain('<year>2026</year>')
    expect(xml).toContain('<runtime>3</runtime>')
  })

  it('writes one genre element per category and the id as a youtube uniqueid', () => {
    const xml = buildNfo(INFO)

    expect(xml).toContain('<genre>Music</genre>')
    expect(xml).toContain('<genre>Entertainment</genre>')
    expect(xml).toContain('<uniqueid type="youtube" default="true">abc123</uniqueid>')
  })

  it('falls back to the channel when there is no uploader', () => {
    const xml = buildNfo({ title: 'X', channel: 'Channel Name' })
    expect(xml).toContain('<studio>Channel Name</studio>')
  })

  it('escapes XML special characters instead of producing broken markup', () => {
    const xml = buildNfo({ title: 'Rock & <Roll>', description: 'He said "hi" & left' })

    expect(xml).toContain('<title>Rock &amp; &lt;Roll&gt;</title>')
    expect(xml).toContain('<plot>He said &quot;hi&quot; &amp; left</plot>')
    expect(xml).not.toContain('<Roll>')
  })

  it('omits elements without a value rather than writing empty tags', () => {
    const xml = buildNfo({ title: 'Only a title' })

    expect(xml).toContain('<title>Only a title</title>')
    expect(xml).not.toContain('<plot>')
    expect(xml).not.toContain('<studio>')
    expect(xml).not.toContain('<premiered>')
    expect(xml).not.toContain('<runtime>')
    expect(xml).not.toContain('<uniqueid')
  })
})

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fetcharr-nfo-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('writeNfoFile', () => {
  it('writes <basename>.nfo next to the media file', async () => {
    const media = join(dir, 'Test Video [abc123].mp4')
    writeFileSync(media, 'video-bytes')

    const path = await writeNfoFile(media, INFO)

    expect(path).toBe(join(dir, 'Test Video [abc123].nfo'))
    expect(readFileSync(path, 'utf8')).toContain('<title>Test Video</title>')
  })
})
