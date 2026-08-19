/**
 * Web Share Target hands the payload over in whichever field the sending app
 * felt like using: Chrome on Android puts a plain link in `url`, most Android
 * apps share "Some title https://…" as `text`, and a few only fill `title`.
 * So every field is searched, in that order of trustworthiness.
 */

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/i

/** Trailing punctuation a shared sentence tends to glue onto the link. */
const TRAILING_JUNK = /[.,;:!?)\]}]+$/

export function extractSharedUrl(query: Record<string, unknown>): string {
  for (const key of ['url', 'text', 'title']) {
    const found = firstUrlIn(query[key])
    if (found) return found
  }
  return ''
}

function firstUrlIn(value: unknown): string {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : null
  if (typeof raw !== 'string') return ''

  const match = URL_PATTERN.exec(raw.trim())
  if (!match) return ''

  const candidate = match[0].replace(TRAILING_JUNK, '')
  try {
    return new URL(candidate).toString()
  }
  catch {
    return ''
  }
}
