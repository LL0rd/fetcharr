<script setup lang="ts">
import type { DraftOptions } from './add-download-options'

const draft = defineModel<DraftOptions>({ required: true })
const open = ref(false)

// Schnitt und SponsorBlock greifen nur an einem Medienstrom — bei reinen
// Untertiteln blieben die Felder wirkungslos stehen.
const mediaOptions = computed(() => draft.value.format !== 'subtitle')
</script>

<template>
  <div class="advanced">
    <button class="advanced-toggle" type="button" @click="open = !open">
      <svg
        width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="chevron" :class="{ 'chevron-open': open }"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
      {{ mediaOptions ? 'Advanced — args, output, crop, SponsorBlock, folder' : 'Advanced — args, output, folder' }}
    </button>

    <div v-if="open" class="advanced-body">
      <div class="grid-2">
        <div class="field">
          <label for="adv-args">Custom args</label>
          <input id="adv-args" v-model="draft.customArgs" class="input mono" placeholder="--embed-chapters">
        </div>
        <div class="field">
          <label for="adv-output">Output template</label>
          <input id="adv-output" v-model="draft.outputTemplate" class="input mono" placeholder="(global default)">
        </div>
      </div>

      <div :class="mediaOptions ? 'grid-3' : 'grid-1'">
        <div v-if="mediaOptions" class="field">
          <label for="adv-crop-start">Crop start</label>
          <input id="adv-crop-start" v-model="draft.cropStart" class="input" placeholder="00:00:00">
        </div>
        <div v-if="mediaOptions" class="field">
          <label for="adv-crop-end">Crop end</label>
          <input id="adv-crop-end" v-model="draft.cropEnd" class="input" placeholder="(end)">
        </div>
        <div class="field">
          <label for="adv-folder">Target folder</label>
          <input
            id="adv-folder"
            v-model="draft.targetFolder"
            class="input small"
            :placeholder="mediaOptions ? 'video' : 'subtitle'"
          >
        </div>
      </div>

      <div v-if="mediaOptions" class="field">
        <label>SponsorBlock</label>
        <SegmentedControl v-model="draft.sponsorblock" :options="['remove', 'mark', 'off']" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.advanced { border-top: 1px solid var(--color-divider); }

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 0;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  background: none;
  border: 0;
  cursor: pointer;
}
.chevron { transition: transform 0.15s; }
.chevron-open { transform: rotate(180deg); }

.advanced-body { display: flex; flex-direction: column; gap: 10px; padding-bottom: 6px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.grid-1 { display: grid; grid-template-columns: 1fr; gap: 10px; }

.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.small { font-size: 12px; }
</style>
