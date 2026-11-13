import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // This app is deployed at the domain root on Vercel; public assets use `/` paths.
  base: '/',
  publicDir: 'public',
})
