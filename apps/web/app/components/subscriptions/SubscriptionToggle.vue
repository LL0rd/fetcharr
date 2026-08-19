<script setup lang="ts">
defineProps<{ label: string; hint: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button class="toggle" type="button" :aria-pressed="model" @click="model = !model">
    <span class="toggle-text">
      <span class="toggle-label">{{ label }}</span>
      <span class="toggle-hint">{{ hint }}</span>
    </span>
    <span class="tag toggle-state" :class="model ? 'tag-accent' : 'tag-neutral'">
      {{ model ? 'on' : 'off' }}
    </span>
  </button>
</template>

<style scoped>
.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 9px 0;
  font: inherit;
  text-align: left;
  color: var(--color-text);
  background: none;
  border: 0;
  border-bottom: 1px solid var(--color-divider);
  cursor: pointer;
}
.toggle-text { display: flex; flex-direction: column; gap: 2px; }
.toggle-label { font-size: 13px; font-weight: 600; }
.toggle-hint { font-size: 11px; color: var(--color-neutral-700); }
.toggle-state { font-size: 10px; }
</style>
