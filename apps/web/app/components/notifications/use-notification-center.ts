import {
  mergeNotifications,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationItem,
  type NotificationPage,
  type NotificationUpdate,
} from './notifications.ts'

const RECONNECT_MS = 3000

/**
 * Gemeinsamer Stand für Glocke und Seite: beide lesen dieselbe Liste, damit ein
 * „Mark all read" im Dropdown auch die Seite hinter sich aufräumt.
 */
export function useNotificationCenter() {
  const items = useState<NotificationItem[]>('notifications', () => [])
  const unread = useState('notifications-unread', () => 0)
  const total = useState('notifications-total', () => 0)
  const loading = useState('notifications-loading', () => false)

  async function load(limit = NOTIFICATIONS_PAGE_SIZE): Promise<void> {
    loading.value = true
    try {
      const page = await $fetch<NotificationPage>('/api/notifications', { query: { limit } })
      items.value = page.notifications
      unread.value = page.unread
      total.value = page.total
    }
    finally {
      loading.value = false
    }
  }

  function apply(update: NotificationUpdate): void {
    items.value = mergeNotifications(items.value, update.notifications)
    unread.value = update.unread
    total.value = Math.max(total.value, items.value.length)
  }

  async function markAllRead(): Promise<void> {
    const response = await $fetch<{ unread: number }>('/api/notifications/read', {
      method: 'POST',
      body: { all: true },
    })
    items.value = items.value.map((entry) => ({ ...entry, read: true }))
    unread.value = response.unread
  }

  async function markRead(ids: number[]): Promise<void> {
    if (!ids.length) return

    const response = await $fetch<{ unread: number }>('/api/notifications/read', {
      method: 'POST',
      body: { ids },
    })
    const marked = new Set(ids)
    items.value = items.value.map((entry) => (marked.has(entry.id) ? { ...entry, read: true } : entry))
    unread.value = response.unread
  }

  async function clearAll(): Promise<void> {
    await $fetch('/api/notifications', { method: 'DELETE' })
    items.value = []
    unread.value = 0
    total.value = 0
  }

  return { items, unread, total, loading, load, apply, markRead, markAllRead, clearAll }
}

/**
 * Hängt die Glocke an `/api/events`. Nur ein Aufrufer (der Header) — sonst
 * öffnet jede Seite eine zweite Verbindung.
 */
export function useNotificationStream(apply: (update: NotificationUpdate) => void): void {
  let source: EventSource | null = null
  let reconnect: ReturnType<typeof setTimeout> | null = null

  function close(): void {
    if (reconnect) clearTimeout(reconnect)
    reconnect = null
    source?.close()
    source = null
  }

  function connect(): void {
    close()
    source = new EventSource('/api/events')

    source.addEventListener('notifications', (message) => {
      apply(JSON.parse((message as MessageEvent).data) as NotificationUpdate)
    })

    source.addEventListener('error', () => {
      close()
      reconnect = setTimeout(connect, RECONNECT_MS)
    })
  }

  onMounted(connect)
  onScopeDispose(close)
}
