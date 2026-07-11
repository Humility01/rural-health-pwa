import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // Automatically updates service worker cache when new changes deploy
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      workbox: {
        // Essential offline caching targets: caches all structural layout file variants
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'RuralHealth Sync Core',
        short_name: 'RuralHealth',
        description: 'Offline-First Patient Registration & Health Record Management System',
        theme_color: '#004bf6', // Matches your custom Cobalt Blue branding palette
        background_color: '#f8fafc', // Clean blueprint workspace background slate
        display: 'standalone', // Hides browser URL UI bars to feel like a native client app
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Adapts gracefully across Android/iOS home screens
          }
        ]
      }
    })
  ]
});