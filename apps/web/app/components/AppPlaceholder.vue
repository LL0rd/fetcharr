<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <section>
    <h4>{{ title }}</h4>
    <hr class="hr">
    <p class="text-muted">Not part of phase 1 — this screen arrives in a later phase.</p>
  </section>
</template>
