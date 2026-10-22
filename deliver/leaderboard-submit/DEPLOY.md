# leaderboard-submit 修正版部署（Dashboard 手動替換）

本次修正：**通關但未全滅（例如 62 隻、11,930 分）被誤擋為「分數與擊破數不相符」**。
只改 `leaderboard-submit` 這一個 Edge Function；前端不需重新部署，也不用重玩一局才能驗證。

## 0. 改了什麼

舊規則（錯誤）：

```
score > RAW_MAX + 200 && kills < 63  → 拒絕
```

問題：把「生命獎勵上限」寫成 200（實際最多 5 × 200 = 1,000），且假設只有全滅 63 隻才可能拿高分。
時間到時仍有敵人在場（既沒擊破、也沒逃脫），62 隻 11,930 分完全合法卻被判不符。

新規則：

```
allowedMax = (擊破 k 隻的最高擊破分) + (通關 ? 1000 : 0)
score > allowedMax → 拒絕（bad_score，訊息仍是「分數與擊破數不相符」）
```

- 「擊破 k 隻的最高擊破分」＝官方敵人分值由高到低（200 / 180 / 150 / 150）取前 k 隻總和。
- 不要求 `kills + escapes = 63`。
- 未通關不得含生命獎勵（原本的檢查保留）。
- 版本白名單、ticket + token、伺服器時間、同局唯一（409）、分數硬上限 12,500、擊破上限 63 全部保留。

各擊破數上限：

| kills | 擊破分上限 | 通關上限 | 未通關上限 |
|---|---|---|---|
| 0 | 0 | 1,000 | 0 |
| 10 | 2,000 | 3,000 | 2,000 |
| 61 | 10,810 | 11,810 | 10,810 |
| 62 | 10,960 | 11,960 | 10,960 |
| 63 | 11,110 | 12,110 | 11,110 |

你的案例：62 隻 → 上限 11,960 ≥ 11,930 ✅（舊規則要求 kills = 63，所以被擋）。

## 1. 部署步驟（Supabase Dashboard）

1. Dashboard → 選專案 → 左側 **Edge Functions** → 點 **leaderboard-submit**。
2. 進入 function 的程式碼編輯／Deploy new version。
3. **整個檔案替換**為本目錄的 `leaderboard-submit.single.ts`
   （單檔版，`helpers.ts` 已內嵌，不需要另外上傳）。全選覆蓋，不要只貼片段。
4. 按 **Deploy**，等狀態變 Active／Deployed。
5. 確認 **Verify JWT** 仍為關閉（與原本一致，不要改）。
6. Secrets 不需更動：`LEADERBOARD_VERSIONS`、`LEADERBOARD_IP_SALT`、`SUPABASE_SERVICE_ROLE_KEY` 保持原值。

若改用 CLI：`supabase functions deploy leaderboard-submit --no-verify-jwt`
（repo 內 `supabase/functions/leaderboard-submit/index.ts` ＋ `_shared/helpers.ts` 已同步）。

## 2. 不用重玩就能驗證（拒絕方向）

到 Dashboard → Edge Functions → leaderboard-submit → **Test / Invoke**，或用 curl（帶 anon key）打一筆不合法的請求：

```bash
curl -s -X POST "https://PROJECT_REF.supabase.co/functions/v1/leaderboard-submit" -H "Authorization: Bearer ANON_KEY" -H "Content-Type: application/json" -d "{\"version\":\"official-180s-v2\",\"ticketId\":\"00000000-0000-0000-0000-000000000000\",\"token\":\"$(printf 'a%.0s' {1..64})\",\"score\":11961,\"outcome\":\"won\",\"elapsedMs\":180400,\"kills\":62,\"escapes\":0,\"nickname\":\"t\"}"
```

判讀：

| 回應 | 意義 |
|---|---|
| `bad_ticket`（403 本局識別或憑證無效） | **新程式已生效**：分數／擊破檢查先通過，才輪到 ticket 驗證 |
| `bad_score`「分數與擊破數不相符」 | **仍是舊程式**（部署未成功或舊版仍在跑） |

接著把 `score` 改成 **11930**、`kills` 保持 62 再打一次：也應回 `bad_ticket`，代表 11,930 不再被分數規則擋。
如此即可在不重玩的前提下確認規則已替換；真正寫入仍由你下一次正常遊玩完成。

## 3. 回滾

Dashboard 該函式的 **Deployments／Versions** 會保留舊版：選上一版 → Redeploy 即可。

## 4. 已知限制

- 這是合理性檢查，不是完整防作弊；改前端仍可送出「落在擊破數上限內」的假分數。
- 伺服器不知各敵人的實際生成數（容量跳過時可能少於 63），因此上限用「前 k 高」計算：偏寬鬆，但不會誤擋合法成績。
