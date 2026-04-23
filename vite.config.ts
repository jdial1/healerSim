import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8')) as { version: string };

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

const base = resolveBase();

function pwaStartUrl(): string {
  if (base === '/') return '/?source=pwa';
  return `${base.replace(/\/$/, '')}/?source=pwa`;
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        id: 'healersim',
        name: 'healerSim',
        short_name: 'healerSim',
        description: 'Healer dungeon simulator',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: pwaStartUrl(),
        icons: [
          {
            src: `${base}icon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
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
});
