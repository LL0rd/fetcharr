<script setup lang="ts">
// The URL field and the bell are inert until the probe and notification
// features land; they exist here so the shell matches the mockup.
const url = ref('')
</script>

<template>
  <header class="app-header">
    <div class="url-bar">
      <input
        v-model="url"
        class="input url-input"
        placeholder="Paste any URL — video, playlist, channel — and hit Enter"
      >
      <button class="btn btn-primary" type="button" disabled>Fetch</button>
    </div>

    <div class="header-actions">
      <a href="/api/docs" class="docs-link">/api/docs</a>
      <button class="btn btn-secondary btn-icon" type="button" disabled aria-label="Notifications">
        <svg
          width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </button>
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
