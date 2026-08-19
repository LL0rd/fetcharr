import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import * as schema from './schema.ts'

export * from './schema.ts'
export * as schema from './schema.ts'
export * from './jobs.ts'
export * from './files.ts'
export * from './subscriptions.ts'
export * from './archive.ts'
export * from './tasks.ts'
export * from './maintenance.ts'
export * from './notifications.ts'
export * from './storage.ts'

/**
 * Im Container liegen die Migrationen neben den Bundles statt neben dieser
 * Datei — gebündelter Worker und inlined Nitro-Server lösen `import.meta.url`
 * auf ihr eigenes Ausgabeverzeichnis auf.
 */
function migrationsFolder(): string {
  return process.env.FETCHARR_MIGRATIONS_DIR ?? fileURLToPath(new URL('../migrations', import.meta.url))
}

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
  migrate(db, { migrationsFolder: migrationsFolder() })
  return db
}

function isInMemory(path: string): boolean {
  return path === ':memory:' || path === '' || path.startsWith('file::memory:')
}
