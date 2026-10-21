import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  server: { host: '0.0.0.0', port: 5180, strictPort: true },
  preview: { host: '0.0.0.0', port: 5181, strictPort: true, allowedHosts: ['openclaw-gateway','foodsky-test','localhost'] },
});
