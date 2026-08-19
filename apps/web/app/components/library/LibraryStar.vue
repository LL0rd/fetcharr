<script setup lang="ts">
// `readonly` macht aus dem Stern eine reine Anzeige — im Auswahlmodus ist die
// Karte selbst ein Button, und Buttons dürfen einander nicht enthalten.
const props = defineProps<{ active: boolean; size?: number; readonly?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const visible = computed(() => !props.readonly || props.active)

/** Als Anzeige darf der Klick durch — sonst würde er die Karte mit anwählen. */
function onClick(event: MouseEvent): void {
  if (props.readonly) return
  event.preventDefault()
  event.stopPropagation()
  emit('toggle')
}
</script>

<template>
  <component
    :is="readonly ? 'span' : 'button'"
    v-if="visible"
    class="star"
    :class="{ 'star-on': active, 'star-static': readonly }"
    v-bind="readonly ? {} : {
      type: 'button',
      title: active ? 'Remove from favorites' : 'Mark as favorite',
      'aria-pressed': active,
    }"
    @click="onClick"
  >
    <svg
      :width="size ?? 14"
      :height="size ?? 14"
      viewBox="0 0 24 24"
      :fill="active ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  </component>
</template>

<style scoped>
.star {
  display: inline-flex;
  padding: 2px;
  border: 0;
  background: transparent;
  color: var(--color-neutral-600);
  cursor: pointer;
}
.star:hover { color: var(--color-accent-600); }
.star-on { color: var(--color-accent); }
.star-static { cursor: inherit; }
.star-static:hover { color: var(--color-accent); }
.star svg { display: block; }
</style>
