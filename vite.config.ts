import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveBase(): string {
  const raw = process.env.VITE_BASE_PATH?.trim();
  if (raw && raw !== '/' && raw !== '.') {
    const withLead = raw.startsWith('/') ? raw : `/${raw}`;
    return withLead.endsWith('/') ? withLead : `${withLead}/`;
  }
  const seg = process.env.GITHUB_REPOSITORY?.split('/')[1]?.trim();
  if (seg) return `/${seg}/`;
  return '/';
}

function pwaStartUrl(base: string): string {
  if (base === '/') return '/?source=pwa';
  return `${base.replace(/\/$/, '')}/?source=pwa`;
}

export default defineConfig(({ command }) => {
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown> & { version: string };

  if (command === 'build') {
    const segs = pkg.version.split('.');
    const major = parseInt(String(segs[0]), 10) || 0;
    const minor = parseInt(String(segs[1]), 10) || 0;
    const patch = (parseInt(String(segs[2]), 10) || 0) + 1;
    pkg.version = `${major}.${minor}.${patch}`;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  const base = resolveBase();

  return {
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['game_icon.svg', 'game_icon-192.png', 'game_icon-512.png'],
      manifest: {
        id: 'aegis',
        name: 'AEGIS',
        short_name: 'AEGIS',
        description: 'Healer dungeon simulator',
        categories: ['games', 'entertainment'],
        iarc_rating_id: 'e10f9f4f-8f15-41f8-a8f6-d3a1576db6e5',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        dir: 'ltr',
        orientation: 'portrait',
        scope: base,
        start_url: pwaStartUrl(base),
        icons: [
          {
            src: `${base}game_icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}game_icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}game_icon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        screenshots: [
          { src: `${base}screenshots/home.png`, sizes: '500x950', type: 'image/png' },
          { src: `${base}screenshots/select.png`, sizes: '500x950', type: 'image/png' },
          { src: `${base}screenshots/character.png`, sizes: '500x950', type: 'image/png' },
          { src: `${base}screenshots/talent.png`, sizes: '500x950', type: 'image/png' },
          { src: `${base}screenshots/levelUpgrade.png`, sizes: '500x950', type: 'image/png' },
          { src: `${base}screenshots/dungeon.png`, sizes: '500x950', type: 'image/png' },
          { src: `${base}screenshots/splash.png`, sizes: '500x950', type: 'image/png' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2,ttf,png,jpg,jpeg,webp,webmanifest,json}'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && ['style', 'script', 'worker', 'font'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets',
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && request.destination === '' && request.url.endsWith('.json'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'json-data',
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
};
});
