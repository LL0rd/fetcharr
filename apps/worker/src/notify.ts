import { addNotification, type Db, type Notification } from '@fetcharr/db'

import { getSetting } from './store.ts'

/**
 * Notifications entstehen immer in der DB — das Center im Web zeigt lückenlos,
 * was passiert ist. Die externen Kanäle sind Beiwerk: `notify_types` schaltet
 * sie pro Ereignistyp frei (leer = alle), und ein toter Server darf niemals
 * einen Download oder Subscription-Check mitreißen. Deshalb schluckt jeder
 * Kanal seine Fehler und meldet sie nur ins Log.
 */

export interface NotifyInput {
  type: string
  title: string
  body?: string | null
  url?: string | null
}

export interface NotifyOptions {
  /** Injizierbar für Tests; per Default das globale fetch. */
  fetch?: typeof fetch
  log?: (message: string) => void
}

interface Channel {
  name: string
  url: string
  init: RequestInit
}

const REQUEST_TIMEOUT_MS = 10_000

export async function createNotification(
  db: Db,
  input: NotifyInput,
  options: NotifyOptions = {},
): Promise<Notification> {
  const entry = addNotification(db, input)

  if (isEnabled(db, input.type)) {
    await deliver(db, input, options)
  }

  return entry
}

export async function notifyDownloadFinished(
  db: Db,
  download: { title: string; sizeBytes: number | null; uid: string },
  options: NotifyOptions = {},
): Promise<Notification> {
  const size = formatBytes(download.sizeBytes)

  return createNotification(
    db,
    {
      type: 'download_finished',
      title: 'Download finished',
      body: size ? `'${download.title}' — ${size}` : `'${download.title}'`,
      url: `/watch/${download.uid}`,
    },
    options,
  )
}

export async function notifyDownloadError(
  db: Db,
  download: { title: string; attempts: number; maxAttempts: number },
  options: NotifyOptions = {},
): Promise<Notification> {
  return createNotification(
    db,
    {
      type: 'download_error',
      title: 'Download failed',
      body: `'${download.title}' — attempt ${String(download.attempts)}/${String(download.maxAttempts)}`,
      url: '/',
    },
    options,
  )
}

export async function notifySubscriptionFound(
  db: Db,
  sub: { name: string; count: number },
  options: NotifyOptions = {},
): Promise<Notification> {
  const plural = sub.count === 1 ? 'video' : 'videos'

  return createNotification(
    db,
    {
      type: 'subscription_found',
      title: `Subscription found ${String(sub.count)} new ${plural}`,
      body: sub.name,
      url: '/subscriptions',
    },
    options,
  )
}

/** Von der Task-Engine aufgerufen, sobald ein Lauf auf Bestätigung wartet. */
export async function notifyTaskConfirm(
  db: Db,
  run: { task: string; count?: number | null },
  options: NotifyOptions = {},
): Promise<Notification> {
  const count = run.count ?? null

  return createNotification(
    db,
    {
      type: 'task_confirm',
      title: 'Task needs confirmation',
      body: count == null ? `'${run.task}' waits for confirmation` : `'${run.task}' found ${String(count)} items`,
      url: '/tasks',
    },
    options,
  )
}

/** Leere oder fehlende Liste heißt: alle Ereignistypen gehen nach außen. */
function isEnabled(db: Db, type: string): boolean {
  const configured = getSetting(db, 'notify_types')
  if (!Array.isArray(configured) || !configured.length) return true

  return configured.includes(type)
}

async function deliver(db: Db, input: NotifyInput, options: NotifyOptions): Promise<void> {
  const log = options.log ?? (() => {})
  const send = options.fetch ?? fetch
  const channels = buildChannels(db, input, log)

  await Promise.all(
    channels.map(async (channel) => {
      try {
        const response = await send(channel.url, {
          ...channel.init,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        if (!response.ok) {
          log(`notification via ${channel.name} failed with HTTP ${String(response.status)}`)
        }
      } catch (error) {
        log(`notification via ${channel.name} failed: ${message(error)}`)
      }
    }),
  )
}

function buildChannels(db: Db, input: NotifyInput, log: (message: string) => void): Channel[] {
  const channels: Channel[] = []
  const body = input.body ?? ''
  const json = { 'Content-Type': 'application/json' }

  const ntfy = url(db, 'ntfy_url', log)
  if (ntfy) {
    const headers: Record<string, string> = { Title: input.title, 'Content-Type': 'text/plain' }
    if (input.url) headers.Click = input.url
    channels.push({ name: 'ntfy', url: ntfy, init: { method: 'POST', headers, body: body || input.title } })
  }

  const gotify = url(db, 'gotify_url', log)
  const gotifyToken = text(db, 'gotify_token')
  if (gotify && gotifyToken) {
    channels.push({
      name: 'gotify',
      url: `${gotify.replace(/\/+$/, '')}/message?token=${encodeURIComponent(gotifyToken)}`,
      init: {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ title: input.title, message: body || input.title }),
      },
    })
  }

  const discord = url(db, 'discord_webhook_url', log)
  if (discord) {
    channels.push({
      name: 'discord',
      url: discord,
      init: {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          embeds: [{ title: input.title, description: body || undefined }],
        }),
      },
    })
  }

  const webhook = url(db, 'webhook_url', log)
  if (webhook) {
    channels.push({
      name: 'webhook',
      url: webhook,
      init: {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          url: input.url ?? null,
          createdAt: new Date().toISOString(),
        }),
      },
    })
  }

  return channels
}

/** Eine unbrauchbare URL ist ein Konfigurationsfehler, kein Grund zu scheitern. */
function url(db: Db, key: string, log: (message: string) => void): string | null {
  const value = text(db, key)
  if (!value) return null

  try {
    new URL(value)
    return value
  } catch {
    log(`ignoring invalid ${key}: ${value}`)
    return null
  }
}

function text(db: Db, key: string): string | null {
  const value = getSetting(db, key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatBytes(bytes: number | null): string | null {
  if (!bytes || bytes < 0) return null

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value >= 10 || unit === 0 ? String(Math.round(value)) : value.toFixed(1)} ${units[unit]!}`
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
