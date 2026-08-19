<script setup lang="ts">
import { LIBRARY_FILTERS, LIBRARY_SORTS } from './library-files'

defineProps<{ summary: string }>()

const query = defineModel<string>('query', { required: true })
const filter = defineModel<string>('filter', { required: true })
const sort = defineModel<string>('sort', { required: true })
const view = defineModel<string>('view', { required: true })
</script>

<template>
  <div class="bar">
    <h4>Library</h4>
    <span class="summary">{{ summary }}</span>

    <div class="controls">
      <input
        v-model="query"
        class="input search"
        type="search"
        placeholder="Search title or channel"
        aria-label="Search title or channel"
      >
      <SegmentedControl v-model="filter" :options="LIBRARY_FILTERS" />
      <SegmentedControl v-model="sort" :options="LIBRARY_SORTS" />

      <div class="views">
        <button
          class="view-btn"
          :class="{ 'view-on': view === 'grid' }"
          type="button"
          title="Grid"
          :aria-pressed="view === 'grid'"
          @click="view = 'grid'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        </button>
        <button
          class="view-btn"
          :class="{ 'view-on': view === 'list' }"
          type="button"
          title="List"
          :aria-pressed="view === 'list'"
          @click="view = 'list'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.bar h4 { margin: 0; }
.summary { font-size: 12px; color: var(--color-neutral-700); }
.controls { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.search { width: 200px; min-height: 32px; font-size: 12px; }

.views { display: flex; border: 1px solid var(--color-divider); }
.view-btn {
  display: flex;
  align-items: center;
  padding: 6px 9px;
  font: inherit;
  color: var(--color-text);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.view-btn + .view-btn { border-left: 1px solid var(--color-divider); }
.view-btn:hover { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
.view-on,
.view-on:hover { background: var(--color-accent); color: var(--color-bg); }
</style>
