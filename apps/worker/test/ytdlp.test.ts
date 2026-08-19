import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assetNameForArch, ensureYtdlp, getVersion, ytdlpPath } from '../src/ytdlp.ts'

const execaMock = vi.hoisted(() => vi.fn())
vi.mock('execa', () => ({ execa: execaMock }))

let configDir: string

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'fetcharr-ytdlp-'))
  process.env.CONFIG_DIR = configDir
  execaMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CONFIG_DIR
  rmSync(configDir, { recursive: true, force: true })
})

function stubFetch(response: () => Response) {
  const fetchMock = vi.fn(async () => response())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('assetNameForArch', () => {
  it('picks the standalone linux binaries, never the zipimport asset', () => {
    expect(assetNameForArch('x64')).toBe('yt-dlp_linux')
    expect(assetNameForArch('arm64')).toBe('yt-dlp_linux_aarch64')
  })

  it('throws on an unsupported architecture', () => {
    expect(() => assetNameForArch('ia32')).toThrow(/ia32/)
  })
})

describe('ytdlpPath', () => {
  it('resolves below the config dir from env', () => {
    expect(ytdlpPath()).toBe(join(configDir, 'bin', 'yt-dlp'))
  })
})

describe('ensureYtdlp', () => {
  it('downloads the arch-specific binary to <CONFIG_DIR>/bin/yt-dlp and makes it executable', async () => {
    const fetchMock = stubFetch(() => new Response(new Uint8Array([0x7f, 0x45, 0x4c, 0x46])))

    const path = await ensureYtdlp()

    expect(path).toBe(join(configDir, 'bin', 'yt-dlp'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetNameForArch()}`,
    )
    expect(readFileSync(path)).toEqual(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
    expect(statSync(path).mode & 0o777).toBe(0o755)
  })

  it('does not download when the binary already exists', async () => {
    const binDir = join(configDir, 'bin')
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(binDir, 'yt-dlp'), 'existing', { mode: 0o755 })
    const fetchMock = stubFetch(() => new Response(new Uint8Array([1])))

    const path = await ensureYtdlp()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(readFileSync(path, 'utf8')).toBe('existing')
  })

  it('fails without leaving a partial binary behind when the download fails', async () => {
    stubFetch(() => new Response('not found', { status: 404 }))

    await expect(ensureYtdlp()).rejects.toThrow(/404/)
    expect(() => statSync(join(configDir, 'bin', 'yt-dlp'))).toThrow()
  })
})

describe('getVersion', () => {
  it('runs the managed binary with --version', async () => {
    execaMock.mockResolvedValue({ stdout: '2026.08.11\n' })

    await expect(getVersion()).resolves.toBe('2026.08.11')
    expect(execaMock).toHaveBeenCalledWith(join(configDir, 'bin', 'yt-dlp'), ['--version'])
  })
})
