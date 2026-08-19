import { clearFiles, countFiles } from '@fetcharr/db'

import { createBackup } from './backup.ts'
import { scanMediaFiles } from './files.ts'
import { importMissingFiles, type ImportDeps } from './import-files.ts'
import type { TaskDefinition } from './types.ts'

/**
 * Baut die Bibliothek aus dem Dateisystem neu auf. Der Lauf zählt nur, bestätigt
 * wird der Neuaufbau — und der beginnt mit einem Backup, weil dabei alles
 * verloren geht, was nicht auf der Platte liegt (Favoriten, Views, Zuordnung zu
 * Subscriptions).
 */

interface RebuildPayload {
  onDisk: number
  inDb: number
}

export function rebuildDatabaseTask(deps: ImportDeps = {}): TaskDefinition {
  return {
    key: 'rebuild_database',
    title: 'Rebuild database',

    async run(ctx) {
      const onDisk = (await scanMediaFiles(ctx.downloadsDir)).length
      const inDb = countFiles(ctx.db)

      return {
        summary: `${String(onDisk)} Dateien auf der Platte, ${String(inDb)} in der Bibliothek`,
        payload: { onDisk, inDb } satisfies RebuildPayload,
        // Der Neuaufbau ist immer zu bestätigen, auch wenn nichts zu finden war.
        needsConfirm: true,
      }
    },

    async confirm(ctx) {
      const backup = await createBackup(ctx)
      const cleared = clearFiles(ctx.db)
      const imported = await importMissingFiles(ctx, deps)

      return {
        summary: `${String(cleared)} Einträge verworfen, ${String(imported)} neu eingelesen (Backup ${backup.path})`,
      }
    },
  }
}
