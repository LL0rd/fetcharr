export default defineNuxtConfig({
  compatibilityDate: '2026-08-19',
  devtools: { enabled: false },
  modules: ['@vite-pwa/nuxt'],
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
        { name: 'theme-color', content: '#ec3013' },
      ],
      link: [
        // Von Hand statt über <VitePwaManifest />: die Komponente hängt beim
        // SSR einen zweiten, leeren manifest-Link in den Head.
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Fetcharr',
      short_name: 'Fetcharr',
      description: 'Self-hosted downloader for video and audio.',
      lang: 'en',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#ec3013',
      background_color: '#f3f2f2',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      // Sharing a link from the OS share sheet lands on /share, which forwards
      // to the queue with the add-download dialog already open.
      share_target: {
        action: '/share',
        method: 'GET',
        params: { url: 'url', text: 'text', title: 'title' },
      },
    },
    workbox: {
      // Only the built client bundle is precached; the pages themselves are
      // rendered by Nitro and must stay fresh.
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      navigateFallback: undefined,
      // Nothing under /api may ever be served from the cache — the queue,
      // the event stream and every mutation have to hit the server.
      runtimeCaching: [
        { urlPattern: /^\/api\//, handler: 'NetworkOnly' },
        { urlPattern: /^\/metrics$/, handler: 'NetworkOnly' },
      ],
    },
    // Ohne das liefert das Modul im Dev-Server weder Manifest noch Worker aus,
    // das Share Target ließe sich lokal also gar nicht ausprobieren.
    devOptions: { enabled: true, suppressWarnings: true, type: 'module' },
  },
})
