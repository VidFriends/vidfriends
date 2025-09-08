<template>
  <div class="login">
    <h2>Sign in</h2>
    <form @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" required />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required minlength="6" />
      </label>
      <div style="margin-top:8px">
        <button type="submit">Sign in</button>
        <button type="button" @click="signup">Register</button>
      </div>
      <p v-if="error" style="color:crimson">{{ error }}</p>
    </form>
  </div>
</template>

<script>
import { ref } from 'vue'
export default {
  emits: ['login'],
  setup(_, { emit }) {
    const email = ref('')
    const password = ref('')
    const error = ref(null)

    async function submit() {
      error.value = null
      try {
        // replace this with real /api/login Worker call
        const resp = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value, password: password.value })
        })
        if (!resp.ok) {
          // fallback for step1: simulate login success
          // throw new Error(await resp.text())
          const fakeToken = 'dev-token-' + btoa(email.value)
          emit('login', { token: fakeToken })
          return
        }
        const data = await resp.json()
        emit('login', data)
      } catch (err) {
        console.warn('Login error (dev fallback)', err)
        const fakeToken = 'dev-token-' + btoa(email.value)
        emit('login', { token: fakeToken })
      }
    }

    async function signup() {
      // Call /api/register when Workers ready. For step1 we fake it.
      alert('Register will be available when backend is configured. Using dev login instead.')
      submit()
    }

    return { email, password, submit, signup, error }
  }
}
</script>

<style scoped>
.login { max-width:380px; margin:0 auto }
label { display:block; margin:8px 0 }
input { width:100%; padding:8px; box-sizing:border-box }
button { padding:8px 12px; margin-right:6px }
</style>
