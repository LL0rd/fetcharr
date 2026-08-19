<script setup lang="ts">
import type { StorageResponse } from '~/components/storage/storage'
import { STORAGE_TABS, tabGrouping } from '~/components/storage/storage'

const EMPTY: StorageResponse['totals'] = {
  usedBytes: 0,
  freeBytes: null,
  files: 0,
  librarySizeBytes: 0,
  bytesToday: 0,
}

const tab = ref<string>('By channel')
const data = ref<StorageResponse | null>(null)
const loading = ref(false)
const error = ref('')

const totals = computed(() => data.value?.totals ?? EMPTY)
const rows = computed(() => data.value?.rows ?? [])

const emptyLabel = computed(() =>
  tab.value === 'By subscription'
    ? 'No downloads are assigned to a subscription yet.'
    : 'Nothing downloaded yet — the first file shows up here.',
)

watch(tab, () => void load())
onMounted(() => void load())

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    data.value = await $fetch<StorageResponse>('/api/storage', {
      query: { by: tabGrouping(tab.value) },
    })
  }
  catch {
    error.value = 'Could not read the storage numbers.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <section>
    <div class="bar">
      <h4>Storage</h4>
      <SegmentedControl v-model="tab" class="tabs" :options="STORAGE_TABS" />
    </div>

    <p v-if="error" class="note note-error">{{ error }}</p>

    <StorageStats :totals="totals" />

    <StorageBars v-if="rows.length" :rows="rows" />
    <p v-else-if="!loading" class="empty">{{ emptyLabel }}</p>

    <div class="foot">
      Also exported at /metrics (Prometheus): queue length, success/error counters,
      bytes downloaded, per-subscription storage
    </div>
  </section>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.bar h4 { margin: 0; }
.tabs { margin-left: auto; }

.note {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 12px;
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
}
.note-error { background: var(--color-accent-100); color: var(--color-accent-800); }

.empty { padding: 18px 0; font-size: 13px; color: var(--color-neutral-700); }
.foot { margin-top: 14px; font-size: 11px; color: var(--color-neutral-600); }
</style>
