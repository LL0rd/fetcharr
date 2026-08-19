interface AuthStatus {
  hasAdmin: boolean
  authenticated: boolean
}

/**
 * Client-side gate: everything but /login needs a session. Runs on the client
 * only — the session cookie is not forwarded during SSR, and the API routes
 * are guarded on the server anyway.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    return
  }

  let status: AuthStatus
  try {
    status = await $fetch<AuthStatus>('/api/auth/status')
  }
  catch {
    return to.path === '/login' ? undefined : navigateTo('/login')
  }

  if (!status.authenticated && to.path !== '/login') {
    return navigateTo('/login')
  }
  if (status.authenticated && to.path === '/login') {
    return navigateTo('/')
  }
})
