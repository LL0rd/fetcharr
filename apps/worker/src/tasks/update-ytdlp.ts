import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { assetNameForArch, getVersion, ytdlpPath } from '../ytdlp.ts'
import type { TaskDefinition } from './types.ts'

/**
 * yt-dlp lebt in `<CONFIG_DIR>/bin` und wird zur Laufzeit aktualisiert — ohne
 * Container-Rebuild, weil ein Site-Wechsel bei YouTube nicht auf das nächste
 * Image warten kann. Der Lauf vergleicht nur die Versionen; geladen wird in der
 * Bestätigungsphase (per Default automatisch).
 */

const LATEST_RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
const RELEASE_DOWNLOAD_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/download'

export interface UpdateYtdlpDeps {
  currentVersion?: () => Promise<string>
  latestVersion?: () => Promise<string>
  download?: (version: string) => Promise<string>
}

interface UpdatePayload {
  latest: string
  current: string | null
}

export function updateYtdlpTask(deps: UpdateYtdlpDeps = {}): TaskDefinition {
  const currentVersion = deps.currentVersion ?? getVersion
  const latestVersion = deps.latestVersion ?? fetchLatestVersion
  const download = deps.download ?? downloadVersion

  return {
    key: 'update_ytdlp',
    title: 'Update yt-dlp',

    async run() {
      const latest = await latestVersion()
      // Fehlt das Binary noch, ist „kein Stand" gleichbedeutend mit „veraltet".
      const current = await currentVersion().catch(() => null)

      return {
        summary:
          current === latest
            ? `yt-dlp ${latest} ist aktuell`
            : `yt-dlp ${latest} verfügbar (installiert: ${current ?? 'keine'})`,
        payload: { latest, current } satisfies UpdatePayload,
        needsConfirm: current !== latest,
      }
    },

    async confirm(_ctx, payload) {
      const version = (payload as UpdatePayload | null)?.latest
      if (!version) throw new Error('Keine Version zum Aktualisieren hinterlegt')

      const target = await download(version)
      return { summary: `yt-dlp ${version} nach ${target} geladen` }
    },
  }
}

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: { accept: 'application/vnd.github+json' },
  })
  if (!response.ok) {
    throw new Error(`GitHub-Release-Abfrage fehlgeschlagen: ${String(response.status)}`)
  }

  const release = (await response.json()) as { tag_name?: string }
  if (!release.tag_name) throw new Error('GitHub-Release ohne tag_name')
  return release.tag_name
}

/** Erst neben das Ziel schreiben, dann umbenennen — ein Abbruch darf kein halbes Binary hinterlassen. */
async function downloadVersion(version: string): Promise<string> {
  const url = `${RELEASE_DOWNLOAD_BASE}/${version}/${assetNameForArch()}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download von ${url} fehlgeschlagen: ${String(response.status)}`)
  }

  const target = ytdlpPath()
  const staged = `${target}.download`
  await mkdir(dirname(target), { recursive: true })

  try {
    await writeFile(staged, Buffer.from(await response.arrayBuffer()))
    await chmod(staged, 0o755)
    await rename(staged, target)
  } catch (error) {
    await rm(staged, { force: true })
    throw error
  }

  return target
}
