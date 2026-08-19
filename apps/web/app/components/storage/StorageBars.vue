<script setup lang="ts">
import type { StorageRow } from './storage'
import { barWidth, fileCount, storageSize } from './storage'

const props = defineProps<{ rows: StorageRow[] }>()

function width(row: StorageRow): string {
  return barWidth(row, props.rows)
}
</script>

<template>
  <div class="bars">
    <div v-for="row in rows" :key="row.key || row.name" class="bar-row">
      <span class="bar-name" :title="row.name">{{ row.name }}</span>
      <div class="bar-track">
        <div class="bar-fill" :style="{ width: width(row) }" />
      </div>
      <span class="bar-size">{{ storageSize(row.sizeBytes) }}</span>
      <span class="bar-files">{{ fileCount(row.files) }} files</span>
    </div>
  </div>
</template>

<style scoped>
.bars {
  display: flex;
  flex-direction: column;
  border-top: 2px solid var(--color-divider);
}

.bar-row {
  display: grid;
  grid-template-columns: 220px 1fr 90px 70px;
  gap: 14px;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid var(--color-divider);
  font-size: 13px;
}

.bar-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-track { height: 14px; background: var(--color-neutral-200); }
.bar-fill { height: 14px; background: var(--color-accent); }

.bar-size {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  text-align: right;
}
.bar-files { font-size: 11px; color: var(--color-neutral-700); text-align: right; }

@media (max-width: 720px) {
  .bar-row { grid-template-columns: 1fr 70px 60px; gap: 8px; }
  .bar-name { grid-column: 1 / -1; }
  .bar-track { grid-column: 1; }
}
</style>
