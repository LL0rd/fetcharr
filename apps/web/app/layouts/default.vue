<script setup lang="ts">
// Das URL-Feld sitzt im Header, der Dialog gehört über die ganze App — deshalb
// hält das Layout die URL, mit der geprobt wird.
const probeUrl = ref('')

// Ein frisch eingereihter Job soll sofort sichtbar sein, auch wenn der
// Ereignis-Stream erst eine Runde später nachzieht.
const queueReload = useState('queue-reload', () => 0)

function openDialog(url: string): void {
  probeUrl.value = url
}

async function onAdded(): Promise<void> {
  queueReload.value += 1
  await navigateTo('/')
}
</script>

<template>
  <div class="shell">
    <AppSidebar />
    <div class="shell-main">
      <AppHeader @fetch="openDialog" />
      <main class="shell-content">
        <slot />
      </main>
    </div>

    <AddDownloadDialog
      v-if="probeUrl"
      :key="probeUrl"
      :url="probeUrl"
      @close="probeUrl = ''"
      @added="onAdded"
    />
  </div>
</template>

<style scoped>
.shell { display: flex; height: 100vh; overflow: hidden; }
.shell-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.shell-content { flex: 1; overflow: auto; padding: 20px 24px 40px; }
</style>
