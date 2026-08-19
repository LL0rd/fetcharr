import { appendFileSync, existsSync, mkdirSync, openSync, readSync, renameSync, closeSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { LOG_LEVELS } from './settings-keys.ts'

export type LogLevel = (typeof LOG_LEVELS)[number]

export interface LogEntry {
  ts: string
  level: LogLevel
  source: string
  msg: string
  [field: string]: unknown
}

export interface LoggerOptions {
  /** Quelle der Zeile — „worker" oder „web"; landet als Feld in jedem Eintrag. */
  source: string
  configDir?: string
  level?: LogLevel
  /** Rotationsgrenze; darüber wandert die Datei auf `.1`. */
  maxBytes?: number
  /** Zusätzlich auf stdout schreiben (Container-Logs). */
  console?: boolean
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
  log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void
  setLevel(level: LogLevel): void
  readonly file: string
}

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
/** So viel vom Dateiende wird für einen Tail eingelesen — genug für ein paar tausend Zeilen. */
const TAIL_BYTES = 2 * 1024 * 1024

export function defaultConfigDir(): string {
  return process.env.CONFIG_DIR ?? './data/config'
}

export function logFilePath(configDir = defaultConfigDir()): string {
  return join(configDir, 'logs', 'fetcharr.log')
}

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)
}

/**
 * JSON-Lines-Logger: eine Zeile je Ereignis, damit der Viewer filtern kann,
 * ohne ein Log-Format parsen zu müssen. Schreibt synchron — die Frequenz ist
 * niedrig und ein verlorener Eintrag beim Absturz wäre genau der wichtige.
 */
export function createLogger(options: LoggerOptions): Logger {
  const file = logFilePath(options.configDir)
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const toConsole = options.console ?? false
  let level: LogLevel = options.level ?? (isLogLevel(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : 'info')

  function write(entryLevel: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (RANK[entryLevel] < RANK[level]) return

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level: entryLevel,
      source: options.source,
      msg,
      ...fields,
    }
    const line = `${JSON.stringify(entry)}\n`

    if (toConsole) process.stdout.write(line)

    try {
      mkdirSync(dirname(file), { recursive: true })
      rotate(file, maxBytes)
      appendFileSync(file, line)
    }
    catch {
      // Ein nicht schreibbares Log darf die Anwendung nicht anhalten.
    }
  }

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    log: write,
    setLevel: (next) => { level = next },
    file,
  }
}

/** Bei Überschreitung der Grenze wird genau eine Generation aufgehoben (`.1`). */
function rotate(file: string, maxBytes: number): void {
  if (!existsSync(file)) return
  if (statSync(file).size < maxBytes) return

  renameSync(file, `${file}.1`)
}

export interface ReadLogOptions {
  configDir?: string
  /** Anzahl der jüngsten Zeilen, die zurückkommen. */
  limit?: number
  /** Mindest-Level: `warn` liefert warn und error. */
  level?: LogLevel
}

/**
 * Liest die jüngsten Einträge — neueste zuletzt, wie in der Datei. Zeilen, die
 * kein JSON sind (etwa aus einem abgeschnittenen Schreibvorgang), fallen raus.
 */
export function readLogEntries(options: ReadLogOptions = {}): LogEntry[] {
  const file = logFilePath(options.configDir)
  const limit = options.limit ?? 200
  const minRank = options.level ? RANK[options.level] : 0

  const entries: LogEntry[] = []
  for (const line of tailLines(file)) {
    const entry = parseLogLine(line)
    if (entry && RANK[entry.level] >= minRank) entries.push(entry)
  }

  return entries.slice(-limit)
}

export function parseLogLine(line: string): LogEntry | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as Partial<LogEntry>
    if (typeof parsed.msg !== 'string' || !isLogLevel(parsed.level)) return null

    return {
      ...parsed,
      ts: typeof parsed.ts === 'string' ? parsed.ts : new Date(0).toISOString(),
      level: parsed.level,
      source: typeof parsed.source === 'string' ? parsed.source : 'unknown',
      msg: parsed.msg,
    }
  }
  catch {
    return null
  }
}

/** Liest höchstens das letzte Stück der Datei; die erste Zeile kann angeschnitten sein. */
function tailLines(file: string): string[] {
  if (!existsSync(file)) return []

  const size = statSync(file).size
  const length = Math.min(size, TAIL_BYTES)
  const buffer = Buffer.alloc(length)
  const fd = openSync(file, 'r')
  try {
    readSync(fd, buffer, 0, length, size - length)
  }
  finally {
    closeSync(fd)
  }

  const lines = buffer.toString('utf8').split('\n')
  if (length < size) lines.shift()

  return lines
}
