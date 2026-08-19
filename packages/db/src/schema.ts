import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
})

export const auth = sqliteTable('auth', {
  id: integer('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  apiKey: text('api_key').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const jobs = sqliteTable('jobs', {
  uid: text('uid').primaryKey(),
  url: text('url').notNull(),
  type: text('type', { enum: ['video', 'audio'] }).notNull(),
  status: text('status', {
    enum: ['queued', 'running', 'paused', 'finished', 'errored', 'cancelled'],
  })
    .notNull()
    .default('queued'),
  priority: integer('priority').notNull().default(0),
  options: text('options', { mode: 'json' }).notNull(),
  title: text('title'),
  uploader: text('uploader'),
  progressPct: real('progress_pct').notNull().default(0),
  progressSpeed: text('progress_speed'),
  progressEta: text('progress_eta'),
  sizeBytes: integer('size_bytes'),
  stderr: text('stderr'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  subId: text('sub_id'),
  notBefore: integer('not_before', { mode: 'timestamp' }),
  pid: integer('pid'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
})

export const files = sqliteTable('files', {
  uid: text('uid').primaryKey(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  uploader: text('uploader'),
  type: text('type', { enum: ['video', 'audio'] }).notNull(),
  path: text('path').notNull(),
  sizeBytes: integer('size_bytes'),
  durationSec: real('duration_sec'),
  thumbnailPath: text('thumbnail_path'),
  uploadDate: text('upload_date'),
  infoJson: text('info_json', { mode: 'json' }),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  viewCount: integer('view_count').notNull().default(0),
  resumePositionSec: real('resume_position_sec'),
  subId: text('sub_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type FileRow = typeof files.$inferSelect
export type NewFileRow = typeof files.$inferInsert
export type JobStatus = Job['status']
export type MediaType = Job['type']

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),             // nanoid
  url: text('url').notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['channel', 'playlist', 'generic'] }).notNull().default('channel'),
  mediaType: text('media_type', { enum: ['video', 'audio'] }).notNull().default('video'),
  cron: text('cron').notNull().default('0 */6 * * *'),
  paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
  timerangeFrom: text('timerange_from'),   // YYYYMMDD — nur Videos ab diesem Datum
  titleRegex: text('title_regex'),
  maxQuality: text('max_quality'),         // best/1080p/720p (JobOptions.format)
  customArgs: text('custom_args'),
  customOutput: text('custom_output'),
  sponsorblock: text('sponsorblock', { enum: ['remove', 'mark', 'off'] }).notNull().default('off'),
  recordLivestreams: integer('record_livestreams', { mode: 'boolean' }).notNull().default(false),
  redownloadFreshUploads: integer('redownload_fresh_uploads', { mode: 'boolean' }).notNull().default(false),
  rssEnabled: integer('rss_enabled', { mode: 'boolean' }).notNull().default(false),
  checking: integer('checking', { mode: 'boolean' }).notNull().default(false),
  checkRequested: integer('check_requested', { mode: 'boolean' }).notNull().default(false),
  lastCheckAt: integer('last_check_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const archive = sqliteTable('archive', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  extractor: text('extractor').notNull(),
  mediaId: text('media_id').notNull(),
  type: text('type', { enum: ['video', 'audio'] }).notNull().default('video'),
  subId: text('sub_id'),
  title: text('title'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [uniqueIndex('archive_entry').on(t.extractor, t.mediaId, t.subId)])

export const tasks = sqliteTable('tasks', {
  key: text('key').primaryKey(),
  schedule: text('schedule', { mode: 'json' }),   // {type:'recurring',cron} | {type:'once',timestamp} | null
  options: text('options', { mode: 'json' }),      // pro Task, inkl. auto_confirm
  running: integer('running', { mode: 'boolean' }).notNull().default(false),
  confirming: integer('confirming', { mode: 'boolean' }).notNull().default(false),
  confirmPayload: text('confirm_payload', { mode: 'json' }), // Run-Ergebnis, das auf Bestätigung wartet
  lastRanAt: integer('last_ran_at', { mode: 'timestamp' }),
  lastConfirmedAt: integer('last_confirmed_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const taskRuns = sqliteTable('task_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskKey: text('task_key').notNull(),
  phase: text('phase', { enum: ['run', 'confirm'] }).notNull().default('run'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  durationMs: integer('duration_ms'),
  summary: text('summary'),
  error: text('error'),
})

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),   // download_finished | download_error | subscription_found | task_confirm | system
  title: text('title').notNull(),
  body: text('body'),
  url: text('url'),
  read: integer('read', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
