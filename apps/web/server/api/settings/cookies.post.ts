import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Nimmt den Inhalt einer cookies.txt entgegen und legt sie neben die DB in
 * <CONFIG_DIR>. Der Args-Builder hängt `--cookies` nur an, wenn die Datei da
 * ist — hochladen genügt also, ein Setting gibt es dafür nicht.
 */
const MAX_BYTES = 1024 * 1024

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const text = extractText(body)

  if (!text.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'The cookie file is empty' })
  }
  if (Buffer.byteLength(text) > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'The cookie file is too large' })
  }

  const configDir = process.env.CONFIG_DIR ?? './data/config'
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'cookies.txt'), text.endsWith('\n') ? text : `${text}\n`, 'utf8')

  return {
    saved: true,
    bytes: Buffer.byteLength(text),
    // Chrome-Exporte ohne Header laden zwar, scheitern aber oft still — ein
    // Hinweis in der UI ist ehrlicher als ein späterer 403 vom Downloader.
    looksLikeNetscapeFormat: /^#\s*(netscape|http cookie file)/i.test(text.trimStart()),
  }
})

function extractText(body: unknown): string {
  if (typeof body === 'string') return body
  if (body && typeof body === 'object' && typeof (body as { text?: unknown }).text === 'string') {
    return (body as { text: string }).text
  }

  throw createError({ statusCode: 400, statusMessage: 'Send the cookie file as text' })
}
