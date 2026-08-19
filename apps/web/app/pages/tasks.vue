<script setup lang="ts">
import type { Task, TaskList } from '~/components/tasks/tasks'
// Explizit importiert: der Verzeichnis-Präfix der Auto-Imports („Tasks")
// würde die Komponenten sonst TasksTaskRow nennen.
import TaskBackups from '~/components/tasks/TaskBackups.vue'
import TaskOptionsDialog from '~/components/tasks/TaskOptionsDialog.vue'
import TaskRow from '~/components/tasks/TaskRow.vue'
import TaskScheduleDialog from '~/components/tasks/TaskScheduleDialog.vue'

const tasks = ref<Task[]>([])
const loadError = ref('')
const busy = ref(new Set<string>())
const resetting = ref(false)
const resetNote = ref('')

const optionsTarget = ref<Task | null>(null)
const scheduleTarget = ref<Task | null>(null)

onMounted(() => void load())

async function load(): Promise<void> {
  loadError.value = ''
  try {
    const result = await $fetch<TaskList>('/api/tasks')
    tasks.value = result.tasks
  }
  catch {
    loadError.value = 'Could not load the tasks — is the API up yet?'
  }
}

/** Run und Confirm setzen nur Flags; die Antwort trägt die Zeile schon aktualisiert. */
async function trigger(task: Task, action: 'run' | 'confirm'): Promise<void> {
  busy.value = new Set(busy.value).add(task.key)
  loadError.value = ''
  try {
    const result = await $fetch<{ task: Task }>(`/api/tasks/${task.key}/${action}`, {
      method: 'POST',
    })
    replace(result.task)
  }
  catch (error) {
    loadError.value
      = (error as { data?: { statusMessage?: string } })?.data?.statusMessage
      || `Could not ${action} "${task.name}"`
  }
  finally {
    const next = new Set(busy.value)
    next.delete(task.key)
    busy.value = next
  }
}

async function resetStuck(): Promise<void> {
  resetting.value = true
  resetNote.value = ''
  try {
    const result = await $fetch<{ reset: number }>('/api/tasks/reset', { method: 'POST' })
    resetNote.value = result.reset
      ? `Reset ${String(result.reset)} stuck task${result.reset === 1 ? '' : 's'}`
      : 'Nothing was stuck'
    await load()
  }
  catch {
    loadError.value = 'Could not reset the tasks'
  }
  finally {
    resetting.value = false
  }
}

function replace(updated: Task): void {
  tasks.value = tasks.value.map((task) => (task.key === updated.key ? { ...task, ...updated } : task))
}
</script>

<template>
  <section>
    <div class="tasks-head">
      <h4 class="tasks-title">Tasks &amp; maintenance</h4>
      <span class="tasks-sub">two-phase: run collects → confirm executes destructive step</span>
      <span v-if="resetNote" class="tasks-note">{{ resetNote }}</span>
      <button
        class="btn btn-secondary tasks-reset"
        type="button"
        :disabled="resetting"
        @click="resetStuck"
      >
        {{ resetting ? 'Resetting…' : 'Reset stuck tasks' }}
      </button>
    </div>

    <p v-if="loadError" class="tasks-error">{{ loadError }}</p>

    <div class="tasks-table">
      <div class="tasks-header">
        <span>Task</span>
        <span>Last run</span>
        <span>Last confirmed</span>
        <span>Schedule</span>
        <span>Status</span>
        <span class="tasks-header-actions">Actions</span>
      </div>

      <TaskRow
        v-for="task in tasks"
        :key="task.key"
        :task="task"
        :busy="busy.has(task.key)"
        @run="trigger(task, 'run')"
        @confirm="trigger(task, 'confirm')"
        @options="optionsTarget = task"
        @schedule="scheduleTarget = task"
      />
    </div>

    <div class="tasks-foot">
      Task history in task_runs · scheduler is TZ-aware (croner) · a running task is skipped on
      re-trigger · DB restore &amp; auto-backup before rebuild
    </div>

    <TaskBackups />

    <TaskOptionsDialog
      v-if="optionsTarget"
      :task="optionsTarget"
      @close="optionsTarget = null"
      @saved="replace"
    />
    <TaskScheduleDialog
      v-if="scheduleTarget"
      :task="scheduleTarget"
      @close="scheduleTarget = null"
      @saved="replace"
    />
  </section>
</template>

<style scoped>
.tasks-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.tasks-title { margin: 0; }
.tasks-sub { font-size: 12px; color: var(--color-neutral-700); }
.tasks-note { font-size: 12px; color: var(--color-neutral-700); }
.tasks-reset { margin-left: auto; font-size: 12px; padding: 5px 12px; }
.tasks-error { margin: 0 0 12px; font-size: 12px; color: var(--color-accent); }

.tasks-table { border-top: 2px solid var(--color-divider); }
.tasks-header {
  display: grid;
  grid-template-columns: 1fr 120px 120px 150px 110px 240px;
  gap: 10px;
  padding: 8px 10px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
  border-bottom: 2px solid var(--color-divider);
}
.tasks-header-actions { text-align: right; }

.tasks-foot { margin-top: 14px; font-size: 11px; color: var(--color-neutral-600); }
</style>
