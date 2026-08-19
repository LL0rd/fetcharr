import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@fetcharr/shared',
    include: ['test/**/*.test.ts'],
  },
})
