<script setup lang="ts">
import type { LibraryFile } from './library-files'
import { thumbLabel, thumbnailUrl } from './library-files'

const props = defineProps<{ file: LibraryFile; label?: boolean }>()

// Ohne Thumbnail antwortet `/api/thumbnail/:uid` mit 404 — dann bleibt der
// schraffierte Platzhalter stehen.
const broken = ref(false)
watch(() => props.file.uid, () => {
  broken.value = false
})
</script>

<template>
  <div class="thumb">
    <img v-if="!broken" :src="thumbnailUrl(file)" alt="" loading="lazy" @error="broken = true">
    <span v-else-if="label !== false" class="thumb-label">{{ thumbLabel(file) }}</span>
    <slot />
  </div>
</template>

<style scoped>
.thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: repeating-linear-gradient(
    45deg,
    var(--color-neutral-200),
    var(--color-neutral-200) 6px,
    var(--color-neutral-300) 6px,
    var(--color-neutral-300) 12px
  );
}
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.thumb-label { font-family: ui-monospace, monospace; font-size: 10px; color: var(--color-neutral-600); }
</style>
