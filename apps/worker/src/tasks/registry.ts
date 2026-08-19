import { backupDbTask } from './backup.ts'
import { deleteOldFilesTask } from './delete-old.ts'
import { duplicateFilesCheckTask } from './duplicates.ts'
import { importMissingFilesTask } from './import-files.ts'
import { importYoutubedlMaterialTask } from './import-ytdlm.ts'
import { missingFilesCheckTask } from './missing-files.ts'
import { rebuildDatabaseTask } from './rebuild.ts'
import { updateYtdlpTask } from './update-ytdlp.ts'
import type { TaskDefinition } from './types.ts'

/** Die Wartungs-Tasks; die Schlüssel entsprechen `TASK_KEYS` aus dem DB-Paket. */
export function defaultTasks(): TaskDefinition[] {
  return [
    backupDbTask(),
    missingFilesCheckTask(),
    importMissingFilesTask(),
    duplicateFilesCheckTask(),
    updateYtdlpTask(),
    deleteOldFilesTask(),
    rebuildDatabaseTask(),
    importYoutubedlMaterialTask(),
  ]
}
