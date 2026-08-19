<script setup lang="ts">
import NotificationBell from '~/components/notifications/NotificationBell.vue'

const emit = defineEmits<{ fetch: [url: string] }>()

const url = ref('')

function submit(): void {
  const value = url.value.trim()
  if (!value) return
  emit('fetch', value)
  url.value = ''
}
</script>

<template>
  <header class="app-header">
    <div class="url-bar">
      <input
        v-model="url"
        class="input url-input"
        placeholder="Paste any URL — video, playlist, channel — and hit Enter"
        @keydown.enter="submit"
      >
      <button class="btn btn-primary" type="button" @click="submit">Fetch</button>
    </div>

    <div class="header-actions">
      <a href="/api/docs" class="docs-link">/api/docs</a>
      <NotificationBell />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  height: 52px;
  padding: 0 20px;
  background: var(--color-bg);
  border-bottom: 2px solid var(--color-divider);
}

.url-bar { display: flex; flex: 1; max-width: 680px; }
.url-input { flex: 1; font-family: ui-monospace, monospace; font-size: 13px; }

.header-actions { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.docs-link { font-size: 12px; color: var(--color-neutral-700); text-decoration: none; }
.docs-link:hover { color: var(--color-accent); }
</style>
