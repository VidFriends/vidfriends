import { createApp } from 'vue'
import App from './App.vue'
import { registerSW } from './registerServiceWorker'

// global css (create styles or use tailwind/bootstrap)
import './styles.css'

const app = createApp(App)
app.mount('#app')

registerSW()
