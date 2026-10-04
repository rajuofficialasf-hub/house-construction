import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// মক ব্যাকএন্ড (VITE_HOUSING_BACKEND=mock) এর ছবির URL এ প্লেসহোল্ডার SVG দেয়; শুধু dev সার্ভারে, শুধু মক মোডে
function mockPhotos(): Plugin {
  return {
    name: 'housing-mock-photos',
    apply: 'serve',
    configureServer(server) {
      if (process.env.VITE_HOUSING_BACKEND !== 'mock') return
      server.middlewares.use('/__mock-photos/', (req, res) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\//, ''))
        const label = path.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        res.setHeader('Content-Type', 'image/svg+xml')
        res.end(
          `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#cbd5e1"/><text x="400" y="300" font-size="28" text-anchor="middle" fill="#334155">${label}</text></svg>`,
        )
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), mockPhotos()],
  server: {
    host: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
