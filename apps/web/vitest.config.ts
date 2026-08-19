import { createRequire } from 'node:module'
import { dirname } from 'node:path'

import { defineConfig } from 'vitest/config'

// Nitro auto-imports h3 at runtime, so the app does not depend on it directly.
// Outside Nitro (tests) the specifier has to be pointed at the copy Nuxt uses.
const require = createRequire(import.meta.url)
const h3 = dirname(require.resolve('h3', { paths: [require.resolve('nuxt/package.json')] }))

export default defineConfig({
  test: {
    name: 'web',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { h3 },
  },
})
