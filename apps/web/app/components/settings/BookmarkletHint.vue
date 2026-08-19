<script setup lang="ts">
// Das Bookmarklet schickt die gerade offene Seite an /share — denselben
// Landeplatz, den auch das Web Share Target der installierten App benutzt.
// Die Origin steht erst im Browser fest, darum wird sie nach dem Mount gesetzt.
const origin = ref('')

onMounted(() => {
  origin.value = window.location.origin
})

const bookmarklet = computed(
  () =>
    `javascript:void(open(${JSON.stringify(origin.value)}+'/share?url='+encodeURIComponent(location.href)))`,
)

const copied = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | null = null

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(bookmarklet.value)
    copied.value = true
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => (copied.value = false), 2000)
  }
  catch {
    // Ohne Clipboard-Recht bleibt der Link zum Ziehen — das reicht.
  }
}

onBeforeUnmount(() => {
  if (resetTimer) clearTimeout(resetTimer)
})
</script>

<template>
  <div class="bm">
    <span class="bm-label">Bookmarklet</span>
    <p class="bm-text">
      Drag this into your bookmarks bar to send the page you are on to Fetcharr. On mobile,
      install the app instead — it registers as a share target.
    </p>
    <div class="bm-row">
      <a class="btn btn-secondary bm-drag" :href="bookmarklet" @click.prevent>Fetch this page</a>
      <button class="btn btn-ghost bm-copy" type="button" @click="copy">
        {{ copied ? 'Copied' : 'Copy source' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bm { display: flex; flex-direction: column; gap: 8px; }
.bm-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
}
.bm-text { margin: 0; font-size: 11px; color: var(--color-neutral-700); }
.bm-row { display: flex; gap: 8px; }
.bm-drag { font-size: 12px; cursor: grab; }
.bm-copy { font-size: 12px; }
</style>
