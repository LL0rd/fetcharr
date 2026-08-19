import { describe, expect, it } from 'vitest'
import { TASK_KEYS } from '@fetcharr/db'

import { defaultTasks } from '../../src/tasks/registry.ts'

describe('defaultTasks', () => {
  it('deckt genau die Task-Schlüssel der Datenbank ab', () => {
    expect(defaultTasks().map((task) => task.key).sort()).toEqual([...TASK_KEYS].sort())
  })

  it('gibt jedem Task einen Titel', () => {
    expect(defaultTasks().every((task) => task.title.length > 0)).toBe(true)
  })
})
