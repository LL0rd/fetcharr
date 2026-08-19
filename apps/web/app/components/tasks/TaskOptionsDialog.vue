<script setup lang="ts">
import type { Task } from './tasks'

const props = defineProps<{ task: Task }>()
const emit = defineEmits<{ close: []; saved: [task: Task] }>()

/** Ein Entwurf über den gespeicherten Optionen — leer heißt „Default der Engine". */
const draft = ref<Record<string, unknown>>(
  Object.fromEntries(
    props.task.optionSpecs.map((spec) => [spec.key, props.task.options[spec.key] ?? fallback(spec.kind)]),
  ),
)

const saving = ref(false)
const error = ref('')

function fallback(kind: string): unknown {
  if (kind === 'boolean') return false
  if (kind === 'number') return 1
  return ''
}

async function save(): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    const result = await $fetch<{ task: Task }>(`/api/tasks/${props.task.key}/options`, {
      method: 'PUT',
      body: draft.value,
    })
    emit('saved', result.task)
    emit('close')
  }
  catch (failure) {
    error.value
      = (failure as { data?: { statusMessage?: string } })?.data?.statusMessage
      || 'Could not save the options'
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="dialog-backdrop" @click="emit('close')">
    <div class="dialog opt-dialog" role="dialog" aria-modal="true" @click.stop>
      <span class="dialog-title">{{ props.task.name }} — options</span>

      <div v-for="spec in props.task.optionSpecs" :key="spec.key" class="field">
        <label v-if="spec.kind === 'boolean'" class="opt-check">
          <input v-model="draft[spec.key]" type="checkbox">
          <span>{{ spec.label }}</span>
        </label>
        <template v-else>
          <label :for="`opt-${spec.key}`">{{ spec.label }}</label>
          <input
            v-if="spec.kind === 'number'"
            :id="`opt-${spec.key}`"
            v-model.number="draft[spec.key]"
            class="input"
            type="number"
            :min="spec.min"
            :max="spec.max"
          >
          <input v-else :id="`opt-${spec.key}`" v-model="draft[spec.key]" class="input mono">
        </template>
      </div>

      <p v-if="error" class="opt-error">{{ error }}</p>

      <div class="dialog-actions">
        <button class="btn btn-secondary" type="button" @click="emit('close')">Cancel</button>
        <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save options' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.opt-dialog { width: min(420px, 100%); display: flex; flex-direction: column; gap: 12px; }
.opt-check { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.opt-check input { accent-color: var(--color-accent); }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }
.opt-error { margin: 0; font-size: 12px; color: var(--color-accent); }
</style>
