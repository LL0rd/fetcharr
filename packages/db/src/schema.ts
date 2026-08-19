import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

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
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type FileRow = typeof files.$inferSelect
export type NewFileRow = typeof files.$inferInsert
export type JobStatus = Job['status']
export type MediaType = Job['type']
