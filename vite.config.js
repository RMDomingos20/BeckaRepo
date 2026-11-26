import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ['index.html'] },
  // Cargo can generate HTML while the app is open. Watching it reloads the
  // WebView mid-analysis and discards the current frontend session.
  server: { watch: { ignored: ['**/target/**', '**/src-tauri/gen/**'] } },
  base: './', 
})
