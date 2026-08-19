import { readFileSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

const DEFAULT_IMAGE = 'ghcr.io/ll0rd/fetcharr:latest'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const REGISTRY_TIMEOUT_MS = 8_000

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

export interface VersionInfo {
  version: string
  ytdlp: string | null
  imageDigest: string | null
  latestImageDigest: string | null
  /** null heißt „nicht feststellbar" — kein Digest bekannt oder Registry stumm. */
  updateAvailable: boolean | null
}

let cache: { at: number; value: VersionInfo } | null = null

/**
 * Der Registry-Roundtrip kostet Zeit und Rate-Limit, die Antwort ändert sich
 * aber höchstens täglich — deshalb sechs Stunden aus dem Speicher.
 */
export default defineEventHandler(async () => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  const db = await useDb()
  const value = await buildVersionInfo(readYtdlpVersion(db))
  cache = { at: Date.now(), value }
  return value
})

/** Nur für Tests: erzwingt den nächsten Registry-Aufruf. */
export function clearVersionCache(): void {
  cache = null
}

export async function buildVersionInfo(ytdlp: string | null): Promise<VersionInfo> {
  const imageDigest = process.env.FETCHARR_IMAGE_DIGEST?.trim() || null
  const latestImageDigest = await fetchLatestDigest(process.env.FETCHARR_IMAGE || DEFAULT_IMAGE)

  return {
    version: readAppVersion(),
    ytdlp,
    imageDigest,
    latestImageDigest,
    updateAvailable:
      imageDigest && latestImageDigest ? imageDigest !== latestImageDigest : null,
  }
}

type SqlDb = { $client: { prepare: (sql: string) => any } }

/** Die Version schreibt der update_ytdlp-Task; fehlt sie, ist das kein Fehler. */
export function readYtdlpVersion(db: SqlDb): string | null {
  const row = db.$client.prepare("SELECT value FROM settings WHERE key = 'ytdlp_version'").get() as
    | { value: unknown }
    | undefined

  const value = row?.value
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : value
  }
  catch {
    return value
  }
}

/**
 * Holt den Manifest-Digest des Tags. ghcr verlangt auch für öffentliche Images
 * einen Token, den es aber anonym herausgibt. Jeder Fehler endet in null —
 * ein unerreichbares ghcr darf die Seite nicht rot machen.
 */
export async function fetchLatestDigest(image: string): Promise<string | null> {
  const parsed = parseImage(image)
  if (!parsed) return null

  try {
    const token = await fetchAnonymousToken(parsed.registry, parsed.repository)
    const headers: Record<string, string> = { accept: MANIFEST_ACCEPT }
    if (token) headers.authorization = `Bearer ${token}`

    const response = await fetch(
      `https://${parsed.registry}/v2/${parsed.repository}/manifests/${parsed.tag}`,
      { method: 'HEAD', headers, signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) },
    )
    if (!response.ok) return null
    return response.headers.get('docker-content-digest')
  }
  catch {
    return null
  }
}

async function fetchAnonymousToken(registry: string, repository: string): Promise<string | null> {
  const url = `https://${registry}/token?scope=${encodeURIComponent(`repository:${repository}:pull`)}&service=${registry}`

  const response = await fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) })
  if (!response.ok) return null

  const body = (await response.json()) as { token?: unknown; access_token?: unknown }
  const token = body.token ?? body.access_token
  return typeof token === 'string' && token ? token : null
}

export function parseImage(image: string): { registry: string; repository: string; tag: string } | null {
  const trimmed = image.trim()
  if (!trimmed) return null

  const slash = trimmed.indexOf('/')
  if (slash < 0) return null

  const registry = trimmed.slice(0, slash)
  const rest = trimmed.slice(slash + 1)
  const colon = rest.lastIndexOf(':')
  const repository = colon > 0 ? rest.slice(0, colon) : rest
  const tag = colon > 0 ? rest.slice(colon + 1) : 'latest'

  if (!registry.includes('.') || !repository || !tag) return null
  return { registry, repository, tag }
}

/**
 * Die Versionsnummer steht im Root-`package.json` des Monorepos; im Container
 * liegt sie neben dem Build, in der Entwicklung ein paar Ebenen weiter oben.
 */
export function readAppVersion(): string {
  const fromEnv = process.env.FETCHARR_VERSION?.trim()
  if (fromEnv) return fromEnv

  let dir = process.cwd()
  const root = parse(dir).root

  while (true) {
    const version = versionOf(join(dir, 'package.json'))
    if (version) return version
    if (dir === root) return 'unknown'
    dir = dirname(dir)
  }
}

function versionOf(path: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { name?: string; version?: string }
    if (parsed.name !== 'fetcharr') return null
    return typeof parsed.version === 'string' && parsed.version ? parsed.version : null
  }
  catch {
    return null
  }
}
