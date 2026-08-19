import { copyFile, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { backupsDir, listBackups } from './index.get.ts'

/**
 * Spielt ein Backup zurück, indem die Datei über die DB kopiert wird — mehr
 * passiert hier bewusst nicht. Die laufenden Prozesse halten die alte Datei
 * noch offen; erst der Neustart arbeitet auf dem zurückgespielten Stand.
 */
export default defineEventHandler(async (event) => {
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>
  const file = await requireBackupFile(body.file)

  const configDir = process.env.CONFIG_DIR ?? './data/config'
  const dbPath = join(configDir, 'fetcharr.db')

  // Sicherheitsnetz: der Stand vor dem Restore bleibt als Backup erhalten.
  const previous = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
  if (await exists(dbPath)) await copyFile(dbPath, join(backupsDir(), previous))

  await copyFile(join(backupsDir(), file), dbPath)
  // Ein WAL des alten Standes würde über die zurückgespielte Datei gelegt.
  await rm(`${dbPath}-wal`, { force: true })
  await rm(`${dbPath}-shm`, { force: true })

  return { restored: file, previousBackup: previous, restartRequired: true }
})

/** Nur Dateinamen aus der Backup-Liste — kein Pfad, kein `..`. */
async function requireBackupFile(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !value.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'file is required' })
  }
  if (basename(value) !== value) {
    throw createError({ statusCode: 400, statusMessage: 'file must be a plain file name' })
  }

  const backups = await listBackups()
  if (!backups.some((entry) => entry.file === value)) {
    throw createError({ statusCode: 404, statusMessage: 'Backup not found' })
  }

  return value
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
}
