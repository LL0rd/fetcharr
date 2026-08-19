<script setup lang="ts">
import type { Subscription, SubscriptionDraft } from './subscriptions'
import {
  MEDIA_TYPES,
  QUALITIES,
  SPONSORBLOCK,
  TYPES,
  draftBody,
  draftFrom,
  emptyDraft,
} from './subscriptions'
import SubscriptionToggle from './SubscriptionToggle.vue'

const props = defineProps<{ subscription?: Subscription | null }>()
const emit = defineEmits<{ close: []; saved: []; deleted: [] }>()

const editing = computed(() => Boolean(props.subscription))

const draft = ref<SubscriptionDraft>(
  props.subscription ? draftFrom(props.subscription) : emptyDraft(),
)
const paused = ref(props.subscription?.paused ?? false)

const submitting = ref(false)
const submitError = ref('')

const confirmDelete = ref(false)
const deleteFiles = ref(false)
const deleting = ref(false)

const canSave = computed(() => Boolean(draft.value.url.trim() && draft.value.name.trim()))

async function save(): Promise<void> {
  submitting.value = true
  submitError.value = ''
  try {
    const body = { ...draftBody(draft.value), paused: paused.value }
    if (props.subscription) {
      await $fetch(`/api/subscriptions/${props.subscription.id}`, { method: 'PATCH', body })
    }
    else {
      await $fetch('/api/subscriptions', { method: 'POST', body })
    }
    emit('saved')
    emit('close')
  }
  catch (error) {
    submitError.value = statusMessageOf(error) || 'Could not save this subscription'
  }
  finally {
    submitting.value = false
  }
}

async function remove(): Promise<void> {
  if (!props.subscription) return

  deleting.value = true
  submitError.value = ''
  try {
    await $fetch(`/api/subscriptions/${props.subscription.id}`, {
      method: 'DELETE',
      query: { deleteFiles: deleteFiles.value ? 'true' : 'false' },
    })
    emit('deleted')
    emit('close')
  }
  catch (error) {
    submitError.value = statusMessageOf(error) || 'Could not delete this subscription'
  }
  finally {
    deleting.value = false
  }
}

function statusMessageOf(error: unknown): string {
  const failure = error as { statusMessage?: string; data?: { statusMessage?: string } }
  return failure?.data?.statusMessage || failure?.statusMessage || ''
}
</script>

<template>
  <div class="dialog-backdrop sub-backdrop" @click="emit('close')">
    <div class="dialog sub-dialog" role="dialog" aria-modal="true" @click.stop>
      <div class="sub-head">
        <span class="dialog-title sub-dialog-title">
          {{ editing ? 'Edit subscription' : 'Add subscription' }}
        </span>
        <span class="tag tag-accent sub-kind">{{ draft.type }} · {{ draft.mediaType }}</span>
      </div>

      <div class="field">
        <label for="sub-url">URL</label>
        <input
          id="sub-url"
          v-model="draft.url"
          class="input mono"
          placeholder="https://www.youtube.com/@channel"
        >
      </div>

      <div class="field">
        <label for="sub-name">Name</label>
        <input id="sub-name" v-model="draft.name" class="input" placeholder="Studio Vier">
      </div>

      <div class="grid-2">
        <div class="field">
          <label>Type</label>
          <SegmentedControl v-model="draft.type" :options="TYPES" />
        </div>
        <div class="field">
          <label>Media</label>
          <SegmentedControl v-model="draft.mediaType" :options="MEDIA_TYPES" />
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="sub-cron">Schedule (cron)</label>
          <input id="sub-cron" v-model="draft.cron" class="input mono" placeholder="0 */6 * * *">
        </div>
        <div class="field">
          <label for="sub-from">Only from (YYYYMMDD)</label>
          <input id="sub-from" v-model="draft.timerangeFrom" class="input mono" placeholder="20260101">
        </div>
      </div>

      <div class="field">
        <label>Max quality</label>
        <SegmentedControl v-model="draft.maxQuality" :options="QUALITIES" />
      </div>

      <div class="field">
        <label>SponsorBlock</label>
        <SegmentedControl v-model="draft.sponsorblock" :options="SPONSORBLOCK" />
      </div>

      <div class="field">
        <label for="sub-regex">Title filter (regex)</label>
        <input id="sub-regex" v-model="draft.titleRegex" class="input mono" placeholder="^Episode">
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="sub-args">Custom args</label>
          <input id="sub-args" v-model="draft.customArgs" class="input mono" placeholder="--embed-chapters">
        </div>
        <div class="field">
          <label for="sub-output">Output template</label>
          <input id="sub-output" v-model="draft.customOutput" class="input mono" placeholder="(global default)">
        </div>
      </div>

      <div class="toggles">
        <SubscriptionToggle
          v-model="draft.recordLivestreams"
          label="Record livestreams"
          hint="Start recording while a stream is still live"
        />
        <SubscriptionToggle
          v-model="draft.redownloadFreshUploads"
          label="Redownload fresh uploads"
          hint="Fetch again later so a still-processing upload gets its best quality"
        />
        <SubscriptionToggle
          v-model="draft.rssEnabled"
          label="Podcast RSS feed"
          hint="Expose a token-protected feed for this subscription"
        />
        <SubscriptionToggle
          v-model="paused"
          label="Paused"
          hint="No scheduled checks until this is switched off"
        />
      </div>

      <p v-if="submitError" class="sub-error">{{ submitError }}</p>

      <div v-if="editing" class="danger">
        <button
          v-if="!confirmDelete"
          class="btn btn-ghost danger-open"
          type="button"
          @click="confirmDelete = true"
        >
          Delete subscription
        </button>

        <template v-else>
          <label class="danger-check">
            <input v-model="deleteFiles" type="checkbox">
            Also delete the downloaded files from disk
          </label>
          <div class="danger-actions">
            <button class="btn btn-secondary sub-btn" type="button" @click="confirmDelete = false">
              Keep it
            </button>
            <button class="btn btn-primary sub-btn" type="button" :disabled="deleting" @click="remove">
              {{ deleting ? 'Deleting…' : 'Delete for good' }}
            </button>
          </div>
        </template>
      </div>

      <div class="dialog-actions">
        <button class="btn btn-secondary" type="button" @click="emit('close')">Cancel</button>
        <button
          class="btn btn-primary"
          type="button"
          :disabled="submitting || !canSave"
          @click="save"
        >
          {{ editing ? 'Save changes' : 'Add subscription' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sub-backdrop { z-index: 100; }
.sub-dialog {
  width: min(600px, 100%);
  max-height: calc(100vh - 2 * var(--space-4));
  gap: 12px;
  overflow-y: auto;
}

.sub-head { display: flex; align-items: baseline; gap: 10px; }
.sub-dialog-title { font-size: 18px; }
.sub-kind { font-size: 10px; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mono { font-family: ui-monospace, monospace; font-size: 12px; }

.toggles { border-top: 1px solid var(--color-divider); }

.sub-error {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--color-accent-100);
  color: var(--color-accent-800);
}

.danger { display: flex; flex-direction: column; gap: 8px; }
.danger-open { align-self: flex-start; font-size: 12px; }
.danger-check { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.danger-actions { display: flex; gap: 8px; }
.sub-btn { font-size: 12px; padding: 5px 12px; }
</style>
