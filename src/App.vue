<template>
  <div class="app">
    <header class="header">
      <h1>ShortShare</h1>
    </header>

    <main class="main">
      <LoginForm v-if="!isAuthenticated" @login="onLogin" />
      <div v-else>
        <div class="topbar">
          <button @click="onLogout">Logout</button>
          <button @click="openShare">Share a link</button>
        </div>

        <Feed :apiBase="API_BASE" />
      </div>
    </main>

    <footer class="footer">Friends-only PWA prototype</footer>
  </div>
</template>

<script>
import { ref } from 'vue'
import LoginForm from './components/LoginForm.vue'
import Feed from './components/Feed.vue'

const API_BASE = import.meta.env.VITE_API_BASE || '/api' // set later for Workers endpoint

export default {
  components: { LoginForm, Feed },
  setup () {
    const token = ref(localStorage.getItem('shortshare_token'))
    const isAuthenticated = ref(!!token.value)

    function onLogin({ token: t }) {
      localStorage.setItem('shortshare_token', t)
      token.value = t
      isAuthenticated.value = true
    }

    function onLogout() {
      localStorage.removeItem('shortshare_token')
      token.value = null
      isAuthenticated.value = false
    }

    function openShare() {
      const url = prompt('Paste a short video URL (TikTok / YouTube / Instagram / Snapchat / Facebook):')
      if (!url) return
      // POST to /api/links later (Worker). For step 1 we just console log.
      fetch(`${API_BASE}/links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('shortshare_token') || ''}`
        },
        body: JSON.stringify({ url, receiver_id: 'friend-id' })
      }).then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(t) })
        alert('Link shared (or cached)!')
      }).catch(err => {
        console.error(err)
        alert('Could not share link (this app stub only). Check console.')
      })
    }

    return { isAuthenticated, onLogin, onLogout, openShare, API_BASE }
  }
}
</script>

<style>
/* Minimal styles — replace with Bootstrap/Tailwind later */
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; margin:0; }
.header { background:#0ea5a4; color:white; padding:12px; text-align:center }
.main { padding:16px; min-height:70vh }
.topbar { display:flex; gap:8px; margin-bottom:12px }
.footer { padding:12px; text-align:center; color:#666 }
</style>
