import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'picPac — машина времени для ваших фото',
        short_name: 'picPac',
        description: 'Фотокниги и печать со смартфона за 5 минут. Кот соберёт, Робот проверит.',
        lang: 'ru',
        theme_color: '#DD5757',
        background_color: '#F6F1EA',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        // новая сборка подхватывается сразу, без «залипания» старой версии в кэше
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          { urlPattern: /\/api\/catalog/, handler: 'StaleWhileRevalidate', options: { cacheName: 'catalog' } },
          { urlPattern: /\/api\/gallery\/file\//, handler: 'CacheFirst', options: { cacheName: 'gallery' } },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': { target: process.env.API_URL || 'http://127.0.0.1:8000', changeOrigin: true, ws: true } },
  },
})
