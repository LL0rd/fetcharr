export default defineNuxtConfig({
  compatibilityDate: '2026-08-19',
  devtools: { enabled: false },
  css: ['~/assets/styles.css'],
  typescript: { typeCheck: false, strict: true },
  // The workspace packages ship TypeScript sources, so Nitro has to bundle
  // them instead of treating them as pre-built externals.
  nitro: { externals: { inline: ['@fetcharr/db', '@fetcharr/shared'] } },
  app: {
    head: {
      title: 'Fetcharr',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
})
