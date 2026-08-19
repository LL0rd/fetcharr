import { timingSafeEqual } from 'node:crypto'

import { Algorithm, hash, verify } from '@node-rs/argon2'
import { customAlphabet } from 'nanoid'

import type { Db } from '@fetcharr/db'

/** Fetcharr knows exactly one admin; the row always carries id 1. */
export const ADMIN_ID = 1
export const MIN_PASSWORD_LENGTH = 12

const API_KEY_LENGTH = 32
const newApiKey = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', API_KEY_LENGTH)

export interface Admin {
  id: number
  passwordHash: string
  apiKey: string
  createdAt: Date
}

interface AuthRow {
  id: number
  password_hash: string
  api_key: string
  created_at: number
}

export function getAdmin(db: Db): Admin | undefined {
  const row = db.$client.prepare('SELECT * FROM auth WHERE id = ?').get(ADMIN_ID) as AuthRow | undefined
  if (!row) {
    return undefined
  }
  return {
    id: row.id,
    passwordHash: row.password_hash,
    apiKey: row.api_key,
    createdAt: new Date(row.created_at * 1000),
  }
}

export function hasAdmin(db: Db): boolean {
  return getAdmin(db) !== undefined
}

/**
 * Creates the single admin account. Fails if one exists already — first-run
 * setup must never be a way to overwrite the password of a running instance.
 */
export async function createAdmin(db: Db, password: string): Promise<Admin> {
  if (hasAdmin(db)) {
    throw new AuthError(409, 'Admin account already exists')
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }

  const passwordHash = await hashPassword(password)
  const apiKey = newApiKey()
  const createdAt = Math.floor(Date.now() / 1000)
  db.$client
    .prepare('INSERT INTO auth (id, password_hash, api_key, created_at) VALUES (?, ?, ?, ?)')
    .run(ADMIN_ID, passwordHash, apiKey, createdAt)

  return { id: ADMIN_ID, passwordHash, apiKey, createdAt: new Date(createdAt * 1000) }
}

export async function verifyAdminPassword(db: Db, password: string): Promise<boolean> {
  const admin = getAdmin(db)
  if (!admin || typeof password !== 'string' || password.length === 0) {
    return false
  }
  try {
    return await verify(admin.passwordHash, password)
  }
  catch {
    return false
  }
}

export function isValidApiKey(db: Db, candidate: string | undefined): boolean {
  const admin = getAdmin(db)
  if (!admin || !candidate) {
    return false
  }
  const expected = Buffer.from(admin.apiKey)
  const given = Buffer.from(candidate)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm: Algorithm.Argon2id })
}

/** Carries the HTTP status an endpoint should answer with. */
export class AuthError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}
