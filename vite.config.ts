import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  server: {
    // Proxy Yahoo Finance in dev to bypass CORS — the browser fetches /api/yf/...
    // and Vite transparently forwards it. In production, set VITE_YF_PROXY to a
    // CORS-enabled Worker URL (same CF Worker used for IPO data).
    proxy: {
      '/api/yf': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/yf', '')
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon.svg'],
      manifest: {
        name: 'Penny — Wealth Companion',
        short_name: 'Penny',
        description: 'Your private, AI-powered wealth companion. Local-first, AES-256 encrypted.',
        theme_color: '#00A86B',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mfapi\.in\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mfapi-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }
            }
          },
          {
            urlPattern: /^https:\/\/query1\.finance\.yahoo\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'yahoo-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    target: 'es2020'
  }
});
