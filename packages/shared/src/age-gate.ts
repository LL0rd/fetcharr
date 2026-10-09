/**
 * Altersbeschränkte Videos: YouTube verlangt dafür ein eingeloggtes Konto. Ohne
 * Cookies bleibt ein einziger Hebel — die Embed-Clients liefern einbettbare Videos
 * auch ohne Altersnachweis aus. Der Runner probiert sie genau einmal nach, wenn
 * der erste Lauf an der Altersabfrage gescheitert ist.
 */

export const AGE_GATE_CLIENTS = 'youtube:player_client=tv_embedded,web_embedded'

const AGE_GATE_PATTERNS = [
  /sign in to confirm your age/i,
  /age-restricted/i,
  /confirm your age/i,
]

export function isAgeRestricted(stderr: string): boolean {
  return AGE_GATE_PATTERNS.some((pattern) => pattern.test(stderr))
}

/**
 * Ersetzt den Client-Pin (`--extractor-args youtube:player_client=…`) durch die
 * Embed-Clients. Hängt ihn an, wenn der Lauf keinen Pin hatte; alle anderen
 * Argumente bleiben in ihrer Reihenfolge stehen.
 */
export function withAgeGateClients(args: string[]): string[] {
  const result: string[] = []
  let replaced = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const next = args[index + 1]
    if (arg === '--extractor-args' && next?.startsWith('youtube:player_client=')) {
      result.push(arg, AGE_GATE_CLIENTS)
      replaced = true
      index += 1
      continue
    }
    result.push(arg)
  }
  if (!replaced) result.push('--extractor-args', AGE_GATE_CLIENTS)
  return result
}
