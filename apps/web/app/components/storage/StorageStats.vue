<script setup lang="ts">
import type { StorageResponse } from './storage'
import { fileCount, storageSize } from './storage'

const props = defineProps<{ totals: StorageResponse['totals'] }>()

const tiles = computed(() => [
  { label: 'Used', value: storageSize(props.totals.usedBytes) },
  { label: 'Free', value: storageSize(props.totals.freeBytes) },
  { label: 'Files', value: fileCount(props.totals.files) },
  { label: 'Bytes today', value: storageSize(props.totals.bytesToday) },
])
</script>

<template>
  <div class="tiles">
    <div v-for="tile in tiles" :key="tile.label" class="tile">
      <div class="tile-label">{{ tile.label }}</div>
      <div class="tile-value">{{ tile.value }}</div>
    </div>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 2px solid var(--color-divider);
  border-width: 2px 0;
  margin-bottom: 20px;
}

.tile { padding: 14px 12px; }
.tile + .tile { border-left: 1px solid var(--color-divider); }

.tile-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
}
.tile-value {
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: 26px;
}

@media (max-width: 720px) {
  .tiles { grid-template-columns: repeat(2, 1fr); }
  .tile:nth-child(odd) { border-left: 0; }
  .tile:nth-child(n + 3) { border-top: 1px solid var(--color-divider); }
}
</style>
