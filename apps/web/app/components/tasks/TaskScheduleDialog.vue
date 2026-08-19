<script setup lang="ts">
import type { Task } from './tasks'
import { toDatetimeLocal } from './tasks'

const props = defineProps<{ task: Task }>()
const emit = defineEmits<{ close: []; saved: [task: Task] }>()

type Mode = 'manual' | 'recurring' | 'once'

const mode = ref<Mode>(props.task.schedule?.type ?? 'manual')
const cron = ref(props.task.schedule?.type === 'recurring' ? props.task.schedule.cron : '0 3 * * *')
const at = ref(
  props.task.schedule?.type === 'once'
    ? toDatetimeLocal(new Date(props.task.schedule.timestamp * 1000))
    : toDatetimeLocal(new Date(Date.now() + 3600_000)),
)

const saving = ref(false)
const error = ref('')

async function save(): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    const result = await $fetch<{ task: Task }>(`/api/tasks/${props.task.key}/schedule`, {
      method: 'PUT',
      body: { schedule: body() },
    })
    emit('saved', result.task)
    emit('close')
  }
  catch (failure) {
    error.value
      = (failure as { data?: { statusMessage?: string } })?.data?.statusMessage
      || 'Could not save the schedule'
  }
  finally {
    saving.value = false
  }
}

function body(): unknown {
  if (mode.value === 'manual') return null
  if (mode.value === 'recurring') return { type: 'recurring', cron: cron.value.trim() }

  // Das datetime-local-Feld liefert lokale Zeit ohne Zone — new Date() liest sie
  // genau so, wie sie im Browser eingetippt wurde.
  return { type: 'once', timestamp: Math.floor(new Date(at.value).getTime() / 1000) }
}
</script>

<template>
  <div class="dialog-backdrop" @click="emit('close')">
    <div class="dialog sched-dialog" role="dialog" aria-modal="true" @click.stop>
      <span class="dialog-title">{{ props.task.name }} — schedule</span>

      <div class="field">
        <label>Runs</label>
        <SegmentedControl v-model="mode" :options="['manual', 'recurring', 'once']" />
      </div>

      <div v-if="mode === 'recurring'" class="field">
        <label for="sched-cron">Cron expression</label>
        <input id="sched-cron" v-model="cron" class="input mono">
        <span class="hint">TZ-aware, evaluated by the worker (croner).</span>
      </div>

      <div v-else-if="mode === 'once'" class="field">
        <label for="sched-at">Runs once at</label>
        <input id="sched-at" v-model="at" class="input" type="datetime-local">
      </div>

      <p v-else class="hint">The task only runs when you press “Run now”.</p>

      <p v-if="error" class="sched-error">{{ error }}</p>

      <div class="dialog-actions">
        <button class="btn btn-secondary" type="button" @click="emit('close')">Cancel</button>
        <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save schedule' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sched-dialog { width: min(420px, 100%); display: flex; flex-direction: column; gap: 12px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.hint { margin: 0; font-size: 11px; color: var(--color-neutral-700); }
.sched-error { margin: 0; font-size: 12px; color: var(--color-accent); }
</style>
