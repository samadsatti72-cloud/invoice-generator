import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri's tauri.conf.json expects the dev server at localhost:1420 (see
  // "devUrl"). Without pinning this, Vite defaults to 5173 and silently
  // moves to 5174/5175/etc. whenever that port is already taken (e.g. an
  // old `npm run dev` left running in another terminal) — and Tauri just
  // waits forever for a server that's actually running on a different
  // port. strictPort makes Vite fail with a clear error instead of
  // drifting, so a stuck "Waiting for your frontend dev server..." loop
  // can't happen silently again.
  server: {
    port: 1420,
    strictPort: true,
  },
})