import { deleteFile, listDuplicateFileGroups } from '@fetcharr/db'

import { absolutePath, removeMediaFile } from './files.ts'
import type { TaskDefinition } from './types.ts'

/**
 * Mehrfach heruntergeladene URLs. Behalten wird der älteste Eintrag: er ist der,
 * auf den bestehende Links, Views und Resume-Positionen zeigen.
 */

interface DuplicateItem {
  uid: string
  path: string
  thumbnailPath: string | null
}

interface DuplicateGroupPayload {
  url: string
  keep: string
  remove: DuplicateItem[]
}

interface DuplicatePayload {
  groups: DuplicateGroupPayload[]
}

export function duplicateFilesCheckTask(): TaskDefinition {
  return {
    key: 'duplicate_files_check',
    title: 'Find duplicate files',

    run(ctx) {
      const groups = listDuplicateFileGroups(ctx.db).map((group) => ({
        url: group.url,
        keep: group.files[0]!.uid,
        remove: group.files.slice(1).map((file) => ({
          uid: file.uid,
          path: file.path,
          thumbnailPath: file.thumbnailPath,
        })),
      }))

      const duplicates = groups.reduce((sum, group) => sum + group.remove.length, 0)

      return Promise.resolve({
        summary: `${String(duplicates)} Duplikate in ${String(groups.length)} Gruppen`,
        payload: { groups } satisfies DuplicatePayload,
        needsConfirm: duplicates > 0,
      })
    },

    async confirm(ctx, payload) {
      const groups = (payload as DuplicatePayload | null)?.groups ?? []
      let removed = 0

      for (const group of groups) {
        for (const item of group.remove) {
          await removeMediaFile(
            absolutePath(ctx.downloadsDir, item.path),
            item.thumbnailPath ? absolutePath(ctx.downloadsDir, item.thumbnailPath) : null,
          )
          if (deleteFile(ctx.db, item.uid)) removed += 1
        }
      }

      return { summary: `${String(removed)} Duplikate entfernt` }
    },
  }
}
