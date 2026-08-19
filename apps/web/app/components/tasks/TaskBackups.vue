<script setup lang="ts">
import type { Backup } from './tasks'
import { localLabel, sizeLabel } from './tasks'

const backups = ref<Backup[]>([])
const directory = ref('')
const loadError = ref('')

const pending = ref<Backup | null>(null)
const restoring = ref(false)
const restored = ref('')

onMounted(() => void load())

async function load(): Promise<void> {
  loadError.value = ''
  try {
    const result = await $fetch<{ backups: Backup[]; directory: string }>('/api/backups')
    backups.value = result.backups
    directory.value = result.directory
  }
  catch {
    loadError.value = 'Could not load the backup list'
  }
}

async function restore(): Promise<void> {
  if (!pending.value) return

  restoring.value = true
  loadError.value = ''
  try {
    const result = await $fetch<{ restored: string }>('/api/backups/restore', {
      method: 'POST',
      body: { file: pending.value.file },
    })
    restored.value = result.restored
    pending.value = null
    await load()
  }
  catch (failure) {
    loadError.value
      = (failure as { data?: { statusMessage?: string } })?.data?.statusMessage
      || 'Could not restore this backup'
  }
  finally {
    restoring.value = false
  }
}
</script>

<template>
  <section class="backups">
    <div class="backups-head">
      <h5 class="backups-title">Restore DB from backup</h5>
      <span class="backups-path">{{ directory }}</span>
    </div>

    <p v-if="restored" class="backups-note">
      Restored {{ restored }} — restart the container to run on it. Until then Fetcharr keeps
      working on the old database.
    </p>
    <p v-if="loadError" class="backups-error">{{ loadError }}</p>

    <p v-if="!backups.length" class="backups-empty">
      No backups yet — run the “Backup DB” task to create one.
    </p>

    <div v-for="backup in backups" v-else :key="backup.file" class="backup-row">
      <span class="backup-file">{{ backup.file }}</span>
      <span class="backup-meta">{{ localLabel(backup.createdAt) }}</span>
      <span class="backup-meta">{{ sizeLabel(backup.sizeBytes) }}</span>
      <button class="btn btn-secondary backup-btn" type="button" @click="pending = backup">
        Restore
      </button>
    </div>

    <div v-if="pending" class="dialog-backdrop" @click="pending = null">
      <div class="dialog backup-dialog" role="dialog" aria-modal="true" @click.stop>
        <span class="dialog-title">Restore {{ pending.file }}?</span>
        <p class="dialog-body">
          The current database is copied aside as a backup first. The restored file only takes
          effect after a restart.
        </p>
        <div class="dialog-actions">
          <button class="btn btn-secondary" type="button" @click="pending = null">Cancel</button>
          <button class="btn btn-primary" type="button" :disabled="restoring" @click="restore">
            {{ restoring ? 'Restoring…' : 'Restore' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.backups { margin-top: 28px; }
.backups-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
.backups-title { margin: 0; font-size: 14px; }
.backups-path { font-family: ui-monospace, monospace; font-size: 11px; color: var(--color-neutral-600); }

.backups-note { margin: 0 0 8px; font-size: 12px; color: var(--color-accent-800); }
.backups-error { margin: 0 0 8px; font-size: 12px; color: var(--color-accent); }
.backups-empty { margin: 0; font-size: 12px; color: var(--color-neutral-700); }

.backup-row {
  display: grid;
  grid-template-columns: 1fr 150px 90px 100px;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  font-size: 13px;
  border-bottom: 1px solid var(--color-divider);
}
.backup-row:first-of-type { border-top: 2px solid var(--color-divider); }
.backup-file { font-family: ui-monospace, monospace; font-size: 12px; }
.backup-meta { font-size: 11px; color: var(--color-neutral-700); }
.backup-btn { font-size: 11px; padding: 4px 10px; justify-self: end; }

.backup-dialog { width: min(420px, 100%); display: flex; flex-direction: column; gap: 12px; }
</style>
