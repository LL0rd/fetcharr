<script setup lang="ts">
const navItems = [
  { label: 'Queue', to: '/' },
  { label: 'Library', to: '/library' },
  { label: 'Subscriptions', to: '/subscriptions' },
  { label: 'Archive', to: '/archive' },
  { label: 'Tasks', to: '/tasks' },
  { label: 'Storage', to: '/storage' },
  { label: 'Settings', to: '/settings' },
]

const appVersion = '0.1.0'
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-row">
        <span class="brand-mark" />
        <span class="brand-name">FETCHARR</span>
      </div>
      <div class="brand-sub">yt-dlp media downloader</div>
    </div>

    <nav class="side-nav">
      <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" class="side-nav-item">
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="side-foot">
      <div class="side-version">fetcharr v{{ appVersion }}</div>
      <a href="#" class="side-signout">Sign out</a>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 192px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-right: 2px solid var(--color-divider);
}

.brand {
  padding: 14px 14px 12px;
  border-bottom: 2px solid var(--color-divider);
}
.brand-row { display: flex; align-items: center; gap: 8px; }
.brand-mark { width: 11px; height: 11px; background: var(--color-accent); }
.brand-name {
  font-family: var(--font-heading);
  font-weight: var(--font-heading-weight);
  font-size: 16px;
}
.brand-sub { font-size: 10px; color: var(--color-neutral-600); margin-top: 2px; }

.side-nav { display: flex; flex-direction: column; padding: 10px 0; flex: 1; }
.side-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  font-size: 13.5px;
  color: var(--color-text);
  text-decoration: none;
  border-left: 3px solid transparent;
}
.side-nav-item:hover { background: color-mix(in srgb, var(--color-text) 5%, transparent); }
.side-nav-item.router-link-exact-active {
  font-weight: 600;
  color: var(--color-accent);
  border-left-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 6%, transparent);
}

.side-foot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-top: 1px solid var(--color-divider);
}
.side-version {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: var(--color-neutral-600);
}
.side-signout {
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
  color: var(--color-neutral-700);
}
</style>
