<script setup lang="ts">
const props = defineProps<{ apiKey: string | null }>()
const emit = defineEmits<{ regenerated: [key: string] }>()

const busy = ref(false)
const error = ref('')

async function regenerate(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch<{ apiKey: string }>('/api/settings/api-key/regenerate', {
      method: 'POST',
    })
    emit('regenerated', result.apiKey)
  }
  catch {
    error.value = 'Could not regenerate the API key'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tab-panel">
    <div class="field">
      <label for="set-apikey">API key</label>
      <div class="key-row">
        <input
          id="set-apikey"
          class="input mono"
          :value="props.apiKey ?? ''"
          readonly
          @focus="($event.target as HTMLInputElement).select()"
        >
        <button class="btn btn-secondary" type="button" :disabled="busy" @click="regenerate">
          {{ busy ? 'Regenerating…' : 'Regenerate' }}
        </button>
      </div>
      <span class="hint">
        Regenerating invalidates the old key immediately — podcast feed URLs have to be
        re-subscribed.
      </span>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="endpoints">
      <span>GET /api/health — container healthcheck</span>
      <span>GET /metrics — Prometheus</span>
      <span>GET /api/docs — Swagger UI (OpenAPI from Zod)</span>
      <span>?apiKey=… or X-Api-Key header</span>
    </div>
  </div>
</template>

<style scoped>
.tab-panel { display: flex; flex-direction: column; gap: 14px; }
.key-row { display: flex; gap: 8px; }
.key-row .input { flex: 1; min-width: 0; }
.key-row .btn { flex: none; font-size: 12px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.hint { font-size: 11px; color: var(--color-neutral-700); }
.error { margin: 0; font-size: 12px; color: var(--color-accent); }

.endpoints {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
}
</style>
