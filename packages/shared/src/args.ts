import type { JobOptions } from './job-options.ts'

export interface ArgsJob {
  type: 'video' | 'audio'
  options: JobOptions
}

/** Globale Downloader-Settings, soweit sie in die yt-dlp-Args einfließen. */
export interface GlobalSettings {
  outputTemplate?: string | null
  customArgs?: string | null
  rateLimit?: string | null
}

export interface ArgsPaths {
  downloadsDir: string
  /** Ergebnis des Existenz-Checks auf <CONFIG_DIR>/cookies.txt — null, wenn keine Datei da ist. */
  cookiesPath?: string | null
}

const DEFAULT_TEMPLATE = '%(uploader)s/%(title)s [%(id)s]'

const FORMAT_ARGS: Record<JobOptions['format'], string[]> = {
  best: ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4'],
  '1080p': ['-S', 'res:1080', '--merge-output-format', 'mp4'],
  '720p': ['-S', 'res:720', '--merge-output-format', 'mp4'],
  audio: ['-x', '--audio-format', 'mp3', '--embed-thumbnail', '--add-metadata'],
}

// -j schaltet yt-dlp in den Quiet-Mode: ohne --progress kämen keine [download]-Zeilen,
// ohne --newline überschriebe yt-dlp sie per CR — der Progress-Parser bekäme nichts.
const ALWAYS_ARGS = [
  '--write-info-json',
  '--write-thumbnail',
  '--no-clean-info-json',
  '-j',
  '--no-simulate',
  '--progress',
  '--newline',
]

/** Zerlegt eine Args-Zeile in Tokens; einfache und doppelte Quotes halten Leerzeichen zusammen. */
export function tokenizeArgs(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false

  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/.test(char)) {
      if (started) tokens.push(current)
      current = ''
      started = false
      continue
    }
    current += char
    started = true
  }
  if (started) tokens.push(current)
  return tokens
}

/**
 * Baut die yt-dlp-Argumentliste für einen Job. Pur: kein fs-, env- oder Netzzugriff —
 * der Cookies-Pfad wird als bereits geprüftes Ergebnis hereingereicht.
 */
export function buildArgs(job: ArgsJob, settings: GlobalSettings, paths: ArgsPaths): string[] {
  const { options } = job
  const args: string[] = [...FORMAT_ARGS[options.format]]

  if (options.sponsorblock === 'remove') args.push('--sponsorblock-remove', 'default')
  else if (options.sponsorblock === 'mark') args.push('--sponsorblock-mark', 'default')

  if (settings.rateLimit) args.push('-r', settings.rateLimit)

  args.push(...ALWAYS_ARGS)

  if (paths.cookiesPath) args.push('--cookies', paths.cookiesPath)

  const folder = options.targetFolder || job.type
  const template = options.outputTemplate || settings.outputTemplate || DEFAULT_TEMPLATE
  args.push('-o', `${paths.downloadsDir}/${folder}/${template}.%(ext)s`)

  if (settings.customArgs) args.push(...tokenizeArgs(settings.customArgs))
  if (options.customArgs) args.push(...tokenizeArgs(options.customArgs))

  return args
}
