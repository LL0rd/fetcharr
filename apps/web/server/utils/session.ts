import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useSession, type H3Event } from 'h3'

export const SESSION_NAME = 'fetcharr-session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export interface SessionData {
  admin?: true
}

let secret: Promise<string> | undefined

/**
 * The seal secret lives in CONFIG_DIR so sessions survive a restart. It is
 * generated on first use; deleting the file simply logs everyone out.
 */
export function getSessionSecret(): Promise<string> {
  secret ??= loadOrCreateSecret()
  return secret
}

async function loadOrCreateSecret(): Promise<string> {
  const configDir = process.env.CONFIG_DIR ?? './data/config'
  const file = join(configDir, 'session-secret')

  const existing = await readSecret(file)
  if (existing) {
    return existing
  }

  await mkdir(configDir, { recursive: true })
  const generated = randomBytes(32).toString('base64url')
  try {
    await writeFile(file, generated, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    return generated
  }
  catch {
    // Another worker won the race — its secret is the authoritative one.
    return (await readSecret(file)) ?? generated
  }
}

async function readSecret(file: string): Promise<string | undefined> {
  try {
    const content = (await readFile(file, 'utf8')).trim()
    return content.length >= 32 ? content : undefined
  }
  catch {
    return undefined
  }
}

async function session(event: H3Event) {
  return useSession<SessionData>(event, {
    name: SESSION_NAME,
    password: await getSessionSecret(),
    maxAge: SESSION_MAX_AGE,
    cookie: { httpOnly: true, sameSite: 'lax', path: '/' },
  })
}

export async function isSessionAuthenticated(event: H3Event): Promise<boolean> {
  return (await session(event)).data.admin === true
}

export async function startSession(event: H3Event): Promise<void> {
  await (await session(event)).update({ admin: true })
}

export async function endSession(event: H3Event): Promise<void> {
  await (await session(event)).clear()
}
