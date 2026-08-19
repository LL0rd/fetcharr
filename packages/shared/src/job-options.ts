import { z } from 'zod'

/** HH:MM:SS — Crop-Marken werden erst in Phase 2 per ffmpeg ausgeführt. */
const timestamp = /^\d{2}:\d{2}:\d{2}$/

export const JobOptionsSchema = z.object({
  format: z.enum(['best', '1080p', '720p', 'audio']).default('best'),
  sponsorblock: z.enum(['remove', 'mark', 'off']).default('off'),
  customArgs: z.string().max(2000).optional(),
  outputTemplate: z.string().max(500).optional(),
  targetFolder: z.string().max(500).optional(),
  cropStart: z.string().regex(timestamp).optional(),
  cropEnd: z.string().regex(timestamp).optional(),
})

export type JobOptions = z.infer<typeof JobOptionsSchema>
