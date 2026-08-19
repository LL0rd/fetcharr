<script setup lang="ts">
defineProps<{ options: readonly string[] }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="seg-row">
    <button
      v-for="option in options"
      :key="option"
      class="seg-item"
      :class="{ 'seg-item-on': model === option }"
      type="button"
      @click="model = option"
    >
      {{ option }}
    </button>
  </div>
</template>

<style scoped>
.seg-row { display: flex; width: fit-content; border: 1px solid var(--color-divider); }

.seg-item {
  padding: 6px 12px;
  font: inherit;
  font-size: 12px;
  color: var(--color-text);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.seg-item + .seg-item { border-left: 1px solid var(--color-divider); }
.seg-item:hover { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
.seg-item-on,
.seg-item-on:hover { background: var(--color-accent); color: var(--color-bg); font-weight: 600; }
</style>
