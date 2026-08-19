import type { Job } from '@fetcharr/db'

/** Über die Leitung sind die Zeitstempel JSON, also ISO-Strings statt `Date`. */
export type QueueJob = Omit<Job, 'createdAt' | 'updatedAt' | 'startedAt' | 'finishedAt'> & {
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

const RECONNECT_MS = 3000

/**
 * Hält die Queue live: `/api/events` schickt jede geänderte Zeile, gelöschte
 * Jobs (Clear finished) holt `refresh()` — ein Stream kann kein Fehlen melden.
 */
export function useJobsStream() {
  const jobs = ref<QueueJob[]>([])
  const connected = ref(false)
  const index = new Map<string, QueueJob>()

  let source: EventSource | null = null
  let reconnect: ReturnType<typeof setTimeout> | null = null

  function apply(incoming: QueueJob[]): void {
    for (const job of incoming) index.set(job.uid, job)
    jobs.value = [...index.values()].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
  }

  async function refresh(): Promise<void> {
    const response = await $fetch<{ jobs: QueueJob[] }>('/api/jobs')
    index.clear()
    apply(response.jobs)
  }

  function connect(): void {
    close()
    source = new EventSource('/api/events')

    source.addEventListener('open', () => {
      connected.value = true
    })

    source.addEventListener('jobs', (message) => {
      apply(JSON.parse((message as MessageEvent).data))
    })

    source.addEventListener('error', () => {
      connected.value = false
      close()
      void refresh().catch(() => {})
      reconnect = setTimeout(connect, RECONNECT_MS)
    })
  }

  function close(): void {
    if (reconnect) clearTimeout(reconnect)
    reconnect = null
    source?.close()
    source = null
  }

  onMounted(() => {
    void refresh().catch(() => {})
    connect()
  })

  onScopeDispose(() => {
    connected.value = false
    close()
  })

  return { jobs, connected, refresh }
}
