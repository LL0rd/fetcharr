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
      <label for="set-proxies">Proxies</label>
      <textarea
        id="set-proxies"
        v-model="props.draft.proxies"
        class="input mono proxies"
        placeholder="http://user:pass@proxy-1.example:3128&#10;socks5://10.0.0.5:1080&#10;direct"
      />
      <span class="hint">
        One per line. Jobs are spread across the list and every retry moves to the next
        entry, so a proxy that gets a 403 is not hit again for the same video. Write
        <code>direct</code> for a slot without a proxy. Used for downloads, subscription
        checks and the URL probe. Leave empty to connect directly.
      </span>
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
.proxies { min-height: 88px; }
.hint code { font-family: ui-monospace, monospace; }
.hint { font-size: 11px; color: var(--color-neutral-700); }
</style>
