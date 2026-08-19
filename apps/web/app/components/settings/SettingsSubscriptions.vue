<script setup lang="ts">
import type { Settings } from '@fetcharr/shared'

import SettingsToggle from './SettingsToggle.vue'
import { FORMAT_OPTIONS } from './settings-form'

const props = defineProps<{ draft: Settings }>()
</script>

<template>
  <div class="tab-panel">
    <p class="note">These are the defaults a newly added subscription starts with.</p>

    <div class="grid-2">
      <div class="field">
        <label for="set-sub-cron">Default check interval (cron)</label>
        <input id="set-sub-cron" v-model="props.draft.subs_default_cron" class="input mono">
      </div>
      <div class="field">
        <label>Default max quality</label>
        <SegmentedControl v-model="props.draft.subs_default_max_quality" :options="FORMAT_OPTIONS" />
      </div>
    </div>

    <SettingsToggle
      v-model="props.draft.subs_default_redownload_fresh_uploads"
      name="Redownload fresh uploads"
      desc="Re-fetch videos re-uploaded within 48 h in better quality"
    />
    <SettingsToggle
      v-model="props.draft.subs_default_record_livestreams"
      name="Record livestreams"
      desc="--live-from-start for subs with livestream capture enabled"
    />
  </div>
</template>

<style scoped>
.tab-panel { display: flex; flex-direction: column; gap: 14px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: end; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.note { margin: 0; font-size: 11px; color: var(--color-neutral-700); }
</style>
