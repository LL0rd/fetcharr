import { chmod, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execa } from 'execa'

const RELEASE_BASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

/**
 * The PyInstaller standalone builds. The plain `yt-dlp` asset is a zipimport
 * archive and needs a system Python, which the runtime image does not ship.
 */
const ASSET_BY_ARCH: Record<string, string> = {
  x64: 'yt-dlp_linux',
  arm64: 'yt-dlp_linux_aarch64',
}

export function assetNameForArch(arch: string = process.arch): string {
  const asset = ASSET_BY_ARCH[arch]
  if (!asset) throw new Error(`Unsupported architecture for yt-dlp: ${arch}`)
  return asset
}

function configDir(): string {
  return process.env.CONFIG_DIR ?? './data/config'
}

export function ytdlpPath(): string {
  return join(configDir(), 'bin', 'yt-dlp')
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Downloads yt-dlp into `<CONFIG_DIR>/bin` unless it is already there. Returns the binary path. */
export async function ensureYtdlp(): Promise<string> {
  const target = ytdlpPath()
  if (await exists(target)) return target

  const url = `${RELEASE_BASE_URL}/${assetNameForArch()}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download yt-dlp from ${url}: ${response.status} ${response.statusText}`)
  }
  const body = Buffer.from(await response.arrayBuffer())

  await mkdir(join(configDir(), 'bin'), { recursive: true })
  const staged = `${target}.download`
  try {
    await writeFile(staged, body)
    await chmod(staged, 0o755)
    await rename(staged, target)
  } catch (error) {
    await rm(staged, { force: true })
    throw error
  }
  return target
}

export async function getVersion(): Promise<string> {
  const { stdout } = await execa(ytdlpPath(), ['--version'])
  return stdout.trim()
}
