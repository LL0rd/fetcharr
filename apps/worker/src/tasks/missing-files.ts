import { deleteFile, listFilesForMaintenance } from '@fetcharr/db'

import { absolutePath, exists } from './files.ts'
import type { TaskDefinition } from './types.ts'

/** DB-Einträge, deren Mediendatei nicht mehr existiert — z. B. von Hand gelöscht. */

interface MissingItem {
  uid: string
  title: string
  path: string
}

interface MissingPayload {
  items: MissingItem[]
}

export function missingFilesCheckTask(): TaskDefinition {
  return {
    key: 'missing_files_check',
    title: 'Missing files check',

    async run(ctx) {
      const files = listFilesForMaintenance(ctx.db)
      const items: MissingItem[] = []

      for (const file of files) {
        if (await exists(absolutePath(ctx.downloadsDir, file.path))) continue
        items.push({ uid: file.uid, title: file.title, path: file.path })
      }

      return {
        summary: `${String(items.length)} von ${String(files.length)} Einträgen ohne Datei`,
        payload: { items } satisfies MissingPayload,
        needsConfirm: items.length > 0,
      }
    },

    confirm(ctx, payload) {
      const items = (payload as MissingPayload | null)?.items ?? []
      let deleted = 0
      for (const item of items) {
        if (deleteFile(ctx.db, item.uid)) deleted += 1
      }

      return Promise.resolve({ summary: `${String(deleted)} Einträge gelöscht` })
    },
  }
}
