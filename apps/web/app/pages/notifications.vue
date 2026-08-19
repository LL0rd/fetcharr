<script setup lang="ts">
import NotificationRow from '~/components/notifications/NotificationRow.vue'
import { NOTIFICATIONS_PAGE_SIZE, type NotificationItem } from '~/components/notifications/notifications'
import { useNotificationCenter } from '~/components/notifications/use-notification-center'

const { items, unread, loading, load, markRead, markAllRead, clearAll } = useNotificationCenter()

const error = ref('')

const summary = computed(() => {
  const count = items.value.length
  const label = `${String(count)} ${count === 1 ? 'entry' : 'entries'}`
  return unread.value ? `${label} · ${String(unread.value)} unread` : label
})

onMounted(() => void refresh())

async function refresh(): Promise<void> {
  error.value = ''
  try {
    await load(NOTIFICATIONS_PAGE_SIZE)
  }
  catch {
    error.value = 'Could not load the notifications.'
  }
}

async function onOpen(item: NotificationItem): Promise<void> {
  if (!item.read) await markRead([item.id]).catch(() => {})
  if (item.url) await navigateTo(item.url)
}
</script>

<template>
  <section>
    <div class="bar">
      <h4>Notifications</h4>
      <span class="summary">{{ summary }}</span>
      <div class="actions">
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="!items.length"
          @click="clearAll()"
        >
          Clear all
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="!unread"
          @click="markAllRead()"
        >
          Mark all read
        </button>
      </div>
    </div>

    <p v-if="error" class="note note-error">{{ error }}</p>

    <div class="list">
      <NotificationRow
        v-for="item in items"
        :key="item.id"
        :item="item"
        @open="onOpen"
      />
    </div>

    <p v-if="!items.length && !loading" class="empty">
      Nothing yet — finished downloads, failed attempts and subscription finds show up here.
      External channels (ntfy, Gotify, Discord, webhook) are configured in Settings.
    </p>
  </section>
</template>

<style scoped>
.bar { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.summary { font-size: 12px; color: var(--color-neutral-700); }
.actions { margin-left: auto; display: flex; gap: 8px; }
.actions .btn { font-size: 12px; padding: 5px 12px; }

.list { border-top: 2px solid var(--color-divider); max-width: 720px; }

.empty {
  margin-top: 14px;
  max-width: 720px;
  font-size: 13px;
  color: var(--color-neutral-700);
}
.note {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 12px;
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
}
.note-error { background: var(--color-accent-100); color: var(--color-accent-800); }
</style>
