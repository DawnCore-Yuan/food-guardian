# 網頁遊戲（食安防衛隊）｜區網預覽設定

> 固定網址：**http://192.168.1.20:5182/**
> Docker 名稱一律英文：Compose project `web-game`、container `web-game`。

## 檔案

| 檔案 | 用途 |
|---|---|
| `compose.preview.yml` | 獨立預覽服務（nginx:stable-alpine，5182→80），不影響 OpenClaw 或其他 Compose |
| `deploy/nginx-preview.conf` | 靜態檔服務；HTML `no-cache`；缺檔回 404，不用 index.html 掩蓋 |

> 修正紀錄（2026-10-22，Mac 端實測）：`location /` 改為 `try_files $uri $uri/ =404;`。
> 原寫法 `$uri $uri =` 第二個參數與最後一個 404 參數相同，等於少一層目錄檢查；改為 `$uri/` 後，
> 目錄請求走 `index`，缺失的檔案仍回 404（實測 `/assets/not-exist.js` → 404，未以 index.html 掩蓋）。

## 路徑解析

- 兩個 bind mount 的相對路徑都由 **compose.preview.yml 所在目錄**解析，因此必須在遊戲 repo 根目錄執行。
- `./dist` 可用環境變數 `FOOD_GUARDIAN_DIST` 覆寫（指向其他建置輸出）。
- `create_host_path: false`：檔案不存在時直接報錯，不會自動建立空目錄把錯誤藏起來。

## 建置方式（兩種輸出不可互相覆蓋）

| 用途 | 指令 | index.html 引用 |
|---|---|---|
| 區網預覽（根目錄） | `npm run build` | `./assets/...` 相對路徑 |
| GitHub Pages（子路徑） | `VITE_BASE=/food-guardian/ npm run build` | `/food-guardian/assets/...` |

Pages 由 GitHub Actions 在 CI 內獨立建置（workflow 會跑自己的 `npm run build`），本機 `dist` 只需保持區網版；若要本機預覽 Pages 版，請用 `--outDir dist-pages` 另外輸出，不要覆蓋 `dist`。

## 前置條件

1. 已執行 `npm run build`，且 `dist/index.html` 存在（`create_host_path: false` 下缺檔會直接失敗）。
2. Mac 端 5182 沒有被其他程序占用（舊的 Python `http.server` 需先由你自行 Ctrl+C 停止）。

## Mac 端操作順序（由使用者執行）

```bash
cd /Users/scy/.openclaw/workspace/projects/food-guardian

# 1. 核對 Docker 環境
docker context ls

# 2. 核對既有 web-game 容器與 5182 占用
docker ps -a --filter "name=web-game"
lsof -nP -iTCP:5182 -sTCP:LISTEN

# 3. 建置區網版 dist（相對路徑）
npm run build

# 4. 驗證 compose 設定（不啟動）
docker compose -f compose.preview.yml config

# 5. 確認舊 Python 服務已由你按 Ctrl+C 停止後，才啟動
docker compose -f compose.preview.yml up -d

# 6. 檢查容器狀態與回應
docker ps --filter "name=web-game"
curl -sSI http://127.0.0.1:5182/            | head -n 5
curl -sSI http://192.168.1.20:5182/         | head -n 5
curl -s  http://192.168.1.20:5182/ | grep -o 'src="[^"]*"'   # 應為 ./assets/main-*.js
JS=$(curl -s http://192.168.1.20:5182/ | grep -o 'assets/main-[^"]*')
curl -sI "http://192.168.1.20:5182/$JS"     | head -n 3      # 應 200 text/javascript
curl -sI http://192.168.1.20:5182/assets/not-exist.js | head -n 1   # 應 404
```

## 驗證狀態

| 項目 | 狀態 |
|---|---|
| 設定檔撰寫與讀回檢查 | 完成（YAML 欄位與 nginx 指令逐項核對） |
| `docker compose config` | Mac 端已執行（容器已啟動） |
| 容器啟動 | **Mac 端已實測**：`web-game` 執行中，5182→80 |
| `http://127.0.0.1:5182/` | **Mac 端已實測 200** |
| `http://192.168.1.20:5182/` | **Mac 端已實測 200** |
| `/assets/not-exist.js` | **Mac 端已實測 404**（未以 index.html 掩蓋） |
| `nginx -t` 與 reload（修正後） | **Mac 端已實測通過** |

> 以上結果由使用者在 Mac 端執行後回報；Gateway 內無 Docker CLI，無法自行複驗。

## 固定做法

往後區網預覽固定使用 `web-game` 容器與 5182，不再手動啟動 Python `http.server`。

## 界線

- 不安裝 Docker 到 Gateway、不掛 Docker socket、不改 OpenClaw 主 Compose。
- 不動一海香容器與 4180。
- 不改 `audio.ts`、玩法、排行榜規則、Supabase 或技能。
- 不設反向代理、不綁公開網域；只供區網預覽。
