import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import * as schema from './schema.ts'

export * from './schema.ts'
export * as schema from './schema.ts'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url))

export type Db = ReturnType<typeof createDb>

/**
 * Öffnet die SQLite-Datenbank und bringt sie per Migration auf den aktuellen Stand.
 * WAL gibt es nur für Datei-Datenbanken; `:memory:` bleibt auf dem Default-Journal.
 */
export function createDb(path: string) {
  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')

  if (!isInMemory(path)) {
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('busy_timeout = 5000')
  }

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db
}

function isInMemory(path: string): boolean {
  return path === ':memory:' || path === '' || path.startsWith('file::memory:')
}
