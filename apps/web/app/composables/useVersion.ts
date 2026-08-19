export interface VersionInfo {
  version: string
  ytdlp: string | null
  imageDigest: string | null
  latestImageDigest: string | null
  updateAvailable: boolean | null
}

/**
 * Die Versionsinfo hängt an einem geteilten State: Sidebar und Settings-Seite
 * fragen dieselbe Antwort ab, der Server cacht sie ohnehin sechs Stunden.
 */
export function useVersion() {
  const info = useState<VersionInfo | null>('version-info', () => null)

  async function load(): Promise<void> {
    if (info.value) return
    try {
      info.value = await $fetch<VersionInfo>('/api/version')
    }
    catch {
      // Ohne Antwort bleibt der Update-Hinweis einfach aus.
    }
  }

  const version = computed(() => info.value?.version ?? null)
  const updateAvailable = computed(() => info.value?.updateAvailable === true)

  return { info, version, updateAvailable, load }
}
