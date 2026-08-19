<script setup lang="ts">
definePageMeta({ layout: false })

const MIN_PASSWORD_LENGTH = 12

const mode = ref<'setup' | 'login'>('login')
const password = ref('')
const repeat = ref('')
const error = ref('')
const busy = ref(false)

const { data: status } = await useFetch<{ hasAdmin: boolean }>('/api/auth/status', { server: false })

watchEffect(() => {
  if (status.value) {
    mode.value = status.value.hasAdmin ? 'login' : 'setup'
  }
})

function select(next: 'setup' | 'login') {
  mode.value = next
  error.value = ''
}

async function submit() {
  error.value = ''
  if (mode.value === 'setup') {
    if (password.value.length < MIN_PASSWORD_LENGTH) {
      error.value = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      return
    }
    if (password.value !== repeat.value) {
      error.value = 'Passwords do not match'
      return
    }
  }

  busy.value = true
  try {
    await $fetch(mode.value === 'setup' ? '/api/auth/setup' : '/api/auth/login', {
      method: 'POST',
      body: { password: password.value },
    })
    await navigateTo('/', { replace: true })
  }
  catch (caught) {
    const message = (caught as { statusMessage?: string; data?: { statusMessage?: string } })
    error.value = message.data?.statusMessage ?? message.statusMessage ?? 'Something went wrong'
  }
  finally {
    busy.value = false
    password.value = ''
    repeat.value = ''
  }
}
</script>

<template>
  <div class="auth">
    <div class="auth-card elev-lg">
      <div class="brand">
        <span class="brand-mark" />
        <span class="brand-name">FETCHARR</span>
      </div>

      <div class="switch">
        <button type="button" :class="['switch-opt', { active: mode === 'setup' }]" @click="select('setup')">
          First-run setup
        </button>
        <button type="button" :class="['switch-opt', { active: mode === 'login' }]" @click="select('login')">
          Login
        </button>
      </div>

      <form class="form" @submit.prevent="submit">
        <template v-if="mode === 'setup'">
          <div class="field">
            <label for="password">Admin password</label>
            <input id="password" v-model="password" class="input" type="password" placeholder="Minimum 12 characters" autocomplete="new-password">
          </div>
          <div class="field">
            <label for="repeat">Repeat password</label>
            <input id="repeat" v-model="repeat" class="input" type="password" placeholder="Repeat" autocomplete="new-password">
          </div>
          <button class="btn btn-primary btn-block" type="submit" :disabled="busy">Create admin account</button>
        </template>

        <template v-else>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" v-model="password" class="input" type="password" placeholder="••••••••••••" autocomplete="current-password">
          </div>
          <button class="btn btn-primary btn-block" type="submit" :disabled="busy">Unlock</button>
        </template>
      </form>

      <p v-if="error" class="error">{{ error }}</p>
      <p class="footnote">single admin &middot; argon2 &middot; sealed session cookie</p>
    </div>
  </div>
</template>

<style scoped>
.auth { height: 100vh; display: grid; place-items: center; background: var(--color-bg); }
.auth-card {
  width: 380px; max-width: calc(100vw - 32px);
  display: flex; flex-direction: column; gap: var(--space-4);
  padding: 28px; background: var(--color-surface);
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark { width: 14px; height: 14px; background: var(--color-accent); }
.brand-name {
  font-family: var(--font-heading); font-weight: 800; font-size: 22px; letter-spacing: -0.01em;
}
.switch { display: flex; border: 1px solid var(--color-divider); }
.switch-opt {
  flex: 1; padding: 7px 12px; font-size: 13px; cursor: pointer;
  font-family: var(--font-body); color: var(--color-text);
  background: transparent; border: 0;
}
.switch-opt + .switch-opt { border-left: 1px solid var(--color-divider); }
.switch-opt:hover:not(.active) { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
.switch-opt.active { background: var(--color-accent); color: var(--color-bg); }
.form { display: flex; flex-direction: column; gap: 10px; }
.error { margin: 0; font-size: 12px; color: var(--color-accent-700); }
.footnote {
  margin: 0; font-family: ui-monospace, monospace; font-size: 10px;
  color: var(--color-neutral-600);
}
</style>
