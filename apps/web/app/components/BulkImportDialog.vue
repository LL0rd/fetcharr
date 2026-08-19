<script setup lang="ts">
import { parseBulkUrls } from './bulk-import'

const emit = defineEmits<{ close: []; added: [] }>()

const text = ref('')
const format = ref('best')
const submitting = ref(false)
const error = ref('')
const result = ref<{ created: number; skipped: string[] } | null>(null)

/** Der Zähler zeigt, was tatsächlich gesendet wird — Leerzeilen zählen nicht mit. */
const urls = computed(() => parseBulkUrls(text.value))

interface BulkResponse {
  created: number
  skipped: string[]
}

async function submit(): Promise<void> {
  if (!urls.value.length || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    result.value = await $fetch<BulkResponse>('/api/jobs/bulk', {
      method: 'POST',
      body: {
        urls: urls.value,
        type: format.value === 'audio' ? 'audio' : 'video',
        options: { format: format.value, sponsorblock: 'off' },
      },
    })
    emit('added')
  }
  catch (failure) {
    const http = failure as { statusMessage?: string; data?: { statusMessage?: string } }
    error.value = http?.data?.statusMessage || http?.statusMessage || 'Could not queue these urls'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="dialog-backdrop bulk-backdrop" @click="emit('close')">
    <div class="dialog bulk-dialog" role="dialog" aria-modal="true" @click.stop>
      <div class="bulk-head">
        <span class="dialog-title">Bulk import</span>
        <span class="tag tag-accent bulk-count">{{ urls.length }} urls</span>
      </div>

      <template v-if="!result">
        <div class="field">
          <label for="bulk-urls">One url per line</label>
          <textarea
            id="bulk-urls"
            v-model="text"
            class="input bulk-input"
            rows="10"
            placeholder="https://youtu.be/…"
          />
        </div>

        <div class="field">
          <label>Format</label>
          <SegmentedControl v-model="format" :options="['best', '1080p', '720p', 'audio']" />
        </div>

        <p class="bulk-hint">Bulk downloads queue behind everything you add by hand.</p>
        <p v-if="error" class="bulk-error">{{ error }}</p>

        <div class="dialog-actions">
          <button class="btn btn-secondary" type="button" @click="emit('close')">Cancel</button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="submitting || !urls.length"
            @click="submit"
          >
            {{ submitting ? 'Queueing…' : `Queue ${urls.length}` }}
          </button>
        </div>
      </template>

      <template v-else>
        <p class="bulk-summary">
          Queued {{ result.created }} {{ result.created === 1 ? 'download' : 'downloads' }}.
        </p>
        <template v-if="result.skipped.length">
          <p class="bulk-hint">Skipped {{ result.skipped.length }} line(s) that were not http urls:</p>
          <ul class="bulk-skipped">
            <li v-for="url in result.skipped.slice(0, 10)" :key="url">{{ url }}</li>
          </ul>
        </template>

        <div class="dialog-actions">
          <button class="btn btn-primary" type="button" @click="emit('close')">Done</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bulk-backdrop { z-index: 100; }
.bulk-dialog { width: min(560px, 100%); max-width: min(560px, 100%); gap: 14px; }

.bulk-head { display: flex; align-items: baseline; gap: 10px; }
.bulk-count { font-size: 10px; }

.bulk-input {
  width: 100%;
  resize: vertical;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.bulk-hint { margin: 0; font-size: 12px; color: var(--color-neutral-700); }
.bulk-summary { margin: 0; font-size: 14px; font-weight: 600; }

.bulk-error {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--color-accent-100);
  color: var(--color-accent-800);
}

.bulk-skipped {
  margin: 0;
  padding-left: 18px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--color-neutral-700);
  max-height: 160px;
  overflow: auto;
}
</style>
