import { SETTINGS_DEFAULTS } from '@fetcharr/shared'
import type { Settings } from '@fetcharr/shared'
import { describe, expect, it } from 'vitest'

import {
  NOTIFY_TYPE_OPTIONS,
  SETTINGS_TABS,
  diffSettings,
  toggleNotifyType,
} from '../app/components/settings/settings-form'

function base(): Settings {
  return structuredClone(SETTINGS_DEFAULTS)
}

describe('diffSettings', () => {
  it('is empty while nothing was touched', () => {
    expect(diffSettings(base(), base())).toEqual({})
  })

  it('reports only the changed keys', () => {
    const draft = base()
    draft.rate_limit = '5M'
    draft.write_nfo = false

    expect(diffSettings(base(), draft)).toEqual({ rate_limit: '5M', write_nfo: false })
  })

  it('compares the notify types by content, not by identity', () => {
    const draft = base()
    draft.notify_types = [...base().notify_types]
    expect(diffSettings(base(), draft)).toEqual({})

    draft.notify_types = ['download_error']
    expect(diffSettings(base(), draft)).toEqual({ notify_types: ['download_error'] })
  })
})

describe('toggleNotifyType', () => {
  it('adds and removes a type', () => {
    expect(toggleNotifyType(['download_error'], 'task_confirm', true)).toEqual([
      'download_error',
      'task_confirm',
    ])
    expect(toggleNotifyType(['download_error', 'task_confirm'], 'download_error', false)).toEqual([
      'task_confirm',
    ])
  })

  it('keeps the catalogue order so a re-tick is not a change', () => {
    const all = NOTIFY_TYPE_OPTIONS.map((option) => option.key)
    const without = toggleNotifyType(all, 'download_finished', false)

    expect(toggleNotifyType(without, 'download_finished', true)).toEqual(all)
  })

  it('ignores a type that is not in the catalogue', () => {
    expect(toggleNotifyType([], 'made_up', true)).toEqual([])
  })
})

describe('SETTINGS_TABS', () => {
  it('follows the mockup and adds the notifications tab', () => {
    expect(SETTINGS_TABS).toEqual([
      'Downloader',
      'Extra',
      'API',
      'Subscriptions',
      'Notifications',
      'Advanced',
    ])
  })
})
