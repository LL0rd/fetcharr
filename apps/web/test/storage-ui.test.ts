import { describe, expect, it } from 'vitest'

import type { StorageRow } from '../app/components/storage/storage'
import { barWidth, fileCount, storageSize, tabGrouping } from '../app/components/storage/storage'

function row(sizeBytes: number, name = 'Kanal'): StorageRow {
  return { key: name, name, sizeBytes, files: 1, pct: 0 }
}

describe('storageSize', () => {
  it('schreibt Terabyte mit zwei Nachkommastellen wie im Mockup', () => {
    expect(storageSize(1.38 * 1024 ** 4)).toBe('1.38 TB')
  })

  it('schreibt Gigabyte mit einer Nachkommastelle', () => {
    expect(storageSize(14.2 * 1024 ** 3)).toBe('14.2 GB')
  })

  it('rundet kleinere Einheiten auf ganze Zahlen', () => {
    expect(storageSize(512 * 1024 ** 2)).toBe('512 MB')
    expect(storageSize(2048)).toBe('2 KB')
  })

  it('zeigt Null und Unbekanntes unterscheidbar', () => {
    expect(storageSize(0)).toBe('0 B')
    expect(storageSize(null)).toBe('—')
  })
})

describe('fileCount', () => {
  it('gruppiert Tausender', () => {
    expect(fileCount(2431)).toBe('2,431')
  })
})

describe('tabGrouping', () => {
  it('übersetzt die Mockup-Beschriftungen in Query-Parameter', () => {
    expect(tabGrouping('By channel')).toBe('channel')
    expect(tabGrouping('By subscription')).toBe('subscription')
    expect(tabGrouping('By type')).toBe('type')
  })
})

describe('barWidth', () => {
  it('misst jede Zeile an der größten', () => {
    const rows = [row(1000, 'a'), row(500, 'b')]

    expect(barWidth(rows[0]!, rows)).toBe('100%')
    expect(barWidth(rows[1]!, rows)).toBe('50%')
  })

  it('lässt auch winzige Zeilen sichtbar', () => {
    const rows = [row(1_000_000, 'a'), row(1, 'b')]

    expect(barWidth(rows[1]!, rows)).toBe('1%')
  })

  it('kommt mit lauter Nullgrößen klar', () => {
    const rows = [row(0, 'a')]

    expect(barWidth(rows[0]!, rows)).toBe('0%')
  })
})
