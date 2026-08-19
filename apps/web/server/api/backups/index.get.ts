import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Die Backups, die der Task `backup_db` nach <CONFIG_DIR>/backups geschrieben hat. */

export interface BackupEntry {
  file: string
  sizeBytes: number
  createdAt: Date
}

export default defineEventHandler(async (event) => {
  const backups = await listBackups()
  return { backups, total: backups.length, directory: backupsDir() }
})

export function backupsDir(): string {
  return join(process.env.CONFIG_DIR ?? './data/config', 'backups')
}

export async function listBackups(): Promise<BackupEntry[]> {
  let names: string[]
  try {
    names = await readdir(backupsDir())
  }
  catch {
    // Solange der Backup-Task nie lief, gibt es das Verzeichnis nicht — das ist
    // kein Fehler, sondern eine leere Liste.
    return []
  }

  const entries: BackupEntry[] = []
  for (const file of names) {
    if (!file.endsWith('.db')) continue

    try {
      const info = await stat(join(backupsDir(), file))
      if (info.isFile()) entries.push({ file, sizeBytes: info.size, createdAt: info.mtime })
    }
    catch {
      // Zwischen readdir und stat gelöscht — überspringen.
    }
  }

  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}
