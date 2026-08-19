<script setup lang="ts">
import type { Settings } from '@fetcharr/shared'

import SettingsCookies from './SettingsCookies.vue'
import { LOG_LEVEL_OPTIONS } from './settings-form'

const props = defineProps<{ draft: Settings }>()
</script>

<template>
  <div class="tab-panel">
    <div class="field">
      <label for="set-args">Global custom yt-dlp args</label>
      <textarea
        id="set-args"
        v-model="props.draft.custom_args"
        class="input mono"
        placeholder="--embed-metadata --embed-chapters"
      />
      <span class="hint">Appended to every job, before the job's own custom args.</span>
    </div>

    <div class="field">
      <label for="set-ua">Custom user agent</label>
      <input id="set-ua" v-model="props.draft.user_agent" class="input mono" placeholder="(default)">
    </div>

    <SettingsCookies />

    <div class="field">
      <label>Log level</label>
      <SegmentedControl v-model="props.draft.log_level" :options="LOG_LEVEL_OPTIONS" />
      <span class="hint">Applies to worker and web on their next restart.</span>
    </div>
  </div>
</template>

<style scoped>
.tab-panel { display: flex; flex-direction: column; gap: 14px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.hint { font-size: 11px; color: var(--color-neutral-700); }
</style>
