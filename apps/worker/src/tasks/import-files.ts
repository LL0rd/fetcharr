import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'

import { listFilePaths, type MediaType } from '@fetcharr/db'

import { insertFile } from '../store.ts'
import {
  fileSize,
  findThumbnail,
  libraryPath,
  mediaTypeOf,
  probeMedia,
  readInfoJson,
  scanMediaFiles,
  withoutExtension,
  type ProbeFn,
} from './files.ts'
import type { TaskContext, TaskDefinition } from './types.ts'

/**
 * Nimmt Mediendateien in die Bibliothek auf, zu denen es keinen DB-Eintrag gibt —
 * nach einem Umzug, einem Restore oder wenn jemand Dateien von Hand ablegt.
 * Metadaten kommen aus dem `.info.json` von yt-dlp, sonst aus ffprobe.
 */

export interface ImportDeps {
  probe?: ProbeFn
}

export function importMissingFilesTask(deps: ImportDeps = {}): TaskDefinition {
  return {
    key: 'import_missing_files',
    title: 'Import missing DB records',

    async run(ctx) {
      const imported = await importMissingFiles(ctx, deps)
      return { summary: `${String(imported)} Dateien importiert`, needsConfirm: false }
    },
  }
}

/** Auch von `rebuild_database` benutzt: dort nach dem Leeren der Tabelle. */
export async function importMissingFiles(ctx: TaskContext, deps: ImportDeps = {}): Promise<number> {
  const probe = deps.probe ?? probeMedia
  const known = new Set(listFilePaths(ctx.db))
  const found = await scanMediaFiles(ctx.downloadsDir)

  let imported = 0
  for (const relative of found) {
    if (known.has(relative)) continue

    await importOne(ctx, relative, probe)
    imported += 1
  }

  return imported
}

async function importOne(ctx: TaskContext, relative: string, probe: ProbeFn): Promise<void> {
  const absolute = join(ctx.downloadsDir, relative)
  const info = await readInfoJson(absolute)
  const thumbnail = await findThumbnail(absolute)
  const type: MediaType = mediaTypeOf(relative) ?? 'video'
  const duration = numeric(info?.duration) ?? (await probe(absolute)).durationSec

  insertFile(ctx.db, {
    uid: randomUUID(),
    // Ohne Sidecar gibt es keine Herkunfts-URL; der Pfad hält den Eintrag trotzdem eindeutig.
    url: text(info?.webpage_url) ?? text(info?.original_url) ?? `file://${relative}`,
    title: text(info?.title) ?? basename(withoutExtension(relative)),
    uploader: text(info?.uploader) ?? text(info?.channel),
    type,
    path: relative,
    sizeBytes: await fileSize(absolute),
    durationSec: duration,
    thumbnailPath: thumbnail ? libraryPath(ctx.downloadsDir, thumbnail) : null,
    uploadDate: text(info?.upload_date),
    info,
  })
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
