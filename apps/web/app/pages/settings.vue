<script setup lang="ts">
import type { Settings } from '@fetcharr/shared'

import type { SettingsResponse, SettingsTab } from '~/components/settings/settings-form'
import { SETTINGS_TABS, diffSettings } from '~/components/settings/settings-form'
// Explizit importiert: der Verzeichnis-Präfix der Auto-Imports („Settings")
// würde die Komponenten sonst SettingsSettingsDownloader nennen.
import SettingsAdvanced from '~/components/settings/SettingsAdvanced.vue'
import SettingsApi from '~/components/settings/SettingsApi.vue'
import SettingsDownloader from '~/components/settings/SettingsDownloader.vue'
import SettingsExtra from '~/components/settings/SettingsExtra.vue'
import SettingsNotifications from '~/components/settings/SettingsNotifications.vue'
import SettingsSubscriptions from '~/components/settings/SettingsSubscriptions.vue'

const tab = ref<SettingsTab>('Downloader')

/** `saved` ist der zuletzt bestätigte Stand, `draft` das Formular darüber. */
const saved = ref<Settings | null>(null)
const draft = ref<Settings | null>(null)
const apiKey = ref<string | null>(null)

const loadError = ref('')
const saveError = ref('')
const savedNote = ref('')
const saving = ref(false)

const dirty = computed(() =>
  Boolean(saved.value && draft.value && Object.keys(diffSettings(saved.value, draft.value)).length),
)

onMounted(() => void load())

async function load(): Promise<void> {
  loadError.value = ''
  try {
    const result = await $fetch<SettingsResponse>('/api/settings')
    saved.value = result.settings
    draft.value = structuredClone(result.settings)
    apiKey.value = result.apiKey
  }
  catch {
    loadError.value = 'Could not load the settings — is the API up yet?'
  }
}

async function save(): Promise<void> {
  if (!saved.value || !draft.value) return

  const patch = diffSettings(saved.value, draft.value)
  if (!Object.keys(patch).length) return

  saving.value = true
  saveError.value = ''
  savedNote.value = ''
  try {
    const result = await $fetch<{ settings: Settings }>('/api/settings', {
      method: 'PUT',
      body: patch,
    })
    saved.value = result.settings
    draft.value = structuredClone(result.settings)
    savedNote.value = 'Saved'
  }
  catch (error) {
    const message = (error as { data?: { statusMessage?: string } })?.data?.statusMessage
    saveError.value = message || 'Could not save the settings'
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <section>
    <div class="set-head">
      <h4 class="set-title">Settings</h4>
      <span v-if="savedNote && !dirty" class="set-note">{{ savedNote }}</span>
      <span v-else-if="dirty" class="set-note">Unsaved changes</span>
      <button
        class="btn btn-primary set-save"
        type="button"
        :disabled="!dirty || saving"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Save changes' }}
      </button>
    </div>

    <p v-if="loadError" class="set-error">{{ loadError }}</p>
    <p v-if="saveError" class="set-error">{{ saveError }}</p>

    <div v-if="draft" class="set-body">
      <div class="set-tabs">
        <button
          v-for="name in SETTINGS_TABS"
          :key="name"
          class="set-tab"
          :class="{ 'set-tab-on': tab === name }"
          type="button"
          @click="tab = name"
        >
          {{ name }}
        </button>
      </div>

      <div class="set-panel">
        <SettingsDownloader v-if="tab === 'Downloader'" :draft="draft" />
        <SettingsExtra v-else-if="tab === 'Extra'" :draft="draft" />
        <SettingsApi
          v-else-if="tab === 'API'"
          :api-key="apiKey"
          @regenerated="apiKey = $event"
        />
        <SettingsSubscriptions v-else-if="tab === 'Subscriptions'" :draft="draft" />
        <SettingsNotifications v-else-if="tab === 'Notifications'" :draft="draft" />
        <SettingsAdvanced v-else :draft="draft" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.set-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.set-title { margin: 0; }
.set-note { font-size: 12px; color: var(--color-neutral-700); }
.set-save { margin-left: auto; font-size: 12px; padding: 6px 14px; }
.set-error { margin: 0 0 12px; font-size: 12px; color: var(--color-accent); }

.set-body { display: flex; gap: 24px; align-items: flex-start; }

.set-tabs {
  width: 160px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-top: 2px solid var(--color-divider);
}
.set-tab {
  padding: 9px 12px;
  font: inherit;
  font-size: 13px;
  text-align: left;
  color: var(--color-text);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--color-divider);
  cursor: pointer;
}
.set-tab:hover { background: color-mix(in srgb, var(--color-text) 5%, transparent); }
.set-tab-on { background: var(--color-surface); font-weight: 600; color: var(--color-accent); }

.set-panel { flex: 1; max-width: 640px; }
</style>
