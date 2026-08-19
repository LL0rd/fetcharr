<script setup lang="ts">
import type { LibraryFile } from '~/components/library/library-files'
import { fileDateLabel } from '~/components/library/library-files'

const route = useRoute()
const uid = computed(() => String(route.params.uid))

const file = ref<LibraryFile | null>(null)
const loadError = ref('')
const media = ref<HTMLMediaElement | null>(null)

const streamUrl = computed(() => `/api/stream/${uid.value}`)

const metaLine = computed(() => {
  if (!file.value) return ''
  const parts = [
    file.value.uploader,
    fileDateLabel(file.value),
    formatDuration(file.value.durationSec),
    formatBytes(file.value.sizeBytes),
    `${file.value.viewCount} view${file.value.viewCount === 1 ? '' : 's'}`,
  ]
  return parts.filter(Boolean).join(' · ')
})

onMounted(async () => {
  try {
    const result = await $fetch<{ file: LibraryFile }>(`/api/files/${uid.value}`)
    file.value = result.file
  }
  catch {
    loadError.value = 'This file is not in the library (any more).'
  }
})

/** Die zuletzt gemeldete Position — spart identische Aufrufe beim Pausieren. */
let reported = -1
// Nur die erste Meldung zählt als Aufruf, danach ist es reine Positionspflege.
let counted = false
let ticker: ReturnType<typeof setInterval> | null = null

function report(): void {
  const element = media.value
  if (!element || !file.value) return

  const position = Math.floor(element.currentTime)
  if (position === reported) return
  reported = position

  const countView = !counted
  counted = true

  void $fetch(`/api/files/${uid.value}/view`, {
    method: 'POST',
    body: { positionSec: position, countView },
  }).catch(() => {})
}

function onLoadedMetadata(): void {
  const element = media.value
  const resume = file.value?.resumePositionSec ?? 0
  if (!element || resume < 5) return
  // Am Ende stehengeblieben heißt „fertig geschaut" — dann von vorn.
  if (element.duration && resume > element.duration - 10) return
  element.currentTime = resume
}

function onPlay(): void {
  if (ticker) clearInterval(ticker)
  ticker = setInterval(report, 15000)
}

function onPause(): void {
  stopTicker()
  // Am Ende feuert der Browser `pause` und `ended`; dort zählt nur `onEnded`.
  if (media.value?.ended) return
  report()
}

/** Durchgeschaut heißt: beim nächsten Mal wieder von vorn. */
function onEnded(): void {
  stopTicker()
  // Die Endposition gilt als gemeldet, sonst schreibt sie das Verlassen der
  // Seite gleich wieder zurück.
  reported = Math.floor(media.value?.currentTime ?? 0)
  void $fetch(`/api/files/${uid.value}/view`, {
    method: 'POST',
    body: { positionSec: null, countView: false },
  }).catch(() => {})
}

function stopTicker(): void {
  if (ticker) clearInterval(ticker)
  ticker = null
}

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  report()
})

async function toggleFavorite(): Promise<void> {
  if (!file.value) return
  const wanted = !file.value.favorite
  file.value.favorite = wanted
  try {
    await $fetch(`/api/files/${uid.value}/favorite`, {
      method: 'POST',
      body: { favorite: wanted },
    })
  }
  catch {
    file.value.favorite = !wanted
  }
}
</script>

<template>
  <section class="watch">
    <div class="watch-head">
      <NuxtLink to="/library" class="back">← Back to library</NuxtLink>
    </div>

    <p v-if="loadError" class="watch-error">{{ loadError }}</p>

    <template v-else-if="file">
      <div class="stage" :class="{ 'stage-audio': file.type === 'audio' }">
        <video
          v-if="file.type === 'video'"
          ref="media"
          class="player"
          :src="streamUrl"
          controls
          autoplay
          playsinline
          @loadedmetadata="onLoadedMetadata"
          @play="onPlay"
          @pause="onPause"
          @ended="onEnded"
        />
        <audio
          v-else
          ref="media"
          class="player player-audio"
          :src="streamUrl"
          controls
          autoplay
          @loadedmetadata="onLoadedMetadata"
          @play="onPlay"
          @pause="onPause"
          @ended="onEnded"
        />
      </div>

      <div class="info">
        <div class="info-text">
          <h4 class="info-title">{{ file.title }}</h4>
          <div class="info-meta">{{ metaLine }}</div>
          <a class="info-url" :href="file.url" target="_blank" rel="noreferrer">{{ file.url }}</a>
        </div>
        <div class="info-actions">
          <span class="tag" :class="file.type === 'audio' ? 'tag-accent' : 'tag-neutral'">{{ file.type }}</span>
          <LibraryStar :active="file.favorite" :size="18" @toggle="toggleFavorite" />
          <a class="btn btn-secondary watch-btn" :href="streamUrl" download>Download</a>
        </div>
      </div>

      <div class="watch-foot">
        Streamed with range requests from /api/stream · playback position is stored per file
      </div>
    </template>

    <p v-else class="watch-loading">Loading…</p>
  </section>
</template>

<style scoped>
.watch { display: flex; flex-direction: column; gap: 14px; }
.watch-head { display: flex; align-items: center; gap: 12px; }
.back { font-size: 12px; color: var(--color-neutral-700); text-decoration: none; }
.back:hover { color: var(--color-accent); }

.stage {
  display: grid;
  place-items: center;
  background: var(--color-neutral-900);
  max-height: 70vh;
}
.stage-audio { padding: 24px; background: var(--color-surface); }
.player { width: 100%; max-height: 70vh; display: block; }
.player-audio { max-width: 560px; }

.info { display: flex; gap: 16px; align-items: flex-start; }
.info-text { min-width: 0; flex: 1; }
.info-title { margin: 0 0 4px; font-size: 18px; }
.info-meta { font-size: 12px; color: var(--color-neutral-700); }
.info-url {
  display: inline-block;
  margin-top: 6px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-actions { display: flex; align-items: center; gap: 10px; flex: none; }
.watch-btn { font-size: 12px; padding: 5px 12px; }

.watch-error {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--color-accent-100);
  color: var(--color-accent-800);
}
.watch-loading { font-size: 13px; color: var(--color-neutral-700); }
.watch-foot { font-size: 11px; color: var(--color-neutral-600); }
</style>
