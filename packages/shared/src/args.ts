import type { JobOptions } from './job-options.ts'

/** Die drei Rollen, in denen eine Datei in der Mediathek landen kann. */
export type MediaKind = 'video' | 'audio' | 'subtitle'

export interface ArgsJob {
  type: MediaKind
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
  // `--skip-download` lässt yt-dlp Metadaten, Thumbnail und Untertitel holen,
  // aber keinen einzigen Medien-Stream — genau das ist der Untertitel-Modus.
  subtitle: ['--skip-download', '--write-subs'],
}

export const DEFAULT_SUB_LANGS = 'en'
export const DEFAULT_SUB_FORMAT = 'srt'

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
  // YouTubes Default-Clients (tv/android_vr) liefern die hier gewählten https-Formate ohne
  // PO-Token mit 403 aus; web_safari lädt sauber, mweb ist der Fallback. Wirkt nur auf den
  // YouTube-Extractor und ist für jede andere Site ein No-op — daher bedingungslos gesetzt.
  '--extractor-args',
  'youtube:player_client=web_safari,mweb',
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

  if (options.format === 'subtitle') {
    if (options.autoSubs) args.push('--write-auto-subs')
    args.push('--sub-langs', options.subLangs || DEFAULT_SUB_LANGS)
    args.push('--convert-subs', options.subFormat ?? DEFAULT_SUB_FORMAT)
  }

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
