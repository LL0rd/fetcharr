import { describe, expect, it } from 'vitest'

import {
  SETTINGS_DEFAULTS,
  SETTINGS_KEYS,
  SETTINGS_KEY_LIST,
  SettingsPatchSchema,
  SettingsSchema,
  isSettingsKey,
  toGlobalSettings,
} from '../src/settings-keys.ts'

describe('settings vocabulary', () => {
  it('keeps the key constants and the schema in sync', () => {
    for (const key of Object.values(SETTINGS_KEYS)) {
      expect(isSettingsKey(key)).toBe(true)
    }
    expect(SETTINGS_KEY_LIST.length).toBe(Object.values(SETTINGS_KEYS).length)
  })

  it('accepts its own defaults', () => {
    expect(SettingsSchema.safeParse(SETTINGS_DEFAULTS).success).toBe(true)
  })

  it('names the keys the worker reads today', () => {
    expect(SETTINGS_KEYS.maxConcurrentDownloads).toBe('max_concurrent_downloads')
    expect(SETTINGS_KEYS.writeNfo).toBe('write_nfo')
    expect(SETTINGS_KEYS.writeThumbnails).toBe('write_thumbnails')
    expect(SETTINGS_KEYS.outputTemplate).toBe('output_template')
    expect(SETTINGS_KEYS.customArgs).toBe('custom_args')
    expect(SETTINGS_KEYS.rateLimit).toBe('rate_limit')
  })
})

describe('SettingsPatchSchema', () => {
  it('takes a single known key', () => {
    const parsed = SettingsPatchSchema.safeParse({ max_concurrent_downloads: 5 })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toEqual({ max_concurrent_downloads: 5 })
  })

  it('rejects unknown keys instead of dropping them', () => {
    expect(SettingsPatchSchema.safeParse({ nope: 1 }).success).toBe(false)
  })

  it('rejects wrong types and out-of-range numbers', () => {
    expect(SettingsPatchSchema.safeParse({ write_nfo: 'yes' }).success).toBe(false)
    expect(SettingsPatchSchema.safeParse({ max_concurrent_downloads: 0 }).success).toBe(false)
    expect(SettingsPatchSchema.safeParse({ log_level: 'trace' }).success).toBe(false)
    expect(SettingsPatchSchema.safeParse({ notify_types: ['nope'] }).success).toBe(false)
  })
})

describe('toGlobalSettings', () => {
  it('maps the three args-relevant keys', () => {
    expect(
      toGlobalSettings({ output_template: '%(title)s', custom_args: '--x', rate_limit: '2M' }),
    ).toEqual({ outputTemplate: '%(title)s', customArgs: '--x', rateLimit: '2M' })
  })

  it('treats an emptied field as unset', () => {
    expect(toGlobalSettings({ output_template: '', custom_args: '', rate_limit: '' })).toEqual({
      outputTemplate: null,
      customArgs: null,
      rateLimit: null,
    })
  })
})
