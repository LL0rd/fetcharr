<script setup lang="ts">
import type { Subscription } from './subscriptions'
import { relativeLabel } from './subscriptions'

const props = defineProps<{ subscription: Subscription; busy?: boolean }>()
const emit = defineEmits<{ check: []; edit: [] }>()

const checkLabel = computed(() => {
  if (props.subscription.checking) return 'Checking…'
  if (props.subscription.checkRequested) return 'Queued'
  return 'Check now'
})

const checkDisabled = computed(
  () => props.busy || props.subscription.checking || props.subscription.checkRequested,
)

const lastCheck = computed(() => relativeLabel(props.subscription.lastCheckAt, 'ago'))
</script>

<template>
  <div class="sub-row">
    <div class="sub-name">
      <div class="sub-title">
        {{ subscription.name }}
        <span v-if="subscription.paused" class="tag tag-neutral sub-tag">paused</span>
        <span v-if="subscription.rssEnabled" class="tag tag-outline sub-tag">RSS</span>
      </div>
      <div class="sub-url">{{ subscription.url }}</div>
    </div>

    <span class="sub-type">{{ subscription.type }}</span>
    <span class="mono">{{ subscription.cron }}</span>
    <span class="mono">{{ subscription.maxQuality || 'best' }}</span>
    <span class="sub-muted">{{ lastCheck }}</span>
    <span class="mono">{{ subscription.archiveCount.toLocaleString('en-US') }}</span>

    <div class="sub-actions">
      <button
        class="btn btn-secondary sub-btn"
        type="button"
        :disabled="checkDisabled"
        @click="emit('check')"
      >
        {{ checkLabel }}
      </button>
      <button class="btn btn-ghost sub-btn" type="button" @click="emit('edit')">Edit</button>
    </div>
  </div>
</template>

<style scoped>
.sub-row {
  display: grid;
  grid-template-columns: 1fr 84px 110px 96px 100px 90px 150px;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  font-size: 13px;
  border-bottom: 1px solid var(--color-divider);
}
.sub-row:hover { background: color-mix(in srgb, var(--color-text) 4%, transparent); }

.sub-name { min-width: 0; }
.sub-title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.sub-tag { font-size: 9px; }
.sub-url {
  font-size: 11px;
  color: var(--color-neutral-700);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub-type { font-size: 11px; }
.sub-muted { font-size: 11px; color: var(--color-neutral-700); }
.mono { font-family: ui-monospace, monospace; font-size: 11px; }

.sub-actions { display: flex; gap: 6px; }
.sub-btn { font-size: 11px; padding: 4px 10px; }
</style>
