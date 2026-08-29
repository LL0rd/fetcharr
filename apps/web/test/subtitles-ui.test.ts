import { describe, expect, it } from 'vitest'

import { emptyDraft, toJobOptions } from '../app/components/add-download-options'
import { filterQuery, thumbLabel } from '../app/components/library/library-files'
import type { LibraryFile } from '../app/components/library/library-files'

function draft(overrides: Partial<ReturnType<typeof emptyDraft>> = {}) {
  return { ...emptyDraft(), ...overrides }
}

describe('toJobOptions — subtitle format', () => {
  it('sends languages, file format and auto subs along', () => {
    const options = toJobOptions(
      draft({ format: 'subtitle', subLangs: 'de,en', subFormat: 'vtt', autoSubs: true }),
    )

    expect(options).toMatchObject({
      format: 'subtitle',
      subLangs: 'de,en',
      subFormat: 'vtt',
      autoSubs: true,
    })
  })

  it('leaves autoSubs out when it is off', () => {
    const options = toJobOptions(draft({ format: 'subtitle', autoSubs: false }))
    expect(options).not.toHaveProperty('autoSubs')
  })

  it('falls back to the default language when the field was cleared', () => {
    const options = toJobOptions(draft({ format: 'subtitle', subLangs: '  ' }))
    expect(options).not.toHaveProperty('subLangs')
  })

  it('drops the subtitle fields for every other format', () => {
    const options = toJobOptions(draft({ format: 'best', subLangs: 'de', autoSubs: true }))

    expect(options).not.toHaveProperty('subLangs')
    expect(options).not.toHaveProperty('subFormat')
    expect(options).not.toHaveProperty('autoSubs')
  })

  it('defaults a fresh dialog to english srt with auto subs', () => {
    expect(emptyDraft()).toMatchObject({ subLangs: 'en', subFormat: 'srt', autoSubs: true })
  })
})

describe('library — subtitle entries', () => {
  it('maps the Subs filter to the subtitle type', () => {
    expect(filterQuery('Subs')).toEqual({ type: 'subtitle' })
  })

  it('labels a missing thumbnail as subtitles', () => {
    expect(thumbLabel({ type: 'subtitle' } as LibraryFile)).toBe('subtitles')
  })
})
