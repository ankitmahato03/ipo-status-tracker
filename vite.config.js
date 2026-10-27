import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Used in proxy mode and for registrars browsers can't call directly (MUFG Intime);
    // needs the Express proxy running (npm run server).
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
  },
})
