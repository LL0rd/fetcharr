<template>
  <div class="shell">
    <AppSidebar />
    <div class="shell-main">
      <AppHeader />
      <main class="shell-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell { display: flex; height: 100vh; overflow: hidden; }
.shell-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.shell-content { flex: 1; overflow: auto; padding: 20px 24px 40px; }
</style>
