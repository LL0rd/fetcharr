/**
 * Zerlegt den Textarea-Inhalt in URLs: eine je Zeile, Leerzeilen fliegen raus,
 * Dubletten ebenfalls — sonst zeigt der Zähler mehr an, als der Server anlegt.
 */
export function parseBulkUrls(text: string): string[] {
  const seen = new Set<string>()
  for (const line of text.split('\n')) {
    const url = line.trim()
    if (url) seen.add(url)
  }
  return [...seen]
}
