<script setup lang="ts">
defineProps<{ name: string; desc: string; disabled?: boolean }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    class="toggle-row"
    type="button"
    :disabled="disabled"
    :aria-pressed="model"
    @click="model = !model"
  >
    <span class="toggle-text">
      <span class="toggle-name">{{ name }}</span>
      <span class="toggle-desc">{{ desc }}</span>
    </span>
    <span class="tag" :class="model ? 'tag-accent' : 'tag-neutral'">{{ model ? 'on' : 'off' }}</span>
  </button>
</template>

<style scoped>
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 0;
  font: inherit;
  text-align: left;
  color: var(--color-text);
  background: none;
  border: 0;
  border-bottom: 1px solid var(--color-divider);
  cursor: pointer;
}
.toggle-row:disabled { opacity: 0.45; cursor: not-allowed; }
.toggle-text { display: flex; flex-direction: column; gap: 2px; }
.toggle-name { font-weight: 600; font-size: 13px; }
.toggle-desc { font-size: 11px; color: var(--color-neutral-700); }
</style>
