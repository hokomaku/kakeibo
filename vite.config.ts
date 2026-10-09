import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project site: set this to '/kakeiobo/'.
  // For local development, '/' is fine.
  base: process.env.GITHUB_PAGES === 'true' ? '/kakeibo/' : '/',
})
