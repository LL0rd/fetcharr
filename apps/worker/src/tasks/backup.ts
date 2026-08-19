import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { exists } from './files.ts'
import { numberOption, type TaskContext, type TaskDefinition } from './types.ts'

/**
 * `VACUUM INTO` schreibt eine konsistente Kopie der laufenden Datenbank — kein
 * Dateikopieren, das mitten in einer Transaktion einen halben WAL-Stand erwischt.
 * Die cookies.txt wandert mit, sie ist der einzige Zustand neben der DB, den ein
 * Restore braucht.
 */

export interface BackupDeps {
  now?: () => Date
}

export interface BackupResult {
  path: string
  removed: number
}

const DEFAULT_KEEP = 7

export function backupDbTask(deps: BackupDeps = {}): TaskDefinition {
  return {
    key: 'backup_db',
    title: 'Backup DB',
    async run(ctx) {
      const keep = numberOption(ctx.options, 'keep', DEFAULT_KEEP)
      const result = await createBackup(ctx, keep, deps.now)

      return {
        summary:
          `Backup ${basename(result.path)} geschrieben` +
          (result.removed ? `, ${String(result.removed)} alte entfernt` : ''),
        needsConfirm: false,
      }
    },
  }
}

export async function createBackup(
  ctx: TaskContext,
  keep = DEFAULT_KEEP,
  now: () => Date = () => new Date(),
): Promise<BackupResult> {
  const dir = join(ctx.configDir, 'backups')
  await mkdir(dir, { recursive: true })

  const stamp = now().toISOString().replace(/[:.]/g, '-')
  const target = join(dir, `fetcharr-${stamp}.db`)
  ctx.db.$client.prepare('VACUUM INTO ?').run(target)

  const cookies = join(ctx.configDir, 'cookies.txt')
  if (await exists(cookies)) await copyFile(cookies, join(dir, `cookies-${stamp}.txt`))

  const removed = await rotate(dir, keep)
  return { path: target, removed }
}

/** Behält die jüngsten `keep` Backups — der Zeitstempel im Namen sortiert lexikografisch. */
async function rotate(dir: string, keep: number): Promise<number> {
  if (keep <= 0) return 0

  const entries = await readdir(dir)
  let removed = 0

  for (const prefix of ['fetcharr-', 'cookies-']) {
    const matching = entries.filter((name) => name.startsWith(prefix)).sort().reverse()
    for (const name of matching.slice(keep)) {
      await rm(join(dir, name), { force: true })
      if (prefix === 'fetcharr-') removed += 1
    }
  }

  return removed
}
