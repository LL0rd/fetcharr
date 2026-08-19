/**
 * Leading-edge-Drossel mit injizierter Uhr: der erste Aufruf geht durch, alle
 * weiteren erst wieder nach `intervalMs`. Pur und damit ohne fake timers testbar.
 */
export function createThrottle(now: () => number, intervalMs = 1000): () => boolean {
  let last: number | null = null

  return () => {
    const current = now()
    if (last !== null && current - last < intervalMs) return false
    last = current
    return true
  }
}
