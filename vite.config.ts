import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * 測試掛鉤條件：只在 serve（dev server）且非 preview 時為 true；
 * 所有 build 一律 false。由 Vite define 於編譯期替換，不依賴 NODE_ENV。
 */
/**
 * 正規化 VITE_BASE：
 *  - 空值 → './'（相對路徑，asset 以相對於 index.html 的方式解析）
 *  - '/repo/' → '/repo/'；'repo' → '/repo/'；'/' → '/'
 *  - 完整網址（自訂網域）→ 去掉尾端斜線的 URL
 */
function normalizeBase(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return './';
  if (/^https?:\/\//i.test(v)) return v.replace(/\/+$/, '') + '/';
  if (v === '/' || v === './') return v;
  const trimmed = v.replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${trimmed}/`;
}

export default defineConfig(({ command, isPreview }) => {
  const devHook = command === 'serve' && !isPreview;

  // GitHub Pages 是 /<儲存庫名稱>/ 子路徑：以 VITE_BASE 注入實際值。
  // 未提供時退回相對路徑 './'（子路徑、自訂網域都能運作），不猜測儲存庫名稱。
  const base = normalizeBase(process.env.VITE_BASE);

  return {
    base,
    define: {
      __DEV_HOOK__: JSON.stringify(devHook),
      // 建置識別：讓診斷頁能顯示實際載入的是哪一次建置
      __BUILD_ID__: JSON.stringify(new Date().toISOString()),
    },
    build: {
      target: 'es2022',
      // 診斷頁只在 dev server 需要；正式包不得包含
      sourcemap: false,
      assetsInlineLimit: 0,
      rollupOptions: {
        // 兩個入口：遊戲主頁 + 音訊診斷頁（共用同一份 AudioManager 原始碼）
        // 正式包只保留遊戲入口；音訊診斷頁（dev 工具）不進 deploy 產物
        input: {
          main: resolve(__dirname, 'index.html'),
        },
        output: {
          manualChunks: { phaser: ['phaser'] },
        },
      },
    },
    // dev server 供容器內的瀏覽器通道使用；主機名以 IP 形式連線（openclaw-gateway）
    server: { host: '0.0.0.0', port: 5180, strictPort: true, allowedHosts: ['openclaw-gateway', 'foodsky-test', 'localhost'] },
    preview: {
      host: '0.0.0.0',
      port: 5181,
      strictPort: true,
      allowedHosts: ['openclaw-gateway', 'foodsky-test', 'localhost'],
    },
  };
});
