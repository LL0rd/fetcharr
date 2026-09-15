<script setup lang="ts">
const { jobs, refresh } = useJobsStream()

const expandedUid = ref<string | null>(null)
const { busy, error: actionError, run: runAction } = useQueueActions(refresh)

// Der Add-Dialog sitzt im Layout; sein Zähler holt die frisch eingereihte Zeile.
const queueReload = useState('queue-reload', () => 0)
watch(queueReload, () => {
  void refresh().catch(() => {})
})

const activeCount = computed(
  () => jobs.value.filter((job) => job.status === 'running' || job.status === 'queued').length,
)
const erroredCount = computed(() => jobs.value.filter((job) => job.status === 'errored').length)
const finishedCount = computed(() => jobs.value.filter((job) => job.status === 'finished').length)
const pausedCount = computed(() => jobs.value.filter((job) => job.status === 'paused').length)

const summary = computed(
  () => `${activeCount.value} active · ${erroredCount.value} errored · ${finishedCount.value} finished`,
)

/**
 * Ein laufender yt-dlp-Prozess lässt sich nicht anhalten, „Pause all" trifft
 * deshalb nur die wartenden Jobs. Sind nur noch pausierte übrig, wird der
 * Knopf zum Gegenstück.
 */
const resumeMode = computed(() => pausedCount.value > 0 && activeCount.value === 0)
const pauseAllLabel = computed(() => (resumeMode.value ? 'Resume all' : 'Pause all'))

function toggle(uid: string): void {
  expandedUid.value = expandedUid.value === uid ? null : uid
}

async function togglePauseAll(): Promise<void> {
  const from = resumeMode.value ? 'paused' : 'queued'
  const action = resumeMode.value ? 'resume' : 'pause'
  const targets = jobs.value.filter((job) => job.status === from).map((job) => job.uid)

  await runAction(pauseAllLabel.value, async () => {
    const results = await Promise.allSettled(
      targets.map((uid) =>
        $fetch(`/api/jobs/${uid}/${action}`, { method: 'POST', timeout: ACTION_TIMEOUT_MS }),
      ),
    )
    const failed = results.filter((result) => result.status === 'rejected').length
    if (failed) throw new Error(`${failed} of ${targets.length} jobs did not respond`)
  })
}

/** Wie viele Zeilen „Clear queue" treffen würde — der Knopf nennt die Zahl. */
const pendingCount = computed(
  () => jobs.value.filter((job) => job.status !== 'finished' && job.status !== 'errored'
    && job.status !== 'cancelled').length,
)
const runningCount = computed(() => jobs.value.filter((job) => job.status === 'running').length)
const confirmClear = ref(false)

const clearBody = computed(() => {
  const jobWord = pendingCount.value === 1 ? 'job' : 'jobs'
  const running = runningCount.value
    ? ` The ${runningCount.value === 1 ? 'running download is' : `${runningCount.value} running downloads are`} stopped right away.`
    : ''
  return `Removes ${pendingCount.value} queued, paused and running ${jobWord}.${running}`
    + ' Finished and errored jobs stay — use Clear finished for those.'
})

async function clearQueue(): Promise<void> {
  confirmClear.value = false
  await runAction('Clear queue', () =>
    $fetch('/api/jobs/clear-queue', { method: 'POST', timeout: ACTION_TIMEOUT_MS }),
  )
}

async function clearFinished(): Promise<void> {
  await runAction('Clear finished', () =>
    $fetch('/api/jobs/clear-finished', { method: 'POST', timeout: ACTION_TIMEOUT_MS }),
  )
}
</script>

<template>
  <section>
    <div class="queue-head">
      <h4>Queue</h4>
      <span class="queue-summary">{{ summary }}</span>
      <div class="queue-head-actions">
        <button class="btn btn-secondary queue-btn" type="button" :disabled="busy" @click="togglePauseAll">
          {{ pauseAllLabel }}
        </button>
        <button
          class="btn btn-secondary queue-btn"
          type="button"
          :disabled="busy || !pendingCount"
          @click="confirmClear = true"
        >
          Clear queue
        </button>
        <button class="btn btn-secondary queue-btn" type="button" :disabled="busy" @click="clearFinished">
          Clear finished
        </button>
      </div>
    </div>

    <p v-if="actionError" class="queue-error" role="alert">
      {{ actionError }}
      <button class="queue-error-close" type="button" aria-label="Dismiss" @click="actionError = ''">×</button>
    </p>

    <div class="queue-table">
      <div class="queue-header">
        <span />
        <span>Title</span>
        <span>Format</span>
        <span>Progress</span>
        <span>Speed</span>
        <span>ETA</span>
        <span>Size</span>
        <span>Priority</span>
        <span>Actions</span>
      </div>

      <JobRow
        v-for="job in jobs"
        :key="job.uid"
        :job="job"
        :expanded="expandedUid === job.uid"
        @toggle="toggle"
        @changed="refresh"
      />

      <p v-if="!jobs.length" class="queue-empty">
        Nothing queued — paste a URL above and hit Fetch.
      </p>
    </div>

    <div class="queue-foot">
      Priority order: manual &gt; bulk &gt; subscription · failed jobs retry with exponential
      backoff · click a row for args &amp; stderr
    </div>
    <LibraryConfirmDialog
      v-if="confirmClear"
      title="Clear queue?"
      :body="clearBody"
      confirm-label="Clear queue"
      :busy="busy"
      @confirm="clearQueue"
      @cancel="confirmClear = false"
    />
  </section>
</template>

<style scoped>
.queue-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.queue-head h4 { margin: 0; }
.queue-summary { font-size: 12px; color: var(--color-neutral-700); }
.queue-error {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 10px;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--color-accent-100);
  color: var(--color-accent-800);
}
.queue-error-close {
  margin-left: auto;
  padding: 0 4px;
  font: inherit;
  font-size: 15px;
  line-height: 1;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
}

.queue-head-actions { margin-left: auto; display: flex; gap: 8px; }
.queue-btn { font-size: 12px; padding: 5px 12px; }

.queue-table {
  /* Kopfzeile und JobRow teilen sich das Raster über diese Variable. */
  --queue-cols: 16px minmax(200px, 1fr) 64px minmax(110px, 150px) 74px 60px 64px 82px 100px;
  border-top: 2px solid var(--color-divider);
}

.queue-header {
  display: grid;
  grid-template-columns: var(--queue-cols);
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
  border-bottom: 2px solid var(--color-divider);
}

.queue-empty {
  margin: 0;
  padding: 18px 10px;
  font-size: 13px;
  color: var(--color-neutral-700);
  border-bottom: 1px solid var(--color-divider);
}

.queue-foot { margin-top: 14px; font-size: 11px; color: var(--color-neutral-600); }
</style>
