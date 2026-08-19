<script setup lang="ts">
import type { QueueJob } from '~/composables/useJobsStream'

const props = defineProps<{ job: QueueJob; expanded: boolean }>()
const emit = defineEmits<{ toggle: [uid: string]; changed: [] }>()

const args = ref('')
const argsError = ref('')
const busy = ref(false)

const job = computed(() => props.job)
const canPause = computed(() => job.value.status === 'queued')
const canResume = computed(() => job.value.status === 'paused')
const canRetry = computed(() => job.value.status === 'errored')
const statusLabel = computed(() => (jobShowsBar(job.value) ? '' : job.value.status))

/** Wohin die fertige Datei wandert — dieselbe Ordnerlogik wie in `buildArgs`. */
const targetPath = computed(() => {
  const parts = [jobOptions(job.value).targetFolder || job.value.type, job.value.uploader]
  return `→ /downloads/${parts.filter(Boolean).join('/')}/`
})

// Die Args baut der Server aus Job-Optionen plus globalen Settings; sie werden
// erst geholt, wenn die Zeile aufgeklappt ist.
watch(
  () => props.expanded,
  async (open) => {
    if (!open || args.value) return
    try {
      const preview = await $fetch<{ command: string }>('/api/args-preview', {
        method: 'POST',
        body: { url: job.value.url, type: job.value.type, options: job.value.options },
      })
      args.value = preview.command
      argsError.value = ''
    }
    catch {
      argsError.value = 'Could not build the args preview'
    }
  },
  { immediate: true },
)

async function post(path: string): Promise<void> {
  busy.value = true
  try {
    await $fetch(path, { method: 'POST' })
    emit('changed')
  }
  catch {
    // Der Stream liefert den tatsächlichen Stand ohnehin nach.
  }
  finally {
    busy.value = false
  }
}

const pauseOrResume = (): Promise<void> =>
  post(`/api/jobs/${job.value.uid}/${canPause.value ? 'pause' : 'resume'}`)
const retry = (): Promise<void> => post(`/api/jobs/${job.value.uid}/retry`)
const cancel = (): Promise<void> => post(`/api/jobs/${job.value.uid}/cancel`)
</script>

<template>
  <div>
    <div class="job-row" @click="emit('toggle', job.uid)">
      <div class="dot" :class="`dot-${job.status}`" />

      <div class="job-title-cell">
        <div class="job-title">{{ jobTitle(job) }}</div>
        <div class="job-channel">{{ job.uploader ?? '—' }}</div>
      </div>

      <span class="mono">{{ jobFormatLabel(job) }}</span>

      <div>
        <div v-if="jobShowsBar(job)" class="progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: formatPercent(job.progressPct) }" />
          </div>
          <span class="mono progress-label">{{ formatPercent(job.progressPct) }}</span>
        </div>
        <span v-else class="status-tag" :class="`status-${job.status}`">{{ statusLabel }}</span>
      </div>

      <span class="mono">{{ job.progressSpeed || '—' }}</span>
      <span class="mono">{{ job.progressEta || '—' }}</span>
      <span class="mono">{{ formatBytes(job.sizeBytes) }}</span>
      <span class="prio-tag" :class="`prio-${jobPriorityLabel(job)}`">{{ jobPriorityLabel(job) }}</span>

      <div class="job-actions" @click.stop>
        <button
          v-if="canPause"
          class="btn btn-secondary btn-icon job-action"
          type="button"
          title="Pause"
          :disabled="busy"
          @click="pauseOrResume"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
          </svg>
        </button>
        <button
          v-if="canResume"
          class="btn btn-secondary btn-icon job-action"
          type="button"
          title="Resume"
          :disabled="busy"
          @click="pauseOrResume"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="6 3 20 12 6 21 6 3" />
          </svg>
        </button>
        <button
          v-if="canRetry"
          class="btn btn-secondary btn-icon job-action"
          type="button"
          title="Retry"
          :disabled="busy"
          @click="retry"
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          >
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
        <button
          class="btn btn-secondary btn-icon job-action"
          type="button"
          title="Cancel / remove"
          :disabled="busy"
          @click="cancel"
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="expanded" class="job-detail">
      <div class="detail-kicker">Generated args</div>
      <div class="code-block">{{ argsError || args || 'building…' }}</div>

      <template v-if="job.stderr">
        <div class="detail-kicker detail-kicker-error">
          stderr · attempt {{ job.attempts }}/{{ job.maxAttempts }}
        </div>
        <div class="stderr-block">{{ job.stderr }}</div>
      </template>

      <div class="detail-meta">
        <span>uid {{ job.uid }}</span>
        <span>created {{ formatClock(job.createdAt) }}</span>
        <span>{{ targetPath }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.job-row {
  display: grid;
  grid-template-columns: var(--queue-cols);
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-divider);
}
.job-row:hover { background: color-mix(in srgb, var(--color-text) 4%, transparent); }

.mono { font-family: ui-monospace, monospace; font-size: 11px; }

.job-title-cell { min-width: 0; }
.job-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.job-channel { font-size: 11px; color: var(--color-neutral-700); }

.dot { width: 8px; height: 8px; background: var(--color-neutral-400); }
.dot-running { background: var(--color-accent); animation: fa-pulse 1.4s ease-in-out infinite; }
.dot-queued { background: var(--color-neutral-400); }
.dot-paused { background: var(--color-neutral-500); }
.dot-errored { background: var(--color-accent-700); }
.dot-finished,
.dot-cancelled { background: var(--color-neutral-300); }

@keyframes fa-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.progress { display: flex; align-items: center; gap: 8px; }
.progress-track { flex: 1; height: 4px; background: var(--color-neutral-300); }
.progress-fill { height: 4px; background: var(--color-accent); }
.progress-label { width: 38px; text-align: right; }

.status-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--color-neutral-200);
  color: var(--color-neutral-800);
}
.status-errored { background: var(--color-accent-100); color: var(--color-accent-800); }
.status-finished,
.status-cancelled { background: var(--color-neutral-100); color: var(--color-neutral-700); }

.prio-tag {
  justify-self: start;
  padding: 2px 8px;
  font-size: 10px;
  letter-spacing: 0.02em;
  background: var(--color-neutral-100);
  color: var(--color-neutral-700);
}
.prio-manual { background: var(--color-accent-100); color: var(--color-accent-800); }
.prio-bulk { background: var(--color-neutral-200); color: var(--color-neutral-800); }

.job-actions { display: flex; gap: 2px; }
.job-action { width: 28px; height: 28px; }

.job-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px 36px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.detail-kicker {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
}
.detail-kicker-error { color: var(--color-accent-700); }

.code-block {
  padding: 8px 10px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  white-space: nowrap;
  overflow-x: auto;
  background: var(--color-neutral-100);
  border: 1px solid var(--color-divider);
}
.stderr-block {
  padding: 8px 10px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  white-space: pre-wrap;
  overflow-x: auto;
  background: var(--color-neutral-900);
  color: var(--color-accent-300);
}
.detail-meta {
  display: flex;
  gap: 12px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--color-neutral-700);
}
</style>
