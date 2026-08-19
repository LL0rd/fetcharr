import { SETTINGS_DEFAULTS, SETTINGS_KEY_LIST } from '@fetcharr/shared'
import type { Settings, SettingsKey, SettingsPatch } from '@fetcharr/shared'

/**
 * Alle Settings als flaches Objekt — fehlende Keys kommen mit ihrem Default,
 * damit die UI nie zwischen „nicht gesetzt" und „leer" unterscheiden muss.
 */
export default defineEventHandler(async (event) => {
  const db = await useDb()
  return { settings: readSettings(db), apiKey: readApiKey(db) }
})

type SqlDb = { $client: { prepare: (sql: string) => any } }

/** Der API-Tab zeigt den Schlüssel an; er lebt in der auth-Zeile, nicht in settings. */
export function readApiKey(db: SqlDb): string | null {
  const row = db.$client.prepare('SELECT api_key FROM auth WHERE id = 1').get() as
    | { api_key: string }
    | undefined

  return row?.api_key ?? null
}

export function readSettings(db: SqlDb): Settings {
  const stored = readRawSettings(db)
  const settings = { ...SETTINGS_DEFAULTS }

  for (const key of SETTINGS_KEY_LIST) {
    if (!stored.has(key)) continue
    const value = stored.get(key)
    // Ein von Hand verbogener Wert darf die Seite nicht kippen: passt der Typ
    // nicht zum Default, bleibt der Default stehen.
    if (matchesDefault(key, value)) (settings as Record<string, unknown>)[key] = value
  }

  return settings
}

export function readRawSettings(db: SqlDb): Map<string, unknown> {
  const rows = db.$client.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: unknown
  }[]

  return new Map(rows.map((row) => [row.key, decode(row.value)]))
}

/** Schreibt genau die mitgegebenen Keys; alles andere bleibt unangetastet. */
export function writeSettings(db: SqlDb, patch: SettingsPatch): void {
  const statement = db.$client.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    statement.run(key, JSON.stringify(value))
  }
}

/** Die value-Spalte ist JSON; ältere Zeilen (Heartbeat) stehen als roher Text drin. */
function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

function matchesDefault(key: SettingsKey, value: unknown): boolean {
  const expected = SETTINGS_DEFAULTS[key]
  if (Array.isArray(expected)) return Array.isArray(value)
  return typeof value === typeof expected
}
