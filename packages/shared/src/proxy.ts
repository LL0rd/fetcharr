/**
 * Proxy-Liste für yt-dlp. Eine Zeile je Proxy, so wie sie in den Settings steht:
 *
 *   http://user:pass@proxy-1.example:3128
 *   socks5://10.0.0.5:1080
 *   direct
 *
 * `direct` ist ein Platzhalter für „ohne Proxy" — damit lässt sich die eigene
 * Leitung mit in die Rotation nehmen. Leerzeilen und #-Kommentare werden ignoriert.
 */

/** Interner Marker für einen Slot ohne Proxy; buildArgs setzt dann kein --proxy. */
export const DIRECT = ''

export function parseProxyList(text: string | null | undefined): string[] {
  if (!text) return []

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => (line.toLowerCase() === 'direct' ? DIRECT : line))
}

/**
 * Wählt für einen Job deterministisch einen Proxy: der Seed (Job-uid) verteilt
 * die Jobs über die Liste, der Versuchszähler schaltet bei jedem Fehlschlag
 * eine Position weiter. Ein Proxy, der ein Video 403t, wird so beim Retry
 * nicht noch einmal getroffen. Leere Liste → null, also wie bisher ohne Proxy.
 */
export function pickProxy(
  proxies: readonly string[] | null | undefined,
  seed: string,
  attempt = 0,
): string | null {
  if (!proxies?.length) return null
  const start = fnv1a(seed) % proxies.length
  return proxies[(start + Math.max(0, attempt)) % proxies.length] ?? null
}

/**
 * Für Vorschau und Logs: Zugangsdaten raus, der Rest bleibt erkennbar.
 * `http://user:pass@host:3128` → `http://***@host:3128`.
 */
export function maskProxy(proxy: string | null | undefined): string {
  if (!proxy) return 'direct'
  return proxy.replace(/^([a-z0-9+.-]+:\/\/)[^@/]+@/i, '$1***@')
}

/** Klein, stabil, ohne Abhängigkeit — Verteilung reicht für eine Handvoll Proxys. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}
