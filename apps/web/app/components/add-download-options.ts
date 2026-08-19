import type { JobOptions } from '@fetcharr/shared'

/** Der Dialog arbeitet mit lauter Strings; leere Felder fallen erst beim Senden raus. */
export interface DraftOptions {
  format: string
  sponsorblock: string
  customArgs: string
  outputTemplate: string
  targetFolder: string
  cropStart: string
  cropEnd: string
}

export function emptyDraft(): DraftOptions {
  return {
    format: 'best',
    sponsorblock: 'off',
    customArgs: '',
    outputTemplate: '',
    targetFolder: '',
    cropStart: '',
    cropEnd: '',
  }
}

/**
 * Macht aus dem Formular gültige `JobOptions`: leere Felder weglassen, denn
 * `JobOptionsSchema` lehnt z.B. einen leeren Crop-Zeitstempel ab.
 */
export function toJobOptions(draft: DraftOptions): JobOptions {
  const options: Record<string, string> = {
    format: draft.format,
    sponsorblock: draft.sponsorblock,
  }

  const optional = ['customArgs', 'outputTemplate', 'targetFolder', 'cropStart', 'cropEnd'] as const
  for (const key of optional) {
    const value = draft[key].trim()
    if (value) options[key] = value
  }

  return options as unknown as JobOptions
}

const LIVE_FROM_START = '--live-from-start'

/**
 * Hängt `--live-from-start` an die customArgs, damit ein laufender Stream von
 * Anfang an statt ab dem Einreihen aufgezeichnet wird. Doppelt anhängen würde
 * yt-dlp zwar überstehen, macht die Args-Vorschau aber unlesbar.
 */
export function withLiveFromStart(options: JobOptions, recordFromStart: boolean): JobOptions {
  if (!recordFromStart) return options

  const current = ((options as { customArgs?: string }).customArgs ?? '').trim()
  if (current.split(/\s+/).includes(LIVE_FROM_START)) return options

  const customArgs = current ? `${current} ${LIVE_FROM_START}` : LIVE_FROM_START
  return { ...options, customArgs } as JobOptions
}
