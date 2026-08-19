<script setup lang="ts">
import { notificationAge, type NotificationItem } from './notifications.ts'

const props = defineProps<{ item: NotificationItem; compact?: boolean }>()
const emit = defineEmits<{ open: [item: NotificationItem] }>()

const age = computed(() => notificationAge(props.item.createdAt))
</script>

<template>
  <component
    :is="item.url ? 'button' : 'div'"
    class="notification-row"
    :class="{ compact, unread: !item.read, clickable: Boolean(item.url) }"
    :type="item.url ? 'button' : undefined"
    @click="item.url && emit('open', item)"
  >
    <span class="dot" />
    <span class="text">
      <span class="title">{{ item.title }}</span>
      <span v-if="item.body" class="body">{{ item.body }}</span>
    </span>
    <span class="age">{{ age }}</span>
  </component>
</template>

<style scoped>
.notification-row {
  display: flex;
  gap: 12px;
  width: 100%;
  padding: 12px 10px;
  border: 0;
  border-bottom: 1px solid var(--color-divider);
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--color-text);
  text-align: left;
}
.notification-row.compact { gap: 10px; padding: 10px 12px; font-size: 12px; }
.notification-row.clickable { cursor: pointer; }
.notification-row.clickable:hover { background: color-mix(in srgb, var(--color-text) 5%, transparent); }

.dot {
  width: 8px;
  height: 8px;
  flex: none;
  margin-top: 5px;
  background: var(--color-neutral-300);
}
.notification-row.unread .dot { background: var(--color-accent); }

.text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.title { font-weight: 600; }
.body { font-size: 12px; color: var(--color-neutral-700); }
.compact .body { font-size: inherit; }

.age { flex: none; font-size: 11px; color: var(--color-neutral-600); }
.compact .age { font-size: 10px; }
</style>
