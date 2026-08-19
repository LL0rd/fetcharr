import { join } from 'node:path'

type DbModule = typeof import('@fetcharr/db')
type Db = ReturnType<DbModule['createDb']>

let db: Db | undefined

/**
 * Shared connection to the SQLite file that web and worker both use.
 * Async because @fetcharr/db is imported dynamically: while the package is
 * still being built the dev server has to boot anyway, and only the routes
 * that really touch the database fail.
 */
export async function useDb(): Promise<Db> {
  if (!db) {
    const configDir = process.env.CONFIG_DIR ?? './data/config'
    db = (await loadDbModule()).createDb(join(configDir, 'fetcharr.db'))
  }
  return db
}

async function loadDbModule(): Promise<DbModule> {
  try {
    return await import('@fetcharr/db')
  }
  catch (error) {
    console.warn('[db] @fetcharr/db is not available yet:', error)
    throw createError({ statusCode: 503, statusMessage: 'Database package not available' })
  }
}
