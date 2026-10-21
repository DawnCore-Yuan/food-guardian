import { defineConfig } from 'vite';
import { resolve } from 'node:path';

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
      // 建置識別：讓診斷頁能顯示實際載入的是哪一次建置
      __BUILD_ID__: JSON.stringify(new Date().toISOString()),
    },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      rollupOptions: {
        // 兩個入口：遊戲主頁 + 音訊診斷頁（共用同一份 AudioManager 原始碼）
        input: {
          main: resolve(__dirname, 'index.html'),
          'audio-diagnostic': resolve(__dirname, 'audio-diagnostic.html'),
        },
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
