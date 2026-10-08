import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { JobOptionsSchema, buildArgs, maskProxy, parseProxyList, pickProxy } from '@fetcharr/shared'
import type { ArgsJob, GlobalSettings } from '@fetcharr/shared'

import { typeForFormat } from './jobs/index.post'

const TYPES = new Set(['video', 'audio', 'subtitle'])

/** Zeigt im Add-Dialog live, womit yt-dlp tatsächlich aufgerufen würde. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}

  const parsed = JobOptionsSchema.safeParse(body.options ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid job options',
      data: { issues: parsed.error.issues },
    })
  }

  const type = TYPES.has(body.type as string)
    ? (body.type as ArgsJob['type'])
    : typeForFormat(parsed.data.format)
  const job: ArgsJob = { type, options: parsed.data }

  const db = await useDb()
  const settings = readDownloadSettings(db)
  // Die Vorschau zeigt den ersten Versuch; Zugangsdaten im Proxy bleiben maskiert,
  // denn diese Zeile landet im Browser und in Screenshots.
  const proxy = pickProxy(settings.proxies, 'preview', 0)
  const args = buildArgs(job, settings, {
    downloadsDir: process.env.DOWNLOADS_DIR ?? './data/downloads',
    cookiesPath: cookiesPath(),
    proxy: proxy ? maskProxy(proxy) : proxy,
  })

  return { args, command: ['yt-dlp', ...args, body.url ?? '<url>'].join(' ') }
})

function cookiesPath(): string | null {
  const path = join(process.env.CONFIG_DIR ?? './data/config', 'cookies.txt')
  return existsSync(path) ? path : null
}

/** Die drei Settings-Keys, die in die Args einfließen; alles andere ignoriert buildArgs. */
export function readDownloadSettings(db: { $client: any }): GlobalSettings {
  const rows = db.$client
    .prepare(
      "SELECT key, value FROM settings WHERE key IN ('output_template', 'custom_args', 'rate_limit', 'proxies')",
    )
    .all() as { key: string; value: unknown }[]

  const values = new Map(rows.map((row) => [row.key, asText(row.value)]))

  return {
    outputTemplate: values.get('output_template') ?? null,
    customArgs: values.get('custom_args') ?? null,
    rateLimit: values.get('rate_limit') ?? null,
    proxies: parseProxyList(values.get('proxies')),
  }
}

/** Die settings-Spalte ist JSON — Strings kommen deshalb als `"…"` aus SQLite zurück. */
function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed || null : null
  }
  catch {
    return value || null
  }
}
