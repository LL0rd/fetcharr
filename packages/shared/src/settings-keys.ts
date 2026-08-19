import { z } from 'zod'

import type { GlobalSettings } from './args.ts'

/**
 * Das gemeinsame Vokabular der settings-Tabelle. Web schreibt, Worker liest —
 * beide Seiten greifen auf dieselben Konstanten zu, damit ein Tippfehler nicht
 * still zu einem zweiten, nie gelesenen Key wird.
 */
export const SETTINGS_KEYS = {
  outputTemplate: 'output_template',
  maxConcurrentDownloads: 'max_concurrent_downloads',
  rateLimit: 'rate_limit',
  defaultFormat: 'default_format',
  defaultSponsorblock: 'default_sponsorblock',
  writeNfo: 'write_nfo',
  writeThumbnails: 'write_thumbnails',
  writeInfoJson: 'write_info_json',
  podcastRssEnabled: 'podcast_rss_enabled',
  viewCounterEnabled: 'view_counter_enabled',
  subsDefaultCron: 'subs_default_cron',
  subsDefaultMaxQuality: 'subs_default_max_quality',
  subsDefaultRedownloadFreshUploads: 'subs_default_redownload_fresh_uploads',
  subsDefaultRecordLivestreams: 'subs_default_record_livestreams',
  ntfyUrl: 'ntfy_url',
  gotifyUrl: 'gotify_url',
  gotifyToken: 'gotify_token',
  discordWebhookUrl: 'discord_webhook_url',
  webhookUrl: 'webhook_url',
  notifyTypes: 'notify_types',
  customArgs: 'custom_args',
  userAgent: 'user_agent',
  logLevel: 'log_level',
} as const

export const FORMATS = ['best', '1080p', '720p', 'audio'] as const
export const SPONSORBLOCK_MODES = ['remove', 'mark', 'off'] as const
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

/** Ereignisse, die extern gemeldet werden können — pro Typ einzeln aktivierbar. */
export const NOTIFY_TYPES = [
  'download_finished',
  'download_error',
  'subscription_found',
  'task_confirm',
] as const

export const SettingsSchema = z.object({
  output_template: z.string().max(500),
  max_concurrent_downloads: z.number().int().min(1).max(20),
  rate_limit: z.string().max(50),
  default_format: z.enum(FORMATS),
  default_sponsorblock: z.enum(SPONSORBLOCK_MODES),

  write_nfo: z.boolean(),
  write_thumbnails: z.boolean(),
  write_info_json: z.boolean(),
  podcast_rss_enabled: z.boolean(),
  view_counter_enabled: z.boolean(),

  subs_default_cron: z.string().max(120),
  subs_default_max_quality: z.enum(FORMATS),
  subs_default_redownload_fresh_uploads: z.boolean(),
  subs_default_record_livestreams: z.boolean(),

  ntfy_url: z.string().max(500),
  gotify_url: z.string().max(500),
  gotify_token: z.string().max(200),
  discord_webhook_url: z.string().max(500),
  webhook_url: z.string().max(500),
  notify_types: z.array(z.enum(NOTIFY_TYPES)),

  custom_args: z.string().max(2000),
  user_agent: z.string().max(300),
  log_level: z.enum(LOG_LEVELS),
})

/** Teil-Update: unbekannte Keys sind ein Fehler, kein still ignoriertes Feld. */
export const SettingsPatchSchema = z.strictObject(SettingsSchema.shape).partial()

export type Settings = z.infer<typeof SettingsSchema>
export type SettingsKey = keyof Settings
export type SettingsPatch = Partial<Settings>

/**
 * Leerer String heißt „nicht gesetzt" — buildArgs und die Notifier prüfen auf
 * Truthiness, damit ein geleertes Feld dasselbe bedeutet wie ein nie gesetztes.
 */
export const SETTINGS_DEFAULTS: Settings = {
  output_template: '%(uploader)s/%(title)s [%(id)s]',
  max_concurrent_downloads: 3,
  rate_limit: '',
  default_format: 'best',
  default_sponsorblock: 'off',

  write_nfo: true,
  write_thumbnails: true,
  write_info_json: true,
  podcast_rss_enabled: true,
  view_counter_enabled: true,

  subs_default_cron: '0 */6 * * *',
  subs_default_max_quality: 'best',
  subs_default_redownload_fresh_uploads: false,
  subs_default_record_livestreams: false,

  ntfy_url: '',
  gotify_url: '',
  gotify_token: '',
  discord_webhook_url: '',
  webhook_url: '',
  notify_types: ['download_finished', 'download_error', 'subscription_found', 'task_confirm'],

  custom_args: '',
  user_agent: '',
  log_level: 'info',
}

export const SETTINGS_KEY_LIST = Object.keys(SETTINGS_DEFAULTS) as SettingsKey[]

export function isSettingsKey(key: string): key is SettingsKey {
  return Object.hasOwn(SETTINGS_DEFAULTS, key)
}

/** Reicht genau die Settings an buildArgs weiter, die dort ankommen sollen. */
export function toGlobalSettings(values: Partial<Settings>): GlobalSettings {
  return {
    outputTemplate: values.output_template || null,
    customArgs: values.custom_args || null,
    rateLimit: values.rate_limit || null,
  }
}
