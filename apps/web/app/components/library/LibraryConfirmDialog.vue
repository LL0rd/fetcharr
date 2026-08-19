<script setup lang="ts">
defineProps<{ title: string; body: string; confirmLabel: string; busy?: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <div class="dialog-backdrop confirm-backdrop" @click="emit('cancel')">
    <div class="dialog confirm" role="dialog" aria-modal="true" @click.stop>
      <span class="dialog-title confirm-title">{{ title }}</span>
      <p class="dialog-body confirm-body">{{ body }}</p>
      <div class="dialog-actions">
        <button class="btn btn-secondary" type="button" @click="emit('cancel')">Cancel</button>
        <button class="btn btn-primary" type="button" :disabled="busy" @click="emit('confirm')">
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-backdrop { z-index: 100; }
.confirm { width: min(420px, 100%); }
.confirm-title { font-size: 18px; }
.confirm-body { margin: 0; }
</style>
