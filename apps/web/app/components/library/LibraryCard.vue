<script setup lang="ts">
import type { LibraryFile } from './library-files'
import { fileDateLabel } from './library-files'

const props = defineProps<{ file: LibraryFile; selecting: boolean; selected: boolean }>()
const emit = defineEmits<{ favorite: []; select: []; remove: [] }>()

const meta = computed(() => {
  const parts = [props.file.uploader, fileDateLabel(props.file), formatBytes(props.file.sizeBytes)]
  return parts.filter(Boolean).join(' · ')
})

const duration = computed(() => formatDuration(props.file.durationSec) || '—:—')

// Im Auswahlmodus hakt ein Klick die Karte an, statt den Player zu öffnen —
// dafür muss der Link weichen: ein `preventDefault` hält NuxtLink nicht auf.
const link = resolveComponent('NuxtLink')
const root = computed(() => (props.selecting ? 'button' : link))
const rootProps = computed(() =>
  props.selecting ? { type: 'button' } : { to: `/watch/${props.file.uid}` },
)
</script>

<template>
  <component
    :is="root"
    v-bind="rootProps"
    class="card-link"
    :class="{ 'card-selected': selecting && selected }"
    @click="selecting && emit('select')"
  >
    <LibraryThumb :file="file">
      <span class="dur">{{ duration }}</span>
      <LibraryStar class="fav" :active="file.favorite" :readonly="selecting" @toggle="emit('favorite')" />
      <span v-if="selecting" class="check" :class="{ 'check-on': selected }" aria-hidden="true">
        <svg v-if="selected" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <button v-else class="trash" type="button" title="Delete file" @click.prevent.stop="emit('remove')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </LibraryThumb>

    <div class="lib-title">{{ file.title }}</div>
    <div class="lib-meta">{{ meta }}</div>
  </component>
</template>

<style scoped>
/* Gilt für beide Wurzeln: den Link und den Auswahl-Button. */
.card-link {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  font: inherit;
  text-align: left;
  color: inherit;
  text-decoration: none;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.card-selected { outline: 2px solid var(--color-accent); outline-offset: 3px; }

.dur {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 1px 5px;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  background: var(--color-neutral-900);
  color: var(--color-neutral-100);
}
.fav { position: absolute; top: 2px; left: 2px; }

.trash {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  color: var(--color-neutral-100);
  background: color-mix(in srgb, var(--color-neutral-900) 70%, transparent);
  opacity: 0;
  cursor: pointer;
}
.card-link:hover .trash,
.trash:focus-visible { opacity: 1; }

.check {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  background: var(--color-bg);
  border: 1px solid var(--color-neutral-700);
}
.check-on { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-bg); }

.lib-title {
  font-weight: 600;
  font-size: 12.5px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lib-meta { font-size: 11px; color: var(--color-neutral-700); }
</style>
