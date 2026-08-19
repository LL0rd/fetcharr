import { deleteFile, listFilesOlderThan } from '@fetcharr/db'

import { absolutePath, removeMediaFile } from './files.ts'
import { boolOption, numberOption, type TaskDefinition } from './types.ts'

/**
 * Aufräumen nach Alter. Favoriten und Dateien aus Subscriptions bleiben per
 * Default verschont — beides ist bewusst abonniertes Material, kein Ballast.
 */

interface OldItem {
  uid: string
  title: string
  path: string
  thumbnailPath: string | null
  sizeBytes: number | null
}

interface OldPayload {
  items: OldItem[]
  thresholdDays: number
}

const DEFAULT_THRESHOLD_DAYS = 30

export function deleteOldFilesTask(): TaskDefinition {
  return {
    key: 'delete_old_files',
    title: 'Delete old files',

    run(ctx) {
      const thresholdDays = numberOption(ctx.options, 'threshold_days', DEFAULT_THRESHOLD_DAYS)
      const items = listFilesOlderThan(ctx.db, thresholdDays, {
        keepFavorites: boolOption(ctx.options, 'keep_favorites', true),
        keepSubscriptions: boolOption(ctx.options, 'keep_subscriptions', true),
      }).map((file) => ({
        uid: file.uid,
        title: file.title,
        path: file.path,
        thumbnailPath: file.thumbnailPath,
        sizeBytes: file.sizeBytes,
      }))

      return Promise.resolve({
        summary: `${String(items.length)} Dateien älter als ${String(thresholdDays)} Tage`,
        payload: { items, thresholdDays } satisfies OldPayload,
        needsConfirm: items.length > 0,
        count: items.length,
      })
    },

    async confirm(ctx, payload) {
      const items = (payload as OldPayload | null)?.items ?? []
      let deleted = 0
      let bytes = 0

      for (const item of items) {
        await removeMediaFile(
          absolutePath(ctx.downloadsDir, item.path),
          item.thumbnailPath ? absolutePath(ctx.downloadsDir, item.thumbnailPath) : null,
        )
        if (deleteFile(ctx.db, item.uid)) {
          deleted += 1
          bytes += item.sizeBytes ?? 0
        }
      }

      return { summary: `${String(deleted)} Dateien gelöscht (${megabytes(bytes)} MB)` }
    },
  }
}

function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}
