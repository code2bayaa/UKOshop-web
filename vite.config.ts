import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  // src/components/map.tsx hands maplibre its tile worker through `?worker&url`, and maplibre starts it
  // with `{ type: 'module' }`. Vite's default worker format is iife, so say es here or the worker is a
  // classic script loaded as a module — see the comment at that import for why it is wired up at all.
  worker: { format: 'es' },
  server: { port: 3000 },
})

export default config
