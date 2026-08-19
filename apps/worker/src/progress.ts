export interface ProgressUpdate {
  /** 0–100 */
  pct: number
  /** yt-dlp speed token, e.g. `8.40MiB/s`; null while unknown */
  speed: string | null
  /** remaining time as `MM:SS` or `HH:MM:SS`; null while unknown or on the completion line */
  eta: string | null
  /** total size in bytes; approximate (`~`) sizes are reported as given */
  sizeBytes: number | null
}

const UNIT_FACTOR: Record<string, number> = {
  B: 1,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
  KB: 1000,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
  TB: 1000 ** 4,
}

const PROGRESS_RE = new RegExp(
  String.raw`^\[download\]\s+(?<pct>\d+(?:\.\d+)?)%\s+of\s+~?\s*` +
    String.raw`(?:(?<size>\d+(?:\.\d+)?)(?<unit>[KMGT]?i?B)|Unknown)` +
    String.raw`(?:\s+in\s+[\d:]+)?` +
    String.raw`(?:\s+at\s+(?<speed>Unknown\s+B/s|[\d.]+[KMGT]?i?B/s))?` +
    String.raw`(?:\s+ETA\s+(?<eta>[\d:]+|Unknown))?`,
)

export function parseProgressLine(line: string): ProgressUpdate | null {
  const match = PROGRESS_RE.exec(line)
  if (!match?.groups) return null

  const { pct, size, unit, speed, eta } = match.groups
  const factor = unit ? UNIT_FACTOR[unit] : undefined

  return {
    pct: Number(pct),
    speed: speed && !speed.startsWith('Unknown') ? speed : null,
    eta: eta && eta !== 'Unknown' ? eta : null,
    sizeBytes: size && factor ? Math.round(Number(size) * factor) : null,
  }
}
