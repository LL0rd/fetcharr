import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { createDb, requeueRunning } from '@fetcharr/db'

import { startLoop } from './loop.ts'
import { ensureYtdlp, getVersion } from './ytdlp.ts'

const configDir = process.env.CONFIG_DIR ?? './data/config'
const downloadsDir = process.env.DOWNLOADS_DIR ?? './data/downloads'

function log(message: string): void {
  console.log(`[worker] ${new Date().toISOString()} ${message}`)
}

async function main(): Promise<void> {
  await mkdir(configDir, { recursive: true })
  await mkdir(downloadsDir, { recursive: true })

  const db = createDb(join(configDir, 'fetcharr.db'))

  // Nach einem Absturz stehen Jobs auf `running`, ohne dass ein Prozess läuft.
  const requeued = requeueRunning(db)
  if (requeued > 0) log(`requeued ${requeued} orphaned job(s)`)

  await ensureYtdlp()
  log(`yt-dlp ${await getVersion()}`)

  const loop = startLoop({ db, downloadsDir, configDir, log })
  log(`polling ${downloadsDir}`)

  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    log(`${signal} — stopping`)
    void loop.stop().then(() => {
      db.$client.close()
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  log(`fatal: ${error instanceof Error ? error.stack : String(error)}`)
  process.exit(1)
})
