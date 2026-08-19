import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { createLogger, logFilePath, parseLogLine, readLogEntries } from '../src/logger.ts'

let configDir: string

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'fetcharr-log-'))
})

function lines(): string[] {
  return readFileSync(logFilePath(configDir), 'utf8').trim().split('\n')
}

describe('createLogger', () => {
  it('writes one json object per line', () => {
    const logger = createLogger({ source: 'worker', configDir })
    logger.info('download finished', { uid: 'abc' })

    const entry = JSON.parse(lines()[0]!)
    expect(entry).toMatchObject({ level: 'info', source: 'worker', msg: 'download finished', uid: 'abc' })
    expect(new Date(entry.ts).getTime()).toBeGreaterThan(0)
  })

  it('drops entries below the configured level', () => {
    const logger = createLogger({ source: 'web', configDir, level: 'warn' })
    logger.debug('noise')
    logger.info('also noise')
    logger.warn('kept')
    logger.error('kept too')

    expect(lines().map((line) => JSON.parse(line).msg)).toEqual(['kept', 'kept too'])
  })

  it('follows a level change at runtime', () => {
    const logger = createLogger({ source: 'web', configDir, level: 'error' })
    logger.info('dropped')
    logger.setLevel('info')
    logger.info('kept')

    expect(lines()).toHaveLength(1)
    expect(JSON.parse(lines()[0]!).msg).toBe('kept')
  })

  it('rotates onto .1 once the file passes the limit', () => {
    const logger = createLogger({ source: 'worker', configDir, maxBytes: 200 })
    for (let i = 0; i < 20; i += 1) logger.info(`line ${i}`)

    expect(existsSync(`${logFilePath(configDir)}.1`)).toBe(true)
    expect(readFileSync(logFilePath(configDir), 'utf8').length).toBeLessThan(200)
  })

  it('stays quiet when the log directory cannot be written', () => {
    const logger = createLogger({ source: 'web', configDir: join(configDir, 'logs') })
    // Eine Datei dort, wo das Verzeichnis hin müsste: mkdir scheitert, der Aufruf nicht.
    mkdirSync(join(configDir, 'logs'), { recursive: true })
    writeFileSync(join(configDir, 'logs', 'logs'), 'blocker')

    expect(() => logger.info('swallowed')).not.toThrow()
  })
})

describe('readLogEntries', () => {
  it('returns the newest entries last and honours the limit', () => {
    const logger = createLogger({ source: 'web', configDir })
    for (let i = 0; i < 5; i += 1) logger.info(`entry ${i}`)

    expect(readLogEntries({ configDir, limit: 2 }).map((e) => e.msg)).toEqual(['entry 3', 'entry 4'])
  })

  it('filters by minimum level', () => {
    const logger = createLogger({ source: 'web', configDir, level: 'debug' })
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')

    expect(readLogEntries({ configDir, level: 'warn' }).map((entry) => entry.msg)).toEqual(['w', 'e'])
  })

  it('skips lines that are not valid entries', () => {
    const logger = createLogger({ source: 'web', configDir })
    logger.info('good')
    writeFileSync(logFilePath(configDir), 'not json\n{"level":"info"}\n', { flag: 'a' })

    expect(readLogEntries({ configDir })).toHaveLength(1)
  })

  it('is empty while nothing has been logged', () => {
    expect(readLogEntries({ configDir })).toEqual([])
  })
})

describe('parseLogLine', () => {
  it('fills in missing metadata', () => {
    const entry = parseLogLine('{"level":"warn","msg":"hi"}')
    expect(entry).toMatchObject({ level: 'warn', msg: 'hi', source: 'unknown' })
  })

  it('rejects unknown levels', () => {
    expect(parseLogLine('{"level":"trace","msg":"hi"}')).toBeNull()
    expect(parseLogLine('   ')).toBeNull()
  })
})
