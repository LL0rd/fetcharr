import { z } from 'zod'

/** HH:MM:SS — Crop-Marken werden erst in Phase 2 per ffmpeg ausgeführt. */
const timestamp = /^\d{2}:\d{2}:\d{2}$/

/**
 * Sprachliste für `--sub-langs`: Kürzel, Komma, Punkt und `*` wie bei yt-dlp
 * (`en.*,de`, `all`). Leerzeichen bleiben draußen — die Liste geht als ein
 * einzelnes Argument raus und darf sich nicht in weitere Tokens zerlegen.
 */
const subLangs = /^[A-Za-z0-9*.,_-]+$/

/** Zielformate, in die yt-dlp per `--convert-subs` umwandeln kann. */
export const SUBTITLE_FORMATS = ['srt', 'vtt', 'ass'] as const

export const JobOptionsSchema = z.object({
  format: z.enum(['best', '1080p', '720p', 'audio', 'subtitle']).default('best'),
  sponsorblock: z.enum(['remove', 'mark', 'off']).default('off'),
  customArgs: z.string().max(2000).optional(),
  outputTemplate: z.string().max(500).optional(),
  targetFolder: z.string().max(500).optional(),
  cropStart: z.string().regex(timestamp).optional(),
  cropEnd: z.string().regex(timestamp).optional(),
  /** Nur für `format: 'subtitle'`; leer bedeutet `en`. */
  subLangs: z.string().max(200).regex(subLangs).optional(),
  subFormat: z.enum(SUBTITLE_FORMATS).optional(),
  /** Auch automatisch erzeugte (ASR-)Untertitel mitnehmen. */
  autoSubs: z.boolean().optional(),
})

export type JobOptions = z.infer<typeof JobOptionsSchema>
