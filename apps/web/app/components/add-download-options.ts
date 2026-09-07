import { DEFAULT_SUB_FORMAT, DEFAULT_SUB_LANGS, type JobOptions } from '@fetcharr/shared'

/** Die Formate des Add-Dialogs; `subtitle` lädt nur die Untertitelspur. */
export const ADD_FORMATS = ['best', '1080p', '720p', 'audio', 'subtitle'] as const

/** Der Dialog arbeitet mit lauter Strings; leere Felder fallen erst beim Senden raus. */
export interface DraftOptions {
  format: string
  sponsorblock: string
  customArgs: string
  outputTemplate: string
  targetFolder: string
  cropStart: string
  cropEnd: string
  subLangs: string
  subFormat: string
  autoSubs: boolean
  /** Untertitel zusätzlich zum Video/Audio — bei format 'subtitle' bedeutungslos. */
  withSubs: boolean
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
    subLangs: DEFAULT_SUB_LANGS,
    subFormat: DEFAULT_SUB_FORMAT,
    autoSubs: true,
    withSubs: false,
  }
}

/** Ob die Untertitel-Felder für diesen Entwurf überhaupt eine Wirkung haben. */
export function draftWantsSubtitles(draft: DraftOptions): boolean {
  return draft.format === 'subtitle' || draft.withSubs
}

/**
 * Macht aus dem Formular gültige `JobOptions`: leere Felder weglassen, denn
 * `JobOptionsSchema` lehnt z.B. einen leeren Crop-Zeitstempel ab.
 */
export function toJobOptions(draft: DraftOptions): JobOptions {
  const options: Record<string, string | boolean> = {
    format: draft.format,
    sponsorblock: draft.sponsorblock,
  }

  const optional = ['customArgs', 'outputTemplate', 'targetFolder', 'cropStart', 'cropEnd'] as const
  for (const key of optional) {
    const value = draft[key].trim()
    if (value) options[key] = value
  }

  // Die Untertitel-Felder nur mitschicken, wenn sie auch greifen — sonst füllt sich
  // die Args-Vorschau mit Optionen, die der Job gar nicht benutzt.
  if (draftWantsSubtitles(draft)) {
    const langs = draft.subLangs.trim()
    if (langs) options.subLangs = langs
    if (draft.subFormat) options.subFormat = draft.subFormat
    if (draft.autoSubs) options.autoSubs = true
    if (draft.format !== 'subtitle') options.withSubs = true
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
