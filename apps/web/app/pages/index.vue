<template>
  <section>
    <div class="queue-head">
      <h4>Queue</h4>
      <span class="text-muted queue-summary">no jobs yet</span>
    </div>
    <hr class="hr">
    <p class="text-muted">The queue fills up once the jobs API and the worker are wired in.</p>
  </section>
</template>

<style scoped>
.queue-head { display: flex; align-items: baseline; gap: 12px; }
.queue-head h4 { margin: 0; }
.queue-summary { font-size: 12px; }
</style>
