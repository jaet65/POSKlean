import fs from 'node:fs'
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

let gitTag = ''
try {
  gitTag = execSync('git describe --tags --abbrev=0', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} catch {
  // fallback if git is not available or no tags exist
}
if (gitTag.startsWith('v')) {
  gitTag = gitTag.slice(1)
}

const appVersion = process.env.APP_VERSION || gitTag || pkg.version || '0.0.1'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isRelease = process.env.VITE_IS_RELEASE === 'true' || process.env.IS_RELEASE === 'true'
  const isDev = mode === 'development' || !isRelease

  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __IS_DEV__: JSON.stringify(isDev),
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
  }
})
