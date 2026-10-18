import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  optimizeDeps: {
    include: [
      '@capacitor/core',
      '@capgo/capacitor-printer',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
    ],
  },
})
