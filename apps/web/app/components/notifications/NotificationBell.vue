<script setup lang="ts">
import NotificationRow from './NotificationRow.vue'
import { badgeLabel, DROPDOWN_LIMIT, type NotificationItem } from './notifications.ts'
import { useNotificationCenter, useNotificationStream } from './use-notification-center.ts'

const { items, unread, load, apply, markRead, markAllRead } = useNotificationCenter()

const open = ref(false)
const badge = computed(() => badgeLabel(unread.value))
const latest = computed(() => items.value.slice(0, DROPDOWN_LIMIT))

useNotificationStream(apply)

onMounted(() => {
  void load(DROPDOWN_LIMIT).catch(() => {})
  document.addEventListener('click', closeOnOutside)
})

onBeforeUnmount(() => document.removeEventListener('click', closeOnOutside))

const root = ref<HTMLElement | null>(null)

function closeOnOutside(event: MouseEvent): void {
  if (!open.value) return
  if (!root.value?.contains(event.target as Node)) open.value = false
}

function toggle(): void {
  open.value = !open.value
  if (open.value) void load(DROPDOWN_LIMIT).catch(() => {})
}

async function onOpen(item: NotificationItem): Promise<void> {
  open.value = false
  if (!item.read) await markRead([item.id]).catch(() => {})
  if (item.url) await navigateTo(item.url)
}
</script>

<template>
  <div ref="root" class="bell-root">
    <button
      class="btn btn-secondary btn-icon bell"
      type="button"
      aria-label="Notifications"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg
        width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span v-if="badge" class="badge">{{ badge }}</span>
    </button>

    <div v-if="open" class="dropdown">
      <div class="dropdown-head">
        <span class="dropdown-title">NOTIFICATIONS</span>
        <button class="btn btn-ghost mark-all" type="button" @click="markAllRead()">
          Mark all read
        </button>
      </div>

      <p v-if="!latest.length" class="empty">Nothing yet — downloads and subscription finds show up here.</p>

      <NotificationRow
        v-for="item in latest"
        :key="item.id"
        :item="item"
        compact
        @open="onOpen"
      />

      <div class="dropdown-foot">
        <NuxtLink to="/notifications" class="all-link" @click="open = false">All notifications</NuxtLink>
        <span>External: ntfy · Gotify · Discord webhook — configure in Settings</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bell-root { display: flex; }
.bell { position: relative; }

.badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  display: grid;
  place-items: center;
  background: var(--color-accent);
  color: var(--color-bg);
  font-size: 9px;
  font-weight: 800;
}

.dropdown {
  position: absolute;
  top: 52px;
  right: 16px;
  width: 360px;
  z-index: 60;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  box-shadow: var(--shadow-lg);
}

.dropdown-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 2px solid var(--color-divider);
}
.dropdown-title { font-family: var(--font-heading); font-weight: 800; font-size: 13px; }
.mark-all { font-size: 12px; }

.empty { margin: 0; padding: 14px 12px; font-size: 12px; color: var(--color-neutral-700); }

.dropdown-foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--color-neutral-600);
}
.all-link { color: var(--color-accent); text-decoration: none; font-size: 12px; }
</style>
