import { clearQueue } from '@fetcharr/db'

/**
 * Leert die Arbeitsliste: wartende, pausierte und laufende Jobs. Ein laufender
 * Download wird dabei abgebrochen — der Worker sieht die fehlende Zeile und
 * killt den yt-dlp-Prozess. Fertige und fehlgeschlagene Jobs bleiben stehen,
 * die räumt `clear-finished` weg.
 */
export default defineEventHandler(async () => {
  const db = await useDb()
  return { removed: clearQueue(db) }
})
