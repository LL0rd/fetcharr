import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'

import { addArchiveEntry, type MediaType } from '@fetcharr/db'

import { insertFile } from '../store.ts'
import { exists, fileSize, libraryPath, mediaTypeOf, withoutExtension } from './files.ts'
import { stringOption, type TaskContext, type TaskDefinition } from './types.ts'

/**
 * Übernahme aus einer bestehenden YoutubeDL-Material-Instanz: `local_db.json`
 * hält dort die Bibliothek, `archives/*.txt` das Download-Archiv im yt-dlp-Format.
 * Übernommen wird nur, was auch als Datei existiert — ein Eintrag ohne Medium
 * wäre in Fetcharr sofort ein Fund für `missing_files_check`.
 */

interface ImportFile {
  title: string
  url: string
  uploader: string | null
  type: MediaType
  path: string
  durationSec: number | null
  uploadDate: string | null
}

interface ImportArchiveEntry {
  extractor: string
  mediaId: string
}

interface ImportPayload {
  files: ImportFile[]
  archive: ImportArchiveEntry[]
  skipped: number
}

const ARCHIVE_DIRS = ['archives', 'archive']

export function importYoutubedlMaterialTask(): TaskDefinition {
  return {
    key: 'import_youtubedl_material',
    title: 'Import aus YoutubeDL-Material',

    async run(ctx) {
      const root = instancePath(ctx)
      const entries = await readLocalDb(root)
      const files: ImportFile[] = []
      let skipped = 0

      for (const entry of entries) {
        const file = await toImportFile(root, entry)
        if (file) files.push(file)
        else skipped += 1
      }

      const archive = await readArchives(root)

      return {
        summary:
          `${String(files.length)} Dateien und ${String(archive.length)} Archiv-Einträge gefunden` +
          (skipped ? `, ${String(skipped)} ohne Medium übersprungen` : ''),
        payload: { files, archive, skipped } satisfies ImportPayload,
        needsConfirm: files.length > 0 || archive.length > 0,
      }
    },

    async confirm(ctx, payload) {
      const data = payload as ImportPayload | null
      let imported = 0

      for (const file of data?.files ?? []) {
        insertFile(ctx.db, {
          uid: randomUUID(),
          url: file.url,
          title: file.title,
          uploader: file.uploader,
          type: file.type,
          path: libraryPath(ctx.downloadsDir, file.path),
          sizeBytes: await fileSize(file.path),
          durationSec: file.durationSec,
          thumbnailPath: null,
          uploadDate: file.uploadDate,
          info: null,
        })
        imported += 1
      }

      for (const entry of data?.archive ?? []) {
        addArchiveEntry(ctx.db, { extractor: entry.extractor, mediaId: entry.mediaId })
      }

      return {
        summary: `${String(imported)} Dateien und ${String(data?.archive.length ?? 0)} Archiv-Einträge übernommen`,
      }
    },
  }
}

function instancePath(ctx: TaskContext): string {
  const path = stringOption(ctx.options, 'path')
  if (!path) throw new Error('Pfad zur YoutubeDL-Material-Instanz fehlt (Option "path")')
  return resolve(path)
}

/** Die Bibliothek liegt je nach Version unter `files.video`/`files.audio` oder je Benutzer. */
async function readLocalDb(root: string): Promise<Record<string, unknown>[]> {
  const path = root.endsWith('.json') ? root : join(root, 'local_db.json')
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    throw new Error(`local_db.json nicht gefunden unter ${path}`)
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>
  const buckets: unknown[] = [
    (parsed.files as Record<string, unknown> | undefined)?.video,
    (parsed.files as Record<string, unknown> | undefined)?.audio,
    Array.isArray(parsed.files) ? parsed.files : undefined,
    ...(Array.isArray(parsed.users)
      ? parsed.users.flatMap((user: unknown) => {
          const files = (user as { files?: Record<string, unknown> } | null)?.files
          return [files?.video, files?.audio]
        })
      : []),
  ]

  return buckets
    .filter((bucket): bucket is Record<string, unknown>[] => Array.isArray(bucket))
    .flat()
}

async function toImportFile(
  root: string,
  entry: Record<string, unknown>,
): Promise<ImportFile | null> {
  const path = await resolveMedia(root, entry)
  if (!path) return null

  const name = basename(withoutExtension(path))
  return {
    title: text(entry.title) ?? name,
    url: text(entry.url) ?? text(entry.webpage_url) ?? `file://${name}`,
    uploader: text(entry.uploader),
    type: entry.isAudio === true ? 'audio' : (mediaTypeOf(path) ?? 'video'),
    path,
    durationSec: typeof entry.duration === 'number' ? entry.duration : null,
    uploadDate: text(entry.upload_date),
  }
}

/** Der gespeicherte Pfad stammt von der Alt-Instanz; relativ zu ihr ist der zweite Versuch. */
async function resolveMedia(
  root: string,
  entry: Record<string, unknown>,
): Promise<string | null> {
  const raw = text(entry.path)
  if (!raw) return null

  const candidates = isAbsolute(raw) ? [raw, join(root, basename(raw))] : [join(root, raw)]
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate
  }

  return null
}

async function readArchives(root: string): Promise<ImportArchiveEntry[]> {
  const entries: ImportArchiveEntry[] = []

  for (const dir of ARCHIVE_DIRS) {
    let names: string[]
    try {
      names = await readdir(join(root, dir))
    } catch {
      continue
    }

    for (const name of names.filter((file) => file.endsWith('.txt'))) {
      const content = await readFile(join(root, dir, name), 'utf8').catch(() => '')
      for (const line of content.split('\n')) {
        const [extractor, mediaId] = line.trim().split(/\s+/)
        if (extractor && mediaId) entries.push({ extractor, mediaId })
      }
    }
  }

  return entries
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}
