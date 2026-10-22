# 排行榜｜部署與 Supabase 設定

> 版本：leaderboard v1（分支 `feat/leaderboard`）
> 本文件只包含**步驟與設定名稱**，不含任何密鑰值。

## 0. 名詞與邊界

| 設定 | 放在哪 | 是否會進入瀏覽器／Git |
|---|---|---|
| `VITE_LEADERBOARD_SUPABASE_URL` | 前端 `.env.local`／GitHub Repository variables | 是（公開） |
| `VITE_LEADERBOARD_SUPABASE_ANON_KEY` | 同上 | 是（公開，靠 RLS 限制） |
| `VITE_LEADERBOARD_VERSION` | 同上 | 是（公開） |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function secrets | 否（Supabase 內建，不需要手動提供給任何人） |
| `LEADERBOARD_IP_SALT` | Supabase Edge Function secrets | 否 |
| `LEADERBOARD_VERSIONS` | Supabase Edge Function secrets | 否 |
| 資料庫密碼 | 只在 Supabase 專案設定 | 否 |

「前端可公開設定」與「後端秘密設定」完全不共用檔案：前端只讀 `VITE_*`，後端只讀 Edge Function secrets。

## 1. Supabase 後台操作（依序做完即可）

1. **建立專案**：Dashboard → New project。記下 Project ref 與 Region。
2. **建立資料表與權限**：Dashboard → SQL Editor → 貼上 `supabase/migrations/0001_leaderboard.sql` → Run。
   - 這一步會建立 `run_tickets`、`scores`、`v_scores_public`、三個函式，並撤銷 anon 的資料表寫入權。
3. **部署 Edge Functions**（任一種方式）：
   - CLI：`supabase link --project-ref <ref>` → `supabase functions deploy leaderboard-start leaderboard-submit leaderboard-list`
   - 或 Dashboard → Edge Functions → Deploy new function，逐一貼上 `supabase/functions/*/index.ts`（`_shared/helpers.ts` 需一併上傳，CLI 會自動處理）。
3.1 **只更新 leaderboard-submit 時**：Dashboard → Edge Functions → leaderboard-submit → 全檔替換為
   `deliver/leaderboard-submit/leaderboard-submit.single.ts`（helpers 已內嵌）→ Deploy。逐步與驗證方式見
   `deliver/leaderboard-submit/DEPLOY.md`。

4. **確認 `verify_jwt`**：三個函式都要允許 anon 呼叫。CLI 部署時加上 `--no-verify-jwt`，或在 Dashboard 把 Verify JWT 關閉。
   - 原因：公開端只帶 anon key，函式本身已自行執行權限檢查；JWT 驗證不是本設計的防線。
5. **設定函式 secrets**（Dashboard → Edge Functions → Secrets）：
   - `LEADERBOARD_VERSIONS` = `official-180s-v1`
   - `LEADERBOARD_IP_SALT` = 隨機長字串（自己產生即可，不需給任何人）
   - `SUPABASE_SERVICE_ROLE_KEY`：Supabase 預設已提供；若未出現，在 Project Settings → API 取得後貼入 Secrets，**不要**貼到聊天或前端。
6. **取得公開設定**：Project Settings → API
   - Project URL → 對應 `VITE_LEADERBOARD_SUPABASE_URL`
   - anon public key → 對應 `VITE_LEADERBOARD_SUPABASE_ANON_KEY`
   - 這兩個值本來就會送到瀏覽器，可以公開。
7. **（選用）每日清理過期憑證**：Database → Extensions 啟用 `pg_cron`，在 SQL Editor 建立
   `select cron.schedule('lb-cleanup', '0 3 * * *', $$select public.leaderboard_cleanup(7)$$);`

## 2. GitHub Pages

1. 在 GitHub 建立儲存庫（帳號 `DawnCore-Yuan`），把本 repo 推上去。
2. Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
3. Settings → Secrets and variables → Actions → **Variables**（不是 Secrets，這三個值都可公開）：
   - `LEADERBOARD_SUPABASE_URL`
   - `LEADERBOARD_SUPABASE_ANON_KEY`
   - `LEADERBOARD_VERSION`（選填，預設 `official-180s-v1`）
   - `VITE_BASE`（選填；留空則自動使用 `/<儲存庫名稱>/`）
4. 推到 `master` 觸發 `.github/workflows/deploy-pages.yml`。
   - workflow 會跑 typecheck、排行榜邏輯測試、建置，並驗證正式包不含 dev 掛鉤與診斷頁。
5. 發佈網址為 `https://dawncore-yuan.github.io/<儲存庫名稱>/`。

### 子路徑與素材

- `vite.config.ts` 以 `VITE_BASE` 決定 `base`；未設定時為相對路徑 `./`。
- 圖片路徑（如 `assets/sprites/logo.png`）是相對路徑，在子路徑下會解析成 `/<repo>/assets/sprites/...`。
- 檢查方式：`dist/index.html` 中的 script 必須帶 `/<repo>/assets/` 前綴。

## 3. 本機驗證

```bash
npm run typecheck
npm run test:leaderboard        # 邏輯＋DOM 產出（SCRIPT-LEVEL）
npm run dev                     # 未設定 VITE_* 時進入「模擬資料」模式
npm run build                   # 正式包，不含 dev 掛鉤
```

瀏覽器級別驗收腳本：`npm run verify:leaderboard`（需本機有可用 Chromium，並設定 `CHROME_PATH`）。

## 4. 雲端接好後的驗收清單（尚未執行）

| 項目 | 方式 | 狀態 |
|---|---|---|
| 兩個獨立瀏覽器工作階段讀到同一份榜單 | 兩個 profile 各提交一次，重新整理後互相可見 | NOT TESTED |
| 正常提交 | 正式 180 秒關卡結束 → 登錄 → 名次正確 | NOT TESTED |
| 同局重試 | 同一 ticket 連送 2 次 → 第二次回 `duplicate: true`、資料表仍 1 筆 | NOT TESTED |
| 非法資料 | 超長暱稱、分數 > 30000、時間 < 180 秒 → 4xx 且無寫入 | NOT TESTED |
| 未授權寫入 | 直接 `POST /rest/v1/scores`（anon key）→ RLS 拒絕 | NOT TESTED |
| 手機暱稱輸入 | 橫向 844×390 實機：鍵盤不遮送出鈕 | NOT TESTED |
| 結算／再玩一次／回首頁 | 點擊流程不殘留遮罩、不重複監聽 | NOT TESTED |
| 排行榜故障時遊戲可玩 | 封鎖 `/functions/v1/*` 後開始遊戲與結算仍正常 | NOT TESTED |

## 5. 安全邊界（不誇大）

- 伺服器檢查暱稱、版本、分數上限、時間下限、單局憑證、提交頻率；資料庫唯一約束保證同一局只寫一次。
- 這些措施**不能**阻止玩家修改瀏覽器端程式碼後送出「看似合理」的分數；分數可信度上限就是「伺服器側合理性檢查」。
- 不在前端公開玩家識別、憑證或管理資訊；憑證只存在分頁記憶體，重載即失效。
