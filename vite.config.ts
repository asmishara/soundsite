import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Tone.js alone is ~400 kB minified; the app is a single page, so one chunk is fine.
    chunkSizeWarningLimit: 800,
  },
})
