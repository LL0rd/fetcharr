<script setup lang="ts">
import type { Settings } from '@fetcharr/shared'

import { FORMAT_OPTIONS, SPONSORBLOCK_OPTIONS } from './settings-form'

// Der Entwurf ist ein reaktives Objekt der Seite; die Tabs schreiben direkt
// hinein, damit „Save changes" oben genau einen Stand kennt.
const props = defineProps<{ draft: Settings }>()
</script>

<template>
  <div class="tab-panel">
    <div class="field">
      <label for="set-template">Default output template</label>
      <input id="set-template" v-model="props.draft.output_template" class="input mono">
      <span class="hint">Relative to /downloads — the media type folder is added in front.</span>
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="set-parallel">Max parallel downloads</label>
        <input
          id="set-parallel"
          v-model.number="props.draft.max_concurrent_downloads"
          class="input"
          type="number"
          min="1"
          max="20"
        >
      </div>
      <div class="field">
        <label for="set-rate">Rate limit</label>
        <input id="set-rate" v-model="props.draft.rate_limit" class="input" placeholder="10M">
        <span class="hint">Empty means no limit.</span>
      </div>
    </div>

    <div class="field">
      <label>Default format</label>
      <SegmentedControl v-model="props.draft.default_format" :options="FORMAT_OPTIONS" />
    </div>

    <div class="field">
      <label>SponsorBlock default</label>
      <SegmentedControl v-model="props.draft.default_sponsorblock" :options="SPONSORBLOCK_OPTIONS" />
    </div>
  </div>
</template>

<style scoped>
.tab-panel { display: flex; flex-direction: column; gap: 14px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.hint { font-size: 11px; color: var(--color-neutral-700); }
</style>
