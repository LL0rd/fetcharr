<script setup lang="ts">
import type { LibraryFile, LibraryFilter, LibraryPage, LibrarySort } from '~/components/library/library-files'
import { LIBRARY_PAGE_SIZE, filterQuery, sortQuery } from '~/components/library/library-files'

const view = ref('grid')
const filter = ref('All')
const sort = ref('Date')
const search = ref('')

const files = ref<LibraryFile[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')

const selecting = ref(false)
const selected = ref(new Set<string>())
const zipping = ref(false)

const deleteTarget = ref<LibraryFile | null>(null)
const bulkDelete = ref(false)
const deleting = ref(false)

// Die Größe zählt nur die geladenen Zeilen — mehr weiß die Liste nicht.
const loadedBytes = computed(() =>
  formatBytes(files.value.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0)),
)

const summary = computed(() => {
  const counts = `${files.value.length} of ${total.value.toLocaleString('en-US')} items`
  return files.value.length ? `${counts} · ${loadedBytes.value}` : counts
})

const filtered = computed(() => filter.value !== 'All' || search.value.length > 0)

const hasMore = computed(() => files.value.length < total.value)

// Tippen soll nicht bei jedem Anschlag eine Anfrage auslösen.
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void reload(), 250)
})
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

watch([filter, sort], () => void reload())
onMounted(() => void reload())

async function reload(): Promise<void> {
  await load(0)
}

async function load(offset: number): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const result = await $fetch<LibraryPage>('/api/files', {
      query: {
        q: search.value || undefined,
        ...sortQuery(sort.value as LibrarySort),
        ...filterQuery(filter.value as LibraryFilter),
        limit: LIBRARY_PAGE_SIZE,
        offset,
      },
    })
    files.value = offset ? [...files.value, ...result.files] : result.files
    total.value = result.total ?? files.value.length
  }
  catch {
    loadError.value = 'Could not load the library — is the files API up yet?'
    if (!offset) {
      files.value = []
      total.value = 0
    }
  }
  finally {
    loading.value = false
  }
}

async function loadMore(): Promise<void> {
  await load(files.value.length)
}

function toggleSelecting(): void {
  selecting.value = !selecting.value
  selected.value = new Set()
}

function toggleSelected(uid: string): void {
  const next = new Set(selected.value)
  if (!next.delete(uid)) next.add(uid)
  selected.value = next
}

/** Der Stern schaltet sofort um; scheitert der Aufruf, springt er zurück. */
async function toggleFavorite(file: LibraryFile): Promise<void> {
  const wanted = !file.favorite
  file.favorite = wanted
  try {
    await $fetch(`/api/files/${file.uid}/favorite`, {
      method: 'POST',
      body: { favorite: wanted },
    })
    if (filter.value === 'Favs' && !wanted) {
      files.value = files.value.filter((entry) => entry.uid !== file.uid)
      total.value = Math.max(0, total.value - 1)
    }
  }
  catch {
    file.favorite = !wanted
  }
}

/** Der Server benennt das Archiv nach der Anzahl der Dateien. */
function zipName(disposition: string | null): string {
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? 'fetcharr-files.zip'
}

async function downloadZip(): Promise<void> {
  const uids = [...selected.value]
  if (!uids.length) return

  zipping.value = true
  try {
    const response = await $fetch.raw<Blob>('/api/files/zip', {
      method: 'POST',
      body: { uids },
      responseType: 'blob',
    })
    const href = URL.createObjectURL(response._data as Blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = zipName(response.headers.get('content-disposition'))
    anchor.click()
    URL.revokeObjectURL(href)
  }
  catch {
    loadError.value = 'ZIP download failed'
  }
  finally {
    zipping.value = false
  }
}

const confirmBody = computed(() => {
  if (bulkDelete.value) {
    const count = selected.value.size
    return `${count} ${count === 1 ? 'file' : 'files'} and the matching sidecars will be removed from disk and from the database. This cannot be undone.`
  }
  return `"${deleteTarget.value?.title ?? ''}" and its sidecars will be removed from disk and from the database. This cannot be undone.`
})

function askDelete(file: LibraryFile): void {
  bulkDelete.value = false
  deleteTarget.value = file
}

function askDeleteSelected(): void {
  if (!selected.value.size) return
  bulkDelete.value = true
  deleteTarget.value = null
}

function closeConfirm(): void {
  deleteTarget.value = null
  bulkDelete.value = false
}

async function confirmDelete(): Promise<void> {
  const uids = bulkDelete.value ? [...selected.value] : [deleteTarget.value!.uid]

  deleting.value = true
  try {
    await Promise.all(uids.map((uid) => $fetch(`/api/files/${uid}`, { method: 'DELETE' })))
    const gone = new Set(uids)
    files.value = files.value.filter((file) => !gone.has(file.uid))
    total.value = Math.max(0, total.value - uids.length)
    selected.value = new Set()
  }
  catch {
    loadError.value = 'Delete failed'
  }
  finally {
    deleting.value = false
    closeConfirm()
  }
}
</script>

<template>
  <section>
    <LibraryToolbar
      v-model:query="search"
      v-model:filter="filter"
      v-model:sort="sort"
      v-model:view="view"
      :summary="summary"
    />

    <div class="select-bar">
      <button class="btn btn-secondary bar-btn" type="button" @click="toggleSelecting">
        {{ selecting ? 'Cancel selection' : 'Select' }}
      </button>
      <template v-if="selecting">
        <span class="select-count">{{ selected.size }} selected</span>
        <button
          class="btn btn-primary bar-btn"
          type="button"
          :disabled="!selected.size || zipping"
          @click="downloadZip"
        >
          {{ zipping ? 'Packing…' : 'Download ZIP' }}
        </button>
        <button
          class="btn btn-secondary bar-btn"
          type="button"
          :disabled="!selected.size"
          @click="askDeleteSelected"
        >
          Delete selected
        </button>
      </template>
    </div>

    <p v-if="loadError" class="lib-error">{{ loadError }}</p>

    <div v-if="view === 'grid'" class="grid">
      <LibraryCard
        v-for="file in files"
        :key="file.uid"
        :file="file"
        :selecting="selecting"
        :selected="selected.has(file.uid)"
        @favorite="toggleFavorite(file)"
        @select="toggleSelected(file.uid)"
        @remove="askDelete(file)"
      />
    </div>

    <div v-else class="list">
      <LibraryRow
        v-for="file in files"
        :key="file.uid"
        :file="file"
        :selecting="selecting"
        :selected="selected.has(file.uid)"
        @favorite="toggleFavorite(file)"
        @select="toggleSelected(file.uid)"
        @remove="askDelete(file)"
      />
    </div>

    <p v-if="!files.length && !loading" class="lib-empty">
      {{ filtered
        ? 'No file matches this search.'
        : 'Nothing here yet — finished downloads show up in the library.' }}
    </p>

    <div v-if="hasMore" class="more">
      <button class="btn btn-secondary bar-btn" type="button" :disabled="loading" @click="loadMore">
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>

    <div class="lib-foot">
      /downloads/video/&lt;channel&gt;/ · NFO + thumbnails written for Jellyfin/Plex · select multiple
      for ZIP download
    </div>

    <LibraryConfirmDialog
      v-if="deleteTarget || bulkDelete"
      title="Delete from library"
      :body="confirmBody"
      confirm-label="Delete"
      :busy="deleting"
      @cancel="closeConfirm"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped>
.select-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.select-count { font-size: 12px; color: var(--color-neutral-700); }
.bar-btn { font-size: 12px; padding: 5px 12px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
.list { border-top: 2px solid var(--color-divider); }

.lib-error {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--color-accent-100);
  color: var(--color-accent-800);
}
.lib-empty { padding: 18px 0; font-size: 13px; color: var(--color-neutral-700); }
.more { margin-top: 14px; }
.lib-foot { margin-top: 14px; font-size: 11px; color: var(--color-neutral-600); }
</style>
