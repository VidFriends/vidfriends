<template>
  <div>
    <h2>Your feed</h2>
    <div v-if="loading">Loading feed…</div>
    <div v-else>
      <div v-if="items.length === 0">No shared videos yet. Share one!</div>
      <div class="feed">
        <div v-for="item in items" :key="item.id" class="card">
          <div class="meta">
            <small>From: {{ item.sender_id || 'friend' }}</small>
            <small>{{ new Date(item.created_at || Date.now()).toLocaleString() }}</small>
          </div>
          <div class="embed" v-html="item.embed_code || item.fallbackHtml"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'

export default {
  props: ['apiBase'],
  setup(props) {
    const items = ref([])
    const loading = ref(true)

    async function loadFeed() {
      loading.value = true
      try {
        const resp = await fetch(`${props.apiBase}/links`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('shortshare_token') || ''}` }
        })
        if (!resp.ok) {
          // dev fallback demo item
          items.value = [{
            id: 'demo1',
            sender_id: 'alice',
            created_at: Date.now(),
            embed_code: `<iframe width="360" height="640" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
          }]
        } else {
          items.value = await resp.json()
        }
      } catch (err) {
        console.warn('Could not load feed, showing demo', err)
        items.value = [{
          id: 'demo1',
          sender_id: 'alice',
          created_at: Date.now(),
          embed_code: `<iframe width="360" height="640" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
        }]
      } finally {
        loading.value = false
      }
    }

    onMounted(loadFeed)

    return { items, loading, loadFeed }
  }
}
</script>

<style scoped>
.feed { display:flex; flex-direction:column; gap:12px }
.card { padding:12px; border:1px solid #eee; border-radius:8px }
.embed iframe { max-width:100%; height:auto }
.meta { display:flex; justify-content:space-between; color:#666; margin-bottom:8px; font-size:0.85rem }
</style>
