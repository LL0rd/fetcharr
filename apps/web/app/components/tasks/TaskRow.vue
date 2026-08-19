<script setup lang="ts">
import type { Task, TaskRun } from './tasks'
import { confirmLabel, durationLabel, lastRunLabel, localLabel, scheduleLabel } from './tasks'

const props = defineProps<{ task: Task; busy?: boolean }>()
const emit = defineEmits<{
  run: []
  confirm: []
  options: []
  schedule: []
}>()

const open = ref(false)
const runs = ref<TaskRun[]>([])
const loadingRuns = ref(false)
const runsError = ref('')

async function toggleHistory(): Promise<void> {
  open.value = !open.value
  if (!open.value || runs.value.length) return

  loadingRuns.value = true
  runsError.value = ''
  try {
    const result = await $fetch<{ runs: TaskRun[] }>(`/api/tasks/${props.task.key}/runs`)
    runs.value = result.runs
  }
  catch {
    runsError.value = 'Could not load the history'
  }
  finally {
    loadingRuns.value = false
  }
}
</script>

<template>
  <div class="task-row">
    <div class="task-cell task-name-cell">
      <button class="task-name" type="button" @click="toggleHistory">
        {{ props.task.name }}
        <span class="task-chevron" :class="{ 'task-chevron-open': open }">›</span>
      </button>
      <div class="task-desc">{{ props.task.desc }}</div>
    </div>

    <span class="task-muted">{{ lastRunLabel(props.task.lastRanAt) }}</span>
    <span class="task-muted">{{ props.task.lastConfirmedAt ? lastRunLabel(props.task.lastConfirmedAt) : '—' }}</span>
    <span class="task-schedule">{{ scheduleLabel(props.task.schedule) }}</span>
    <span class="task-status" :class="`task-status-${props.task.status}`">{{ props.task.status }}</span>

    <div class="task-actions">
      <button
        v-if="props.task.confirming"
        class="btn btn-primary task-btn"
        type="button"
        :disabled="props.busy || props.task.confirmRequested"
        @click="emit('confirm')"
      >
        {{ props.task.confirmRequested ? 'Confirming…' : confirmLabel(props.task) }}
      </button>
      <button
        class="btn btn-secondary task-btn"
        type="button"
        :disabled="props.busy || props.task.running || props.task.runRequested"
        @click="emit('run')"
      >
        {{ props.task.running ? 'Running…' : props.task.runRequested ? 'Queued' : 'Run now' }}
      </button>
      <button class="btn btn-ghost task-btn" type="button" @click="emit('schedule')">Schedule</button>
      <button
        v-if="props.task.optionSpecs.length"
        class="btn btn-ghost task-btn"
        type="button"
        @click="emit('options')"
      >
        Options
      </button>
    </div>

    <div v-if="props.task.confirming && props.task.confirmSummary" class="task-payload">
      Waiting for confirmation — {{ props.task.confirmSummary }}
    </div>

    <div v-if="open" class="task-history">
      <p v-if="loadingRuns" class="task-muted">Loading history…</p>
      <p v-else-if="runsError" class="task-error">{{ runsError }}</p>
      <p v-else-if="!runs.length" class="task-muted">No runs recorded yet.</p>
      <div v-for="run in runs" v-else :key="run.id" class="task-run">
        <span class="task-run-time">{{ localLabel(run.startedAt) }}</span>
        <span class="task-run-phase">{{ run.phase }}</span>
        <span class="task-run-duration">{{ durationLabel(run.durationMs) }}</span>
        <span :class="run.error ? 'task-error' : ''">{{ run.error || run.summary || '—' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-row {
  display: grid;
  grid-template-columns: 1fr 120px 120px 150px 110px 240px;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  font-size: 13px;
  border-bottom: 1px solid var(--color-divider);
}
.task-row:hover { background: color-mix(in srgb, var(--color-text) 4%, transparent); }

.task-name-cell { min-width: 0; }
.task-name {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: var(--color-text);
  background: none;
  border: 0;
  cursor: pointer;
}
.task-chevron { display: inline-block; font-size: 14px; color: var(--color-neutral-600); transition: transform .15s; }
.task-chevron-open { transform: rotate(90deg); }
.task-desc { font-size: 11px; color: var(--color-neutral-700); }

.task-muted { font-size: 11px; color: var(--color-neutral-700); }
.task-schedule { font-family: ui-monospace, monospace; font-size: 11px; }

.task-status {
  justify-self: start;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: var(--color-neutral-100);
  color: var(--color-neutral-700);
}
.task-status-confirming { background: var(--color-accent-100); color: var(--color-accent-800); }
.task-status-running { background: var(--color-accent-100); color: var(--color-accent-800); }
.task-status-auto_confirm { background: var(--color-neutral-200); color: var(--color-neutral-800); }

.task-actions { display: flex; gap: 6px; align-items: center; justify-content: flex-end; }
.task-btn { font-size: 11px; padding: 4px 10px; }

.task-payload {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--color-accent-800);
}

.task-history {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0 4px;
  border-top: 1px solid var(--color-divider);
}
.task-run {
  display: grid;
  grid-template-columns: 130px 70px 70px 1fr;
  gap: 10px;
  font-size: 11px;
  color: var(--color-neutral-800);
}
.task-run-time, .task-run-duration { font-family: ui-monospace, monospace; }
.task-run-phase { text-transform: uppercase; letter-spacing: 0.05em; }
.task-error { color: var(--color-accent); }
</style>
