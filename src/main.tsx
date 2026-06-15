import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
import { registerSW } from 'virtual:pwa-register'

// Catch dynamic import failures (due to new deployments/mismatched hashes) and force a full page reload.
const handleChunkError = (error: any) => {
  if (!error) return
  const errorMsg = typeof error === 'string'
    ? error
    : error.message || error.toString()

  const isChunkError =
    /loading chunk/i.test(errorMsg) ||
    /failed to fetch dynamically imported module/i.test(errorMsg) ||
    /importing a module script failed/i.test(errorMsg) ||
    /error loading dynamically imported module/i.test(errorMsg)

  if (isChunkError) {
    const now = Date.now()
    const lastReloadStr = sessionStorage.getItem('chunk-error-last-reload')
    const lastReload = lastReloadStr ? parseInt(lastReloadStr, 10) : 0

    // Prevent reloading more than once every 10 seconds to avoid infinite loops
    if (now - lastReload > 10000) {
      sessionStorage.setItem('chunk-error-last-reload', String(now))
      window.location.reload()
    }
  }
}

window.addEventListener('error', (e) => handleChunkError(e.error || e.message))
window.addEventListener('unhandledrejection', (e) => handleChunkError(e.reason))

registerSW({ immediate: true })

const router = getRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
