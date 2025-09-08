// src/registerServiceWorker.js
export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js')
        console.log('ServiceWorker registered', reg)
      } catch (err) {
        console.warn('ServiceWorker registration failed', err)
      }
    })
  }
}
