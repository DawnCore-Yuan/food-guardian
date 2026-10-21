import { defineConfig } from 'vite';

/**
 * 測試掛鉤條件：只在 serve（dev server）且非 preview 時為 true；
 * 所有 build 一律 false。由 Vite define 於編譯期替換，不依賴 NODE_ENV。
 */
export default defineConfig(({ command, isPreview }) => {
  const devHook = command === 'serve' && !isPreview;

  return {
    base: './',
    define: {
      __DEV_HOOK__: JSON.stringify(devHook),
    },
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
    preview: {
      host: '0.0.0.0',
      port: 5181,
      strictPort: true,
      allowedHosts: ['openclaw-gateway', 'foodsky-test', 'localhost'],
    },
  };
});
