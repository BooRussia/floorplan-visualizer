import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // relative asset paths so the build works at boorussia.github.io/floorplan-visualizer/
  base: './',
  server: { port: 5199 },
})
