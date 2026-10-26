import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pdfjsAssets } from './scripts/pdfjsAssets.ts';

export default defineConfig(({ command }) => {
  return {
    // Relative base so the static build works from any path (GitHub Pages, a folder, file hosting).
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      pdfjsAssets(),
      // Serve the content Worker next to the SPA in `vite dev` only; the production build is untouched.
      ...(command === 'serve'
        ? [
            cloudflare({
              configPath: path.resolve(import.meta.dirname, 'worker/wrangler.jsonc'),
              // Share the publishers' local D1 state (the plugin appends `v3`).
              persistState: { path: path.resolve(import.meta.dirname, 'worker/.wrangler/state') },
              // The plugin defaults remote bindings to true; this service is local-only in dev.
              remoteBindings: false,
              config: (wranglerConfig) => {
                // In-memory overrides, never written to worker/wrangler.jsonc: only /v1/* reaches the
                // Worker (everything else stays with Vite), and the dev date matches the workerd
                // version bundled with this plugin (the worker's own 2026-10-19 needs a newer one).
                wranglerConfig.assets = { directory: './dist', run_worker_first: ['/v1/*'] };
                wranglerConfig.compatibility_date = '2026-10-13';
              },
            }),
          ]
        : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: './',
          name: 'Relire Plus - French close reading',
          short_name: 'Relire Plus',
          description:
            'Close reading for French: tap any word or sentence for an explanation, then read it aloud and get pronunciation feedback.',
          theme_color: '#F7F6F3',
          background_color: '#F7F6F3',
          display: 'standalone',
          start_url: './',
          scope: './',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Include the PDF worker and binary resources (not covered by the app's extensions), the licence and notice
          // text assets the About page links (data/lexicon), and the bundled lexicon data file the word sheet reads,
          // and sql.js wasm so first-time package import works offline after install/update too.
          globPatterns: [
            '**/*.{js,css,html,ico,png,svg,woff,woff2}',
            'pdfjs/**/*',
            'assets/**/*.{md,txt}',
            'assets/lexicon-*.json',
            'assets/sql-wasm-browser-*.wasm',
          ],
          // The bundled lexicon is 3,092,981 bytes (2.95 MiB) raw: just under the 3 MiB default, so raise it with a margin.
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  };
});
