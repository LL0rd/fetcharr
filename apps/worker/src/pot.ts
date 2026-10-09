/**
 * Der PO-Token-Provider (bgutil-ytdlp-pot-provider) läuft im Image als eigener
 * s6-Dienst auf 127.0.0.1:4416 — der Default, den das yt-dlp-Plugin abfragt.
 * Der Worker braucht ihn nicht selbst; der Ping beim Start macht im Log nur
 * sichtbar, ob YouTube-Downloads mit oder ohne Token laufen werden.
 */

export const POT_PROVIDER_URL = 'http://127.0.0.1:4416'

export type PotProviderStatus =
  | { available: true; version: string }
  | { available: false; reason: string }

export async function potProviderStatus(
  baseUrl: string = POT_PROVIDER_URL,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<PotProviderStatus> {
  try {
    const response = await fetchFn(`${baseUrl}/ping`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return { available: false, reason: `HTTP ${String(response.status)}` }
    const body = (await response.json()) as { version?: unknown }
    const version = typeof body.version === 'string' ? body.version : 'unknown'
    return { available: true, version }
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

export function describePotProvider(status: PotProviderStatus): string {
  return status.available
    ? `PO token provider ${status.version} ready`
    : `PO token provider unavailable (${status.reason}) — YouTube downloads run without tokens`
}
