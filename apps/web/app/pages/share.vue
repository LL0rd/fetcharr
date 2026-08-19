<script setup lang="ts">
import { extractSharedUrl } from '~/utils/share-target'

// Landeplatz des Web Share Targets: die geteilte URL herausziehen, den
// Add-Dialog scharf machen und sofort auf die Queue zurückfallen — /share
// selbst soll nie im Verlauf stehen bleiben.
const route = useRoute()
const probeUrl = useState<string>('probe-url', () => '')

const shared = extractSharedUrl(route.query)
if (shared) probeUrl.value = shared

onMounted(() => {
  void navigateTo('/', { replace: true })
})
</script>

<template>
  <section class="share">
    <h4>{{ shared ? 'Opening…' : 'Nothing to fetch' }}</h4>
    <p v-if="!shared" class="share-hint">
      That share did not contain a link. Paste the url into the field up top instead.
    </p>
  </section>
</template>

<style scoped>
.share h4 { margin: 0 0 8px; }
.share-hint { margin: 0; font-size: 13px; color: var(--color-neutral-700); }
</style>
