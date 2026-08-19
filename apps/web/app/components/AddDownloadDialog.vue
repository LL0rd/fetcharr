<script setup lang="ts">
import { emptyDraft, toJobOptions, withLiveFromStart } from './add-download-options'

interface ProbeResult {
  url: string
  id: string | null
  title: string | null
  uploader: string | null
  duration: number | null
  thumbnail: string | null
  isPlaylist: boolean
  entryCount: number | null
  liveStatus: string | null
  isLive: boolean
}

const props = defineProps<{ url: string }>()
const emit = defineEmits<{ close: []; added: [] }>()

const draft = ref(emptyDraft())
const probe = ref<ProbeResult | null>(null)
const probeError = ref('')
const probing = ref(true)
const submitting = ref(false)
const submitError = ref('')
const argsPreview = ref('')
const recordFromStart = ref(false)

const isLive = computed(() => probe.value?.isLive === true)

/** Was der Job wirklich bekommt — inklusive `--live-from-start`, wenn gewählt. */
const jobOptions = computed(() =>
  withLiveFromStart(toJobOptions(draft.value), isLive.value && recordFromStart.value),
)

const kind = computed(() => {
  if (probing.value) return 'checking url'
  if (!probe.value) return 'no metadata'
  if (probe.value.isPlaylist) {
    const count = probe.value.entryCount
    return count ? `playlist · ${count} items` : 'playlist detected'
  }
  return draft.value.format === 'audio' ? 'audio detected' : 'video detected'
})

const metaLine = computed(() => {
  const parts = [probe.value?.uploader, formatDuration(probe.value?.duration ?? null)]
  return parts.filter(Boolean).join(' · ')
})

onMounted(async () => {
  try {
    probe.value = await $fetch<ProbeResult>('/api/probe', {
      method: 'POST',
      body: { url: props.url },
    })
  }
  catch (error) {
    probeError.value = probeMessage(error)
  }
  finally {
    probing.value = false
  }
})

/** 503 heißt: das yt-dlp-Binary fehlt noch — der Worker holt es beim Start. */
function probeMessage(error: unknown): string {
  if ((error as { statusCode?: number })?.statusCode === 503) {
    return 'Worker not ready — yt-dlp is still missing'
  }
  return statusMessageOf(error) || 'Could not read metadata for this url'
}

function statusMessageOf(error: unknown): string {
  const failure = error as { statusMessage?: string; data?: { statusMessage?: string } }
  return failure?.data?.statusMessage || failure?.statusMessage || ''
}

let previewTimer: ReturnType<typeof setTimeout> | null = null

watch(
  [draft, recordFromStart],
  () => {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = setTimeout(loadPreview, 200)
  },
  { deep: true, immediate: true },
)

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})

async function loadPreview(): Promise<void> {
  try {
    const preview = await $fetch<{ command: string }>('/api/args-preview', {
      method: 'POST',
      body: { url: props.url, options: jobOptions.value },
    })
    argsPreview.value = preview.command
  }
  catch {
    argsPreview.value = 'Invalid options — check the advanced fields'
  }
}

async function addToQueue(): Promise<void> {
  submitting.value = true
  submitError.value = ''
  try {
    await $fetch('/api/jobs', {
      method: 'POST',
      body: {
        url: props.url,
        options: jobOptions.value,
        title: probe.value?.title ?? undefined,
        uploader: probe.value?.uploader ?? undefined,
      },
    })
    emit('added')
    emit('close')
  }
  catch (error) {
    submitError.value = statusMessageOf(error) || 'Could not queue this download'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="dialog-backdrop add-backdrop" @click="emit('close')">
    <div class="dialog add-dialog" @click.stop>
      <div class="add-head">
        <span class="dialog-title add-title">Add download</span>
        <span class="tag tag-accent add-kind">{{ kind }}</span>
        <span v-if="isLive" class="tag add-live">LIVE</span>
      </div>

      <div class="add-meta">
        <div class="thumb">
          <img v-if="probe?.thumbnail" :src="probe.thumbnail" alt="">
          <span v-else class="thumb-label">{{ probing ? 'probing…' : 'thumbnail' }}</span>
        </div>
        <div class="add-meta-text">
          <div class="add-meta-title">{{ probe?.title || (probing ? 'Reading metadata…' : 'Unknown title') }}</div>
          <div v-if="metaLine" class="add-meta-sub">{{ metaLine }}</div>
          <div class="add-meta-url">{{ url }}</div>
        </div>
      </div>

      <p v-if="probeError" class="add-error">{{ probeError }}</p>

      <div class="field">
        <label>Format</label>
        <SegmentedControl v-model="draft.format" :options="['best', '1080p', '720p', 'audio']" />
      </div>

      <label v-if="isLive" class="add-live-option">
        <input v-model="recordFromStart" type="checkbox">
        <span>
          Record from start
          <em>Captures the stream from its beginning instead of from now.</em>
        </span>
      </label>

      <AddDownloadAdvanced v-model="draft" />

      <div class="args">
        <div class="args-kicker">Args preview</div>
        <div class="args-block">{{ argsPreview || '…' }}</div>
      </div>

      <p v-if="submitError" class="add-error">{{ submitError }}</p>

      <div class="dialog-actions add-actions">
        <button class="btn btn-secondary" type="button" @click="emit('close')">Cancel</button>
        <button class="btn btn-primary" type="button" :disabled="submitting" @click="addToQueue">
          Add to queue
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add-backdrop { z-index: 100; }
.add-dialog { width: min(600px, 100%); max-width: min(600px, 100%); gap: 14px; overflow: hidden; }

.add-head { display: flex; align-items: baseline; gap: 10px; }
.add-title { font-size: 18px; }
.add-kind { font-size: 10px; }

.add-meta { display: flex; gap: 12px; }
.thumb {
  width: 150px;
  flex: none;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: repeating-linear-gradient(
    45deg,
    var(--color-neutral-200),
    var(--color-neutral-200) 6px,
    var(--color-neutral-300) 6px,
    var(--color-neutral-300) 12px
  );
}
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.thumb-label { font-family: ui-monospace, monospace; font-size: 10px; color: var(--color-neutral-600); }

.add-meta-text { min-width: 0; }
.add-meta-title { font-weight: 600; font-size: 14px; line-height: 1.3; }
.add-meta-sub { font-size: 12px; color: var(--color-neutral-700); margin-top: 2px; }
.add-meta-url {
  margin-top: 6px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--color-neutral-600);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.add-live {
  font-size: 10px;
  color: var(--color-bg);
  background: var(--color-accent);
}
.add-live-option { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; }
.add-live-option em {
  display: block;
  font-style: normal;
  font-size: 11px;
  color: var(--color-neutral-700);
}

.add-error {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--color-accent-100);
  color: var(--color-accent-800);
}

.args { min-width: 0; max-width: 100%; overflow: hidden; }
.args-kicker {
  margin-bottom: 5px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
}
.args-block {
  padding: 8px 10px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  white-space: nowrap;
  overflow-x: auto;
  background: var(--color-neutral-100);
  border: 1px solid var(--color-divider);
}

.add-actions { margin-top: 0; }
</style>
