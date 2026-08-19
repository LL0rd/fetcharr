<script setup lang="ts">
import type { Settings } from '@fetcharr/shared'

import { NOTIFY_TYPE_OPTIONS, toggleNotifyType } from './settings-form'

const props = defineProps<{ draft: Settings }>()

function isOn(key: string): boolean {
  return props.draft.notify_types.includes(key as Settings['notify_types'][number])
}

function setType(key: string, on: boolean): void {
  props.draft.notify_types = toggleNotifyType(
    props.draft.notify_types,
    key,
    on,
  ) as Settings['notify_types']
}
</script>

<template>
  <div class="tab-panel">
    <p class="note">
      In-app notifications are always kept; the channels below get a copy of the events you tick.
    </p>

    <div class="field">
      <label for="set-ntfy">ntfy topic URL</label>
      <input
        id="set-ntfy"
        v-model="props.draft.ntfy_url"
        class="input mono"
        placeholder="https://ntfy.sh/my-fetcharr"
      >
    </div>

    <div class="grid-2">
      <div class="field">
        <label for="set-gotify">Gotify URL</label>
        <input
          id="set-gotify"
          v-model="props.draft.gotify_url"
          class="input mono"
          placeholder="https://gotify.example.com"
        >
      </div>
      <div class="field">
        <label for="set-gotify-token">Gotify app token</label>
        <input id="set-gotify-token" v-model="props.draft.gotify_token" class="input mono">
      </div>
    </div>

    <div class="field">
      <label for="set-discord">Discord webhook URL</label>
      <input
        id="set-discord"
        v-model="props.draft.discord_webhook_url"
        class="input mono"
        placeholder="https://discord.com/api/webhooks/…"
      >
    </div>

    <div class="field">
      <label for="set-webhook">Generic webhook URL</label>
      <input id="set-webhook" v-model="props.draft.webhook_url" class="input mono">
      <span class="hint">Receives the event as a JSON POST body.</span>
    </div>

    <div class="field">
      <label>Notify on</label>
      <div class="types">
        <label v-for="option in NOTIFY_TYPE_OPTIONS" :key="option.key" class="type-row">
          <input
            type="checkbox"
            :checked="isOn(option.key)"
            @change="setType(option.key, ($event.target as HTMLInputElement).checked)"
          >
          <span>
            <span class="type-name">{{ option.label }}</span>
            <span class="type-desc">{{ option.desc }}</span>
          </span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-panel { display: flex; flex-direction: column; gap: 14px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.hint { font-size: 11px; color: var(--color-neutral-700); }
.note { margin: 0; font-size: 11px; color: var(--color-neutral-700); }

.types { display: flex; flex-direction: column; }
.type-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--color-divider);
  cursor: pointer;
}
.type-row input { margin-top: 2px; accent-color: var(--color-accent); }
.type-name { display: block; font-weight: 600; }
.type-desc { display: block; font-size: 11px; color: var(--color-neutral-700); }
</style>
