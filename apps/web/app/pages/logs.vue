<script setup lang="ts">
import { localLabel } from '~/components/tasks/tasks'

interface LogEntry {
  ts: string
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  msg: string
  [field: string]: unknown
}

const LEVELS = ['all', 'debug', 'info', 'warn', 'error'] as const
const BASE_FIELDS = new Set(['ts', 'level', 'source', 'msg'])

const entries = ref<LogEntry[]>([])
const file = ref('')
const level = ref<string>('all')
const limit = ref(200)
const loading = ref(false)
const loadError = ref('')

onMounted(() => void load())
watch(level, () => void load())

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const result = await $fetch<{ entries: LogEntry[]; file: string }>('/api/logs', {
      query: { limit: limit.value, ...(level.value === 'all' ? {} : { level: level.value }) },
    })
    entries.value = result.entries
    file.value = result.file
  }
  catch {
    loadError.value = 'Could not read the log file'
  }
  finally {
    loading.value = false
  }
}

/** Alles jenseits der Standardfelder gehört an die Zeile — kompakt als key=value. */
function extras(entry: LogEntry): string {
  return Object.entries(entry)
    .filter(([key]) => !BASE_FIELDS.has(key))
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ')
}
</script>

<template>
  <section>
    <div class="logs-head">
      <h4 class="logs-title">Logs</h4>
      <span class="logs-file">{{ file }}</span>
      <div class="logs-controls">
        <SegmentedControl v-model="level" :options="LEVELS" />
        <button class="btn btn-secondary logs-refresh" type="button" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <p v-if="loadError" class="logs-error">{{ loadError }}</p>

    <div class="logs-view">
      <p v-if="!entries.length && !loading" class="logs-empty">
        Nothing logged yet at this level.
      </p>
      <div v-for="(entry, index) in entries" :key="index" class="logs-line" :class="`logs-${entry.level}`">
        <span class="logs-time">{{ localLabel(entry.ts) }}</span>
        <span class="logs-level">{{ entry.level }}</span>
        <span class="logs-source">{{ entry.source }}</span>
        <span class="logs-msg">{{ entry.msg }}<span v-if="extras(entry)" class="logs-extra"> {{ extras(entry) }}</span></span>
      </div>
    </div>

    <div class="logs-foot">
      Worker and web write JSON lines; the file rotates onto .1 at 10 MB. The level shown here is
      a minimum — “warn” includes errors.
    </div>
  </section>
</template>

<style scoped>
.logs-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.logs-title { margin: 0; }
.logs-file { font-family: ui-monospace, monospace; font-size: 11px; color: var(--color-neutral-600); }
.logs-controls { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.logs-refresh { font-size: 12px; padding: 5px 12px; }
.logs-error { margin: 0 0 12px; font-size: 12px; color: var(--color-accent); }

.logs-view {
  border: 1px solid var(--color-divider);
  background: var(--color-surface);
  max-height: calc(100vh - 240px);
  overflow: auto;
}
.logs-empty { margin: 0; padding: 14px; font-size: 12px; color: var(--color-neutral-700); }

.logs-line {
  display: grid;
  grid-template-columns: 130px 52px 60px 1fr;
  gap: 10px;
  padding: 3px 10px;
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
  line-height: 1.5;
  border-bottom: 1px solid color-mix(in srgb, var(--color-divider) 50%, transparent);
}
.logs-time, .logs-source { color: var(--color-neutral-600); }
.logs-level { text-transform: uppercase; font-weight: 600; color: var(--color-neutral-700); }
.logs-msg { white-space: pre-wrap; word-break: break-word; }
.logs-extra { color: var(--color-neutral-600); }
.logs-warn .logs-level { color: var(--color-accent-800); }
.logs-error .logs-level, .logs-error .logs-msg { color: var(--color-accent); }

.logs-foot { margin-top: 14px; font-size: 11px; color: var(--color-neutral-600); }
</style>
