<script setup lang="ts">
import type { ArchiveEntry } from './archive-entries'
import { formatArchiveDate } from './archive-entries'

defineProps<{ entries: ArchiveEntry[] }>()
const emit = defineEmits<{ remove: [entry: ArchiveEntry] }>()
</script>

<template>
  <div class="table">
    <div class="head row">
      <span>Extractor</span>
      <span>Media ID</span>
      <span>Title</span>
      <span>Subscription</span>
      <span>Archived</span>
      <span />
    </div>

    <div v-for="entry in entries" :key="entry.id" class="row line">
      <span class="extractor">{{ entry.extractor }}</span>
      <span class="mono">{{ entry.mediaId }}</span>
      <span class="title" :title="entry.title ?? ''">{{ entry.title ?? '—' }}</span>
      <span class="sub">{{ entry.subName ?? '—' }}</span>
      <span class="date">{{ formatArchiveDate(entry.createdAt) }}</span>
      <div class="actions">
        <button class="btn btn-ghost row-btn" type="button" @click="emit('remove', entry)">
          Delete
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table { border-top: 2px solid var(--color-divider); }

.row {
  display: grid;
  grid-template-columns: 110px 190px 1fr 150px 110px 80px;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
}

.head {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
  border-bottom: 2px solid var(--color-divider);
}

.line {
  font-size: 13px;
  border-bottom: 1px solid var(--color-divider);
}
.line:hover { background: color-mix(in srgb, var(--color-text) 4%, transparent); }

.extractor { font-size: 11px; }
.mono { font-family: ui-monospace, monospace; font-size: 11px; }
.title,
.sub {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub { font-size: 11px; color: var(--color-neutral-700); }
.date { font-size: 11px; color: var(--color-neutral-700); }

.actions { display: flex; justify-content: flex-end; }
.row-btn { font-size: 11px; padding: 4px 10px; }
</style>
