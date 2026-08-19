<script setup lang="ts">
import type { Subscription, SubscriptionList } from '~/components/subscriptions/subscriptions'
import { nextCheckLabel } from '~/components/subscriptions/subscriptions'
// Explizit importiert: der Verzeichnis-Präfix der Auto-Imports („Subscriptions")
// würde die Komponenten sonst SubscriptionsSubscriptionRow nennen.
import SubscriptionDialog from '~/components/subscriptions/SubscriptionDialog.vue'
import SubscriptionRow from '~/components/subscriptions/SubscriptionRow.vue'

const subscriptions = ref<Subscription[]>([])
const loading = ref(false)
const loadError = ref('')

const dialogOpen = ref(false)
const editTarget = ref<Subscription | null>(null)
const checking = ref(new Set<string>())

const summary = computed(() => {
  const count = subscriptions.value.length
  const label = `${count} ${count === 1 ? 'subscription' : 'subscriptions'}`
  return count ? `${label} · ${nextCheckLabel(subscriptions.value)}` : label
})

onMounted(() => void load())

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const result = await $fetch<SubscriptionList>('/api/subscriptions')
    subscriptions.value = result.subscriptions
  }
  catch {
    loadError.value = 'Could not load the subscriptions — is the API up yet?'
    subscriptions.value = []
  }
  finally {
    loading.value = false
  }
}

function openAdd(): void {
  editTarget.value = null
  dialogOpen.value = true
}

function openEdit(subscription: Subscription): void {
  editTarget.value = subscription
  dialogOpen.value = true
}

function closeDialog(): void {
  dialogOpen.value = false
  editTarget.value = null
}

/**
 * „Check now" setzt nur ein Flag; der Worker holt es ab. Bis die Liste das
 * nächste Mal lädt, hält der lokale Vermerk den Button ruhig.
 */
async function requestCheck(subscription: Subscription): Promise<void> {
  checking.value = new Set(checking.value).add(subscription.id)
  try {
    const result = await $fetch<{ subscription: Subscription }>(
      `/api/subscriptions/${subscription.id}/check`,
      { method: 'POST' },
    )
    replace(result.subscription)
  }
  catch {
    loadError.value = `Could not request a check for "${subscription.name}"`
  }
  finally {
    const next = new Set(checking.value)
    next.delete(subscription.id)
    checking.value = next
  }
}

/** Der Check-Endpoint liefert die Zeile ohne Archiv-Zähler zurück. */
function replace(updated: Subscription): void {
  subscriptions.value = subscriptions.value.map((entry) =>
    entry.id === updated.id ? { ...entry, ...updated } : entry,
  )
}
</script>

<template>
  <section>
    <div class="subs-head">
      <h4 class="subs-title">Subscriptions</h4>
      <span class="subs-summary">{{ summary }}</span>
      <button class="btn btn-primary subs-add" type="button" @click="openAdd">
        Add subscription
      </button>
    </div>

    <p v-if="loadError" class="subs-error">{{ loadError }}</p>

    <div class="subs-table">
      <div class="subs-header">
        <span>Name</span>
        <span>Type</span>
        <span>Schedule</span>
        <span>Quality</span>
        <span>Last check</span>
        <span>Archive</span>
        <span>Actions</span>
      </div>

      <SubscriptionRow
        v-for="subscription in subscriptions"
        :key="subscription.id"
        :subscription="subscription"
        :busy="checking.has(subscription.id)"
        @check="requestCheck(subscription)"
        @edit="openEdit(subscription)"
      />
    </div>

    <p v-if="!subscriptions.length && !loading" class="subs-empty">
      No subscriptions yet — add a channel or playlist and Fetcharr keeps it in sync.
    </p>

    <div class="subs-foot">
      Per-sub yt-dlp archive kept in DB · export as archive.txt · audio subs expose a
      token-protected podcast RSS feed
    </div>

    <SubscriptionDialog
      v-if="dialogOpen"
      :subscription="editTarget"
      @close="closeDialog"
      @saved="load"
      @deleted="load"
    />
  </section>
</template>

<style scoped>
.subs-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.subs-title { margin: 0; }
.subs-summary { font-size: 12px; color: var(--color-neutral-700); }
.subs-add { margin-left: auto; font-size: 12px; padding: 6px 14px; }

.subs-table { border-top: 2px solid var(--color-divider); }
.subs-header {
  display: grid;
  grid-template-columns: 1fr 84px 110px 96px 100px 90px 150px;
  gap: 10px;
  padding: 8px 10px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-neutral-700);
  border-bottom: 2px solid var(--color-divider);
}

.subs-error {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--color-accent-100);
  color: var(--color-accent-800);
}
.subs-empty { padding: 18px 0; font-size: 13px; color: var(--color-neutral-700); }
.subs-foot { margin-top: 14px; font-size: 11px; color: var(--color-neutral-600); }
</style>
