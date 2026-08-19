<script setup lang="ts">
import type { LibraryFile } from './library-files'
import { fileDateLabel } from './library-files'

const props = defineProps<{ file: LibraryFile; selecting: boolean; selected: boolean }>()
const emit = defineEmits<{ favorite: []; select: []; remove: [] }>()

const duration = computed(() => formatDuration(props.file.durationSec) || '—')

// Im Auswahlmodus wird aus der Zeile ein Button — ein `preventDefault` auf dem
// Link würde die Navigation nicht verhindern.
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
    class="row"
    :class="{ 'row-selecting': selecting, 'row-selected': selecting && selected }"
    @click="selecting && emit('select')"
  >
    <span v-if="selecting" class="check" :class="{ 'check-on': selected }" aria-hidden="true">
      <svg v-if="selected" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>

    <LibraryThumb :file="file" :label="false" />

    <div class="row-text">
      <div class="row-title">{{ file.title }}</div>
      <div class="row-sub">{{ file.uploader || '—' }}</div>
    </div>

    <span class="type" :class="file.type === 'audio' ? 'type-audio' : 'type-video'">{{ file.type }}</span>
    <span class="mono">{{ duration }}</span>
    <span class="mono">{{ formatBytes(file.sizeBytes) }}</span>
    <span class="row-date">{{ fileDateLabel(file) }}</span>

    <span class="row-actions">
      <LibraryStar :active="file.favorite" :readonly="selecting" @toggle="emit('favorite')" />
      <button v-if="!selecting" class="trash" type="button" title="Delete file" @click.prevent.stop="emit('remove')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </span>
  </component>
</template>

<style scoped>
/* Gilt für beide Wurzeln: den Link und den Auswahl-Button. */
.row {
  display: grid;
  width: 100%;
  grid-template-columns: 76px 1fr 90px 70px 80px 90px 56px;
  gap: 12px;
  align-items: center;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  text-align: left;
  color: inherit;
  text-decoration: none;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--color-divider);
  cursor: pointer;
}
.row:hover { background: color-mix(in srgb, var(--color-text) 4%, transparent); }
.row-selecting { grid-template-columns: 20px 76px 1fr 90px 70px 80px 90px 56px; }
.row-selected { background: color-mix(in srgb, var(--color-accent) 8%, transparent); }

.check {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-neutral-700);
}
.check-on { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-bg); }

.row-text { min-width: 0; }
.row-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-sub { font-size: 11px; color: var(--color-neutral-700); }

.type {
  justify-self: start;
  padding: 2px 8px;
  font-size: 10px;
}
.type-audio { background: var(--color-accent-100); color: var(--color-accent-800); }
.type-video { background: var(--color-neutral-200); color: var(--color-neutral-800); }

.mono { font-family: ui-monospace, monospace; font-size: 11px; }
.row-date { font-size: 11px; color: var(--color-neutral-700); }

.row-actions { display: flex; align-items: center; gap: 2px; justify-self: end; }
.trash {
  display: grid;
  place-items: center;
  padding: 2px;
  border: 0;
  background: transparent;
  color: var(--color-neutral-600);
  cursor: pointer;
  opacity: 0;
}
.row:hover .trash,
.trash:focus-visible { opacity: 1; }
.trash:hover { color: var(--color-accent); }
</style>
