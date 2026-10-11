import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'WildSense — Offline AI Nature Companion',
        short_name: 'WildSense',
        description: 'A calm, private companion for noticing the natural world.',
        theme_color: '#173f32',
        background_color: '#f7f6ee',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/huggingface\.co\/Xenova\/vit-base-patch16-224\/resolve\/main\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wildsense-model-assets-v1',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 90, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});
