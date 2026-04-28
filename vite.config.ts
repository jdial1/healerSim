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
      includeAssets: ['game_icon.svg'],
      manifest: {
        id: 'aegis',
        name: 'AEGIS',
        short_name: 'AEGIS',
        description: 'Healer dungeon simulator',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: pwaStartUrl(base),
        icons: [
          {
            src: `${base}game_icon.svg`,
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
};
});
