<script setup lang="ts">
/** Dropzone für cookies.txt — die Datei landet in /config, nie im Image. */
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const status = ref('')
const error = ref('')

async function upload(file: File | undefined): Promise<void> {
  if (!file) return

  status.value = ''
  error.value = ''
  try {
    const text = await file.text()
    const result = await $fetch<{ bytes: number; looksLikeNetscapeFormat: boolean }>(
      '/api/settings/cookies',
      { method: 'POST', body: { text } },
    )
    status.value = result.looksLikeNetscapeFormat
      ? `Saved ${file.name} (${String(result.bytes)} bytes)`
      : `Saved ${file.name} — it has no Netscape header, yt-dlp may refuse it`
  }
  catch (failure) {
    const message = (failure as { data?: { statusMessage?: string } })?.data?.statusMessage
    error.value = message || 'Could not save the cookie file'
  }
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  void upload(event.dataTransfer?.files?.[0])
}

function onPick(event: Event): void {
  void upload((event.target as HTMLInputElement).files?.[0] ?? undefined)
}
</script>

<template>
  <div class="field">
    <label>Cookies</label>
    <div
      class="dropzone"
      :class="{ 'dropzone-over': dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      Drop cookies.txt here or
      <button class="link" type="button" @click="fileInput?.click()">browse</button>
      — stored in /config, never in the image
      <input ref="fileInput" class="hidden-input" type="file" accept=".txt" @change="onPick">
    </div>
    <span v-if="status" class="hint">{{ status }}</span>
    <span v-if="error" class="error">{{ error }}</span>
  </div>
</template>

<style scoped>
.dropzone {
  padding: 18px;
  font-size: 12px;
  color: var(--color-neutral-700);
  text-align: center;
  border: 1px dashed var(--color-divider);
}
.dropzone-over { border-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 6%, transparent); }
.link {
  font: inherit;
  color: var(--color-accent);
  background: none;
  border: 0;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
}
.hidden-input { display: none; }
.hint { font-size: 11px; color: var(--color-neutral-700); }
.error { font-size: 11px; color: var(--color-accent); }
</style>
