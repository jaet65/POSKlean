import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
