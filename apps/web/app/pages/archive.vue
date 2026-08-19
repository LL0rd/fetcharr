<script setup lang="ts">
import type { ArchiveEntry, ArchivePage } from '~/components/archive/archive-entries'
import { ARCHIVE_PAGE_SIZE } from '~/components/archive/archive-entries'

const search = ref('')
const entries = ref<ArchiveEntry[]>([])
const total = ref(0)
const loading = ref(false)
const message = ref('')
const error = ref('')

const deleteTarget = ref<ArchiveEntry | null>(null)
const deleting = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)

const hasMore = computed(() => entries.value.length < total.value)

const summary = computed(() => {
  const count = total.value.toLocaleString('en-US')
  return `${count} ${total.value === 1 ? 'entry' : 'entries'}`
})

const confirmBody = computed(
  () =>
    `"${deleteTarget.value?.mediaId ?? ''}" leaves the archive. The video counts as unseen again and may be downloaded once more on the next subscription check.`,
)

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void load(0), 250)
})
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

onMounted(() => void load(0))

async function load(offset: number): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const page = await $fetch<ArchivePage>('/api/archive', {
      query: { q: search.value || undefined, limit: ARCHIVE_PAGE_SIZE, offset },
    })
    entries.value = offset ? [...entries.value, ...page.entries] : page.entries
    total.value = page.total
  }
  catch {
    error.value = 'Could not load the archive.'
    if (!offset) {
      entries.value = []
      total.value = 0
    }
  }
  finally {
    loading.value = false
  }
}

function askDelete(entry: ArchiveEntry): void {
  deleteTarget.value = entry
}

async function confirmDelete(): Promise<void> {
  const entry = deleteTarget.value
  if (!entry) return

  deleting.value = true
  try {
    await $fetch(`/api/archive/${entry.id}`, { method: 'DELETE' })
    entries.value = entries.value.filter((row) => row.id !== entry.id)
    total.value = Math.max(0, total.value - 1)
    message.value = `${entry.mediaId} removed — it may be downloaded again.`
  }
  catch {
    error.value = 'Delete failed.'
  }
  finally {
    deleting.value = false
    deleteTarget.value = null
  }
}

async function onFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importing.value = true
  error.value = ''
  message.value = ''
  try {
    const body = new FormData()
    body.append('file', file)
    const result = await $fetch<{ imported: number; skipped: number }>('/api/archive/import', {
      method: 'POST',
      body,
    })
    message.value = `Imported ${result.imported} entries, skipped ${result.skipped} already known.`
    await load(0)
  }
  catch {
    error.value = 'Import failed — expected an archive.txt with "extractor id" per line.'
  }
  finally {
    importing.value = false
    input.value = ''
  }
}
</script>

<template>
  <section>
    <div class="bar">
      <h4>Archive</h4>
      <span class="summary">{{ summary }}</span>

      <div class="controls">
        <input
          v-model="search"
          class="input search"
          type="search"
          placeholder="Search id, title or extractor"
          aria-label="Search the archive"
        >
        <button
          class="btn btn-secondary bar-btn"
          type="button"
          :disabled="importing"
          @click="fileInput?.click()"
        >
          {{ importing ? 'Importing…' : 'Import archive.txt' }}
        </button>
        <a class="btn btn-secondary bar-btn" href="/api/archive/export" download>Export</a>
        <input
          ref="fileInput"
          class="hidden-file"
          type="file"
          accept=".txt,text/plain"
          @change="onFilePicked"
        >
      </div>
    </div>

    <p v-if="error" class="note note-error">{{ error }}</p>
    <p v-else-if="message" class="note">{{ message }}</p>

    <ArchiveTable :entries="entries" @remove="askDelete" />

    <p v-if="!entries.length && !loading" class="empty">
      {{ search
        ? 'No archive entry matches this search.'
        : 'The archive is empty — subscription downloads land here so they are not fetched twice.' }}
    </p>

    <div v-if="hasMore" class="more">
      <button
        class="btn btn-secondary bar-btn"
        type="button"
        :disabled="loading"
        @click="load(entries.length)"
      >
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>

    <div class="foot">
      Replaces the archive.txt files &middot; deleting an entry allows a fresh download &middot;
      export writes the yt-dlp format
    </div>

    <LibraryConfirmDialog
      v-if="deleteTarget"
      title="Remove from archive"
      :body="confirmBody"
      confirm-label="Delete"
      :busy="deleting"
      @cancel="deleteTarget = null"
      @confirm="confirmDelete"
    />
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
.summary { font-size: 12px; color: var(--color-neutral-700); }

.controls { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.search { width: 240px; font-size: 12px; padding: 5px 8px; }
.bar-btn { font-size: 12px; padding: 5px 12px; text-decoration: none; }
.hidden-file { display: none; }

.note {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 12px;
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
}
.note-error { background: var(--color-accent-100); color: var(--color-accent-800); }

.empty { padding: 18px 0; font-size: 13px; color: var(--color-neutral-700); }
.more { margin-top: 14px; }
.foot { margin-top: 14px; font-size: 11px; color: var(--color-neutral-600); }
</style>
