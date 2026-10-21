# 《食安防衛隊》Phase 1 v1.1 規格完善與模組設計

- 文件版本：**v1.1-draft-4**（2026-10-21 09:5x UTC 集中補正）
- 版本系列：draft-1 → draft-2 → draft-3 → **draft-4（本版）**；單一 `spec.md`
- 狀態：**設計提案，尚未核准**；未建立專案、未初始化 Git、未安裝依賴、未啟動服務、未撰寫實作
- 標記：**已確認**／**建議待確認**／**初始調校值**／**待查證（不進玩家畫面）**

## 0. 本輪（draft-3 → draft-4）修正對照

| # | 章節 | 修正 | 依據 |
|---|---|---|---|
| E1 | §7–§12.5 | 物理時間策略改寫；`world.update(time, delta)` 的 delta 為**毫秒**，`step(delta)` 為**秒** | Phaser 4.2.1 `World.js` L945/L1025 |
| E2 | §12.5 | 移除「兩者不可能漂移」；改列 A 階段 A/B 方案待驗證 | 未實測 |
| E3 | §6.2 | `settled` 只在終止事件設為 true；補 H1–H4 驗收案例 | 命中規則 |
| E4 | §5.2 | 異物尖兵改單次預警→衝刺→離場，刪除循環 | 行為統一 |
| E5 | §5.1 | 污染雲怪統一為「停留一次、預警後射一發」；刪 3 秒重複攻擊 | 規格自相矛盾 |
| E6 | §7.1–7.3 | 子批數更正 26→**31**；第二段峰值時刻改 **99.8s**；補齊 G5 候選 Y；峰值重算為 **13** | 重新展開與事件模擬 |
| E7 | §11 | 資料唯一歸屬：hp/score/elapsedMs 只歸 RunState，outcomeSettled 只歸 GameFlow | 消除重複 |
| E8 | §9.1、§11.1 | 觸控分指處理；暫停選單移到不暫停的 UIScene | 多指與暫停衝突 |
| E9 | §7.6 | 通關條件改「敵 0 且敵彈 0」；190s 先結算後 0.3s 淡出 | 玩家射擊不應卡住通關 |
| E10 | §7.8 | 新增玩家速度、子彈速度、碰撞體、子彈回收 | 數值集中 |
| E11 | §8 | K7 移除無依據的「食材驗收」；待查證字樣不進玩家圖鑑 | 來源不足 |
| E12 | §18 | 移除 `npm create vite@latest`；改固定版本手寫骨架 | 版本浮動 |
| E13 | 附錄 A | 專案位置、Git、預覽提案 | 本輪交付要求 |
## 1. 規格來源檢索

**未取得先前規格全文。** 容器可讀範圍未找到遊戲專案；Mac 主機其他位置未確認。

| 來源 | 版本／時間 | 性質 |
|---|---|---|
| 曉杰 06:53 訊息 | 2026-10-21 | 七項已定案 |
| 本人設計稿（05:47／06:52） | 2026-10-21 | 我的草案，舊名「食安空防線」，無決策效力 |
| v1.1 要求（07:19） | 2026-10-21 | 完整條目 |
| v1.1-draft-1（07:22） | 2026-10-21 | 首次成文 40,581 bytes |
| 三項決策（07:55） | 2026-10-21 | 技術棧、節奏、素材 |
| v1.1-draft-2（07:58） | 2026-10-21 | 波次與計時補正 |
| **v1.1-draft-3（本版）** | 2026-10-21 | 精確核算、自然退場、時間策略、素材、技能紀錄 |

---

## 2. 已確認決策 vs 建議待確認

| # | 項目 | 狀態 | 內容 |
|---|---|---|---|
| 1 | 名稱 | 已確認 | 《食安防衛隊》 |
| 2 | 類型 | 已確認 | 原創食品安全主題橫向射擊 |
| 3 | 玩法參考 | 已確認 | SiaHalawani/2D-Shouter-Game（**僅概念**，無授權） |
| 4 | 原創性 | 已確認 | 主角、三敵人核心造型與識別原創 |
| 5 | 美術風格 | 已確認 | 卡通科普風 |
| 6 | Phase 1 敵人 | 已確認 | 三種 |
| 7 | Boss | 已確認 | 延 Phase 2 |
| 8 | 先設計後開發 | 已確認 | 本文件核准後才建專案 |
| 9 | 技術棧 | 已確認 | Phaser 4.2.1＋TypeScript＋Vite；精確版本＋lockfile；不自行升主版本 |
| 10 | 關卡節奏 | 已確認 | 180 秒、三段遭遇、最多 10 秒收尾；調校須記錄原因 |
| 11 | 素材 | 已確認 | 混合：核心造型原創；CC0 輔助；OFL 字型；MIT/ISC/Apache-2.0 程式依賴；逐項存證；不推定同倉授權；不委製不採購 |
| 12 | 同屏容量 16 | **方向已接受，未視為效能驗證** | 本文以自然退場重新核算 |
| 13 | 自動捲動、無重力/跳躍 | 建議待確認 | §4 |
| 14 | 生命 5／無敵 1.2s／射速 0.18s | 建議待確認（初始調校值） | §6 |
| 15 | 波次內容（18 群 87 隻） | 建議待確認（初始調校值） | §7 |
| 16 | 邏輯畫布 1280×720 | 建議待確認 | §9 |
| 17 | 科普文案 | 部分已查證；P1/P2 **不得上線** | §8 |
| 18 | 子路徑部署 | 設定方案，NOT TESTED | §10.4 |

---

## 3. 產品定位與範圍

**目標**：一般玩家用 3～5 分鐘一局，認識生物性／化學性／物理性三類食品安全危害與基本預防。

**Phase 1**：單人、單一難度、一關三段、三敵人一武器、桌面鍵盤＋手機橫向觸控、繁體中文、首頁／教學／遊戲／暫停／結算／圖鑑、音效開關、降低動態、本機最高分與設定。

**不納入**：Boss、多人、登入、雲端排行榜、付費、背包、技能樹、武器商店、程序生成關卡、後端、執行期 AI API。

**Phase 2 方向（不預留空殼）**：Boss、難度選擇、更多危害角色、成就、多語系。

---

## 4. 核心玩法

1. 玩家操作原創「食安巡檢載具」，在可玩區上下左右移動（無重力）。
2. 背景向左捲動，敵人自右側進場。
3. 固定向右發射「防護能量彈」。
4. 無跳躍、無平台、無地形碰撞。
5. 能量彈是**抽象遊戲機制**，不對應任何真實消毒方法。
6. 敵人不得畫在正常食品上，避免「打過就能吃」的暗示。

### 4.1 與參考遊戲的差異

參考專案（Canvas＋原生 JS）：八方向移動、Q/A/Z 三向射擊、W/X 瞬移、集氣與補給、Boss；**無 LICENSE**（API `license: null`）。

| 面向 | 參考專案 | 本提案 |
|---|---|---|
| 射擊方向 | 前/上/下 | 固定向右 |
| 瞬移／集氣／補給 | 有 | 無 |
| Boss | 有 | Phase 1 無 |
| 物理 | 自寫 | Phaser Arcade Physics |

差異為本提案設計，**不是原專案功能**。

### 4.2 操作

| 動作 | 桌面 | 手機橫向 |
|---|---|---|
| 移動 | WASD／方向鍵 | 左側八方向盤 |
| 射擊 | Space／J（按住連射） | 右側按住區 |
| 暫停 | Esc／P | 右上獨立鈕 |

失焦、切分頁、`pointercancel`、指離開 → 清空輸入並自動暫停；回來後手動恢復。只在遊戲取得焦點時 `preventDefault`。
## 5. 三種敵人（v1.1-draft-4）

| 項目 | A 菌團怪 | B 污染雲怪 | C 異物尖兵 |
|---|---|---|---|
| 危害分類 | 生物性 | 化學性 | 物理性 |
| 輪廓 | 圓形群落 | 雲狀波浪 | 明顯尖角 |
| 初始生命 | 2 | 3 | 1 |
| 擊破分 | 100 | 150 | 120 |
| 生成 X | 1280 | 1280 | **1380**（畫面外右側） |
| 移動速度 | 90 px/s 直線向左 | 60 px/s 波浪向左 | 預警後 420 px/s 衝刺 |
| 尺寸 | 64×64 | 96×64 | 56×56 |
| 預警 | 無 | 0.6s（停留期間） | **0.6s（靜止原地）** |
| 攻擊 | 無 | 停留時射 1 發 | 一次衝刺 |
| 停留 | 無 | 2.0s，一隻一次 | 無 |
| 科普名稱 | 微生物污染風險 | 化學物質殘留風險 | 異物污染風險 |

### 5.1 污染雲怪（單次停留、單次射擊）

| 項目 | 定義（初始調校值） |
|---|---|
| 進入停留 | 向左移動至 **X ≤ 900**，且本次尚未停留 |
| 停留時長 | **2.0 秒**，每隻僅一次 |
| 停留期間移動 | 水平 0；垂直正弦漂浮振幅 24px、週期 2.4s |
| 預警 | 停留 **0～0.6s** 為預警（顯示攻擊指示） |
| 射擊 | 在 **0.6s** 發射 **1 發**向左直行彈（速度 260 px/s），**每隻僅一次** |
| 恢復移動 | 2.0s 結束後恢復 60 px/s 向左 |
| 多次攻擊 | **移除**：不再有「3 秒間隔重複射擊」 |
| 自然總時長 | 1220/60 ＝ 20.33s ＋ 2.0s ＝ **22.33s** |

### 5.2 異物尖兵（一次預警、一次衝刺、離場）

| 項目 | 定義（初始調校值） |
|---|---|
| 進場 | 生成於 X=1380（畫面外），以 150 px/s 移到 X=1280 停下 |
| 預警 | **0.6s 完全靜止**，顯示衝刺方向指示 |
| 衝刺 | 0.6s 後起衝，**420 px/s 直線向左，方向鎖定，不追蹤** |
| 預警期間移動 | **不移動** |
| 退場 | 衝刺至 **X < 60** 即離場（逃脫），**不再回頭、不再預警** |
| 舊版循環 | **已刪除** `EXIT_RIGHT → WARN` 反覆循環 |
| 自然總時長 | 0.6s 預警 ＋ (1380−60)/420 ＝ 3.14s ≈ **3.74s** |

### 5.3 狀態機

```
菌團怪：ENTER → MOVING →(HIT)*→ DEAD | ESCAPED
污染雲怪：ENTER → MOVING →(X<=900)→ HOVER(2s: 0–0.6s 預警, 0.6s 射 1 發) → MOVING → ESCAPED | DEAD
異物尖兵：ENTER →(X<=1280)→ WARN(0.6s, 靜止) → DASH(420) → ESCAPED | DEAD
```

## 6. 戰鬥規則與初始數值

| 項目 | 值 |
|---|---|
| 玩家生命 | 5（初始調校值） |
| 基本彈傷害 | 1 |
| 射擊間隔 | 0.18s（初始調校值） |
| 受傷無敵 | 1.2s，不重複扣血 |
| 玩家彈 | 命中首個目標即回收 |
| 敵方彈 | 命中即回收 |
| 撞擊玩家的敵人 | 退出本遭遇 |
| 逃出左界 | 不扣血、不給分 |
| 生命歸零 | 立即失敗 |
| 補血／掉寶／連擊 | 無 |

**計分**：總分 ＝ Σ擊破分 ＋（勝利時剩餘生命 × 200）。

### 6.1 同一步事件的優先序

```
1 讀輸入 → 2 物理 step → 3 碰撞與傷害 → 4 擊破標記 → 5 生命歸零→LOST（不再判勝利）
→ 6 關卡結束判定 → 7 UI 更新
```

**同時生成與退場的處理順序**（決定峰值與碰撞歸屬）：
1. 同一時刻先處理**退場**（逃脫／擊破回收），再加入場；
2. 入場敵人本步不與玩家產生碰撞（以 `enteredAt` 標記，至少 1 步後才可碰撞）；
3. 同一敵人同時被兩顆子彈命中，只結算第一次命中（`settled` 先設為 true）。

---

## 7. 關卡、波次與容量

### 7.1 用語

- **波次群（wave group）**：排程的一筆，含觸發時間與 1～3 個子批。
- **生成子批（spawn batch）**：同敵種的連續生成，一個子批 = 一次「敵種 × 數量 × 間隔」宣告。
- 本關共 **18 個波次群、31 個生成子批、87 隻敵人**（菌團怪 48、污染雲怪 26、異物尖兵 13）。
  > 更正：draft-3 寫「26 個子批」是錯的，逐一展開為 31。

**子批間隔定義（唯一解讀）**：同一群內，**後一個子批的第一隻**與**前一個子批的最後一隻**相隔 `gapBetweenBatchesMs`；同子批內相鄰兩隻相隔該子批的 `gapMs`。表格中的所有時刻都由這條規則展開，不另外解讀。

### 7.2 完整生成時間表（保留毫秒為唯一資料來源）

排程以 **毫秒** 儲存（`src/data/waves.ts`），文件顯示才四捨五入到 0.1 秒。

| 群 | 觸發(ms) | 子批 | 敵種×數量 | Y 座標（候選或固定） | 子批內間隔 | 群內間隔 | 展開時刻（秒） |
|---|---|---|---|---|---|---|---|
| G1 | 4000 | 1 | 菌×3 | 300, 420, 520 | 900 | — | 4.0, 4.9, 5.8 |
| G2 | 12000 | 1 | 菌×4 | 200, 320, 450, 560 | 700 | — | 12.0, 12.7, 13.4, 14.1 |
| G3 | 22000 | 1 | 菌×5 | 160, 280, 400, 510, 600 | 600 | — | 22.0, 22.6, 23.2, 23.8, 24.4 |
| G4 | 32000 | 1 | 菌×4 | 240, 360, 480, 580 | 550 | — | 32.0, 32.5, 33.1, 33.6 |
| G5 | 42000 | 1 | 菌×6 | **從候選集抽 6**：160, 220, 280, 340, 400, 460, 520, 580 | 500 | — | 42.0, 42.5, 43.0, 43.5, 44.0, 44.5 |
| G6 | 52000 | 1 | 菌×5 | 180, 300, 420, 540, 620 | 500 | — | 52.0, 52.5, 53.0, 53.5, 54.0 |
| G7 | 60000 | 2 | 雲×1 / 雲×1 | 250 / 470 | 1200 | 1200 | 60.0, 62.4 |
| G8 | 68000 | 2 | 菌×3 / 雲×1 | 200,330,470 / 560 | 800 | 800 | 68.0, 68.8, 69.6, 71.2 |
| G9 | 78000 | 1 | 雲×3 | 200, 380, 550 | 1000 | — | 78.0, 79.0, 80.0 |
| G10 | 88000 | 2 | 菌×4 / 雲×2 | 170,300,430,560 / 250,490 | 700 | 700 | 88.0, 88.7, 89.4, 90.1, 91.5, 92.2 |
| G11 | 98000 | 1 | 雲×4 | 170, 300, 440, 580 | 900 | — | 98.0, 98.9, 99.8, 100.7 |
| G12 | 108000 | 2 | 菌×3 / 雲×3 | 210,350,500 / 170,330,590 | 600 | 600 | 108.0, 108.6, 109.2, 110.4, 111.0, 111.6 |
| G13 | 120000 | 2 | 尖×1 / 尖×1 | 220 / 500 | 1400 | 1400 | 120.0, 122.8 |
| G14 | 128000 | 2 | 尖×2 / 菌×3 | 260,470 / 180,340,520 | 800 | 800 | 128.0, 128.8, 130.4, 131.2, 132.0 |
| G15 | 138000 | 3 | 菌×2 / 雲×2 / 尖×1 | 200,360 / 280,520 / 430 | 700 | 700 | 138.0, 138.7, 140.1, 140.8, 142.2 |
| G16 | 148000 | 3 | 菌×3 / 雲×3 / 尖×2 | 190,320,450 / 220,380,560 / 260,500 | 600 | 600 | 148.0, 148.6, 149.2, 150.4, 151.0, 151.6, 152.8, 153.4 |
| G17 | 158000 | 2 | 雲×3 / 尖×3 | 200,360,520 / 250,420,580 | 700 | 700 | 158.0, 158.7, 159.4, 160.8, 161.5, 162.2 |
| G18 | 168000 | 3 | 菌×3 / 雲×3 / 尖×3 | 180,330,480 / 230,390,550 / 210,400,590 | 650 | 650 | 168.0, 168.7, 169.3, 170.6, 171.3, 171.9, 173.2, 173.8, 174.5 |

- G5 的 8 個候選值已完整列出，seed 只決定**從候選集取哪 6 個 Y**，不改變數量或時刻。
- 最後生成 **174.5s**，仍在 180s 停止生成前。

### 7.3 容量核算（事件時刻精確法）

**方法**：87 隻展開為 174 個事件（87 生成 + 87 退場），依時間排序；**同刻先處理退場（k=-1）再處理生成（k=+1）**，取瞬時在場最大值的所有事件邊界。

**生命週期假設（最終行為）**：

| 敵人 | 生成 X | 退場 | 速度 | 移動時間 | 停留／預警 | 自然生命週期 |
|---|---|---|---|---|---|---|
| 菌團怪 | 1280 | X<60 | 90 | 13.56s | — | **13.56s** |
| 污染雲怪 | 1280 | X<60 | 60 | 20.33s | 2.0s 停留（含 0.6s 預警、1 發） | **22.33s** |
| 異物尖兵 | **1380** | X<60 | 420（衝刺） | (1380−60)/420 ＝ 3.14s | 0.6s 預警**靜止** | **3.74s** |

污染雲怪停留期間水平速度 0，故完整計入生命週期；異物尖兵預警 0.6s 原地不動，也計入。

#### 7.3.1 不套容量限制（理論峰值）

| 段 | 峰值 | 時刻 |
|---|---|---|
| 第一段 0–60s | **11** | 54.0s |
| 第二段 60–120s | **12** | **99.8s** |
| 第三段 120–180s | **13** | 161.5s |
| 全程 | **13** | 161.5s |

> 更正兩處：draft-3 寫第二段峰值 12「約 112s」，精算為 **99.8s**；異物尖兵改為單次衝刺離場後生命週期縮短，第三段峰值由 14 降為 **13**。

#### 7.3.2 套用容量上限

| 情境 | 第一段 | 第二段 | 第三段 | 全程 | 跳過 |
|---|---|---|---|---|---|
| 無限制 | 11 | 12 | 13 | 13 | 0 |
| 上限 10 | 10 | 10 | 10 | 10 | **7 隻**（1/2/4） |
| **上限 16（已確認）** | 11 | 12 | 13 | **13** | **0** |

距離上限 16 有 **3 隻餘裕**；G17/G18 間隔調整（0.5→0.7／0.65s）保留，作為未來調校空間。

#### 7.3.3 跳過生成（安全網，本版不觸發）

在場數 ≥ 上限即跳過，**不延後、不補發**；計入 `RunState.spawnSkipped[type]`；驗收斷言「實際生成 = 排程 − Σ跳過」；不顯示給玩家。

### 7.4 退場機制

| # | 機制 | 觸發 | 表現 |
|---|---|---|---|
| 1 | 擊破 | 生命歸零 | 擊破特效＋音效，計分一次 |
| 2 | 碰撞玩家 | 重疊 | 受擊特效，敵人退出 |
| 3 | 自然離場 | 菌／雲 X<60；尖兵衝刺至 X<60 | 正常離場 |
| 4 | 收尾清除 | 190.000s | 見 §7.6 |

**無 12 秒強制清除。** 防卡死保護只在 §7.6 的 190s 硬邊界觸發，且**先結算、後淡出**。

### 7.5 波次間隔調整（保留）

| 群 | 調整前 | 調整後 |
|---|---|---|
| G17 | 0.5s | 0.7s |
| G18 | 0.5s | 0.65s |

理由：加入雲怪 2s 停留後餘裕過窄；不提高上限，只調間隔。最後生成 174.5s。

### 7.6 收尾與 190 秒邊界（先結算、後淡出）

| 時點 | 行為 |
|---|---|
| 180.000s | 停止生成，state → `finishing` |
| 180–190s | 既有敵人仍可攻擊；玩家仍可射擊；碰撞計分照常 |
| **通關條件** | **敵人數 = 0 且敵方投射物數 = 0**；玩家自己的子彈不計入（持續射擊不阻止通關） |
| 190.000s | ① 停止戰鬥（不再生成、不再發射、不再傷害、不再加分）→ ② 生命 ≤0 判 LOST → ③ 否則剩餘敵人標記逃脫 → ④ 清空敵彈 → ⑤ 判 WON |
| 190.000s 之後 | **才**播放 0.3s 裝飾淡出；淡出期間不傷害、不生成、不加分，**不延長有效遊戲時間** |

### 7.7 勝敗只結算一次

`GameFlow.outcomeSettled` 是**唯一權威位置**（RunState 只是快照副本，不另存旗標）。

```
settle(outcome):
  if gameflow.outcomeSettled: return
  gameflow.outcomeSettled = true
  → 寫 RunResult → 切 WON/LOST → 更新最高分
```

### 7.8 碰撞與移動基準（初始調校值）

| 項目 | 值 |
|---|---|
| 玩家移動速度 | 300 px/s（斜向正規化） |
| 玩家碰撞體 | 48×28（貼近載具底部） |
| 玩家彈速度 | 700 px/s |
| 玩家彈碰撞體 | 20×8 |
| 敵方彈速度 | 260 px/s |
| 敵方彈碰撞體 | 12×12 |
| 敵人碰撞體 | 約為視覺尺寸的 80%（菌 52×52、雲 76×52、尖 44×44） |
| 玩家彈離場回收 | X > 1280 或命中最首個目標 |
| 敵方彈離場回收 | X < 0 或命中玩家 |
| 收尾期間玩家彈 | 照常生成與回收，不影響通關判定 |

## 8. 科普內容（v1.1-draft-4）

三層：首次遭遇短句 → 結算摘要 → 圖鑑（首頁可讀，不以通關解鎖）。

**固定聲明**：遊戲化表現／不是所有微生物都有害／不是所有危害肉眼可見／清潔消毒加熱非通用解法／擊破不代表可食用。

### 8.1 玩家可見文案（僅列可上線者）

| # | 卡 | 文案 | 依據 |
|---|---|---|---|
| K1 | 生物性 | 調理前後要洗手，生熟食分開處理，避免交叉污染。 | Q3、Q9 |
| K2 | 生物性 | 食品中毒常見病因包括細菌與病毒；不是所有微生物都有害。 | Q2 |
| K3 | 化學性 | 食品或食品添加物若含有害人體健康之物質、農藥殘留超過容許量，依法不得製造販賣。 | 第 15 條第一項第三、五款 |
| K4 | 化學性 | 化學性食品中毒的可能來源包含農藥、重金屬等化學物質。 | Q2 |
| K5 | 化學性 | 加熱能殺死活的細菌，但加熱不是所有危害的通用解法。 | Q6 |
| K6 | 物理性 | 食品或食品添加物不得含有害人體健康之物質或異物。 | 第 15 條第一項第三款 |
| K7 | 物理性 | 與食物接觸的器具應保持清潔，避免污染食品。 | Q8「確保與食物接觸的人或物都是清潔乾淨的」；Q3「器具或設備未清洗乾淨」 |
| K8 | 通則 | 預防食品中毒五要：要洗手、要新鮮、要生熟食分開、要澈底加熱、要注意保存溫度。 | Q9 |
| K9 | 通則 | 從業人員、作業場所與設施衛生管理應符合食品良好衛生規範準則。 | 第 8 條第一項 |

**K7 修正**：draft-3 寫「食材驗收與器具清洗」，但來源只支持「器具清洗／與食物接觸之物應清潔」，**不含食材驗收**。已改為只講器具清潔，並把狀態由「改寫推論」收斂為可直接對應 Q8 的敘述。

### 8.2 完整查證表（含狀態欄，供開發者使用，**不進玩家畫面**）

| # | 文案 | 事實依據（原文） | 來源標題 | 網址 | 查核日 | 狀態 |
|---|---|---|---|---|---|---|
| K1 | 洗手／生熟分開 | Q3「烹調人員衛生習慣不良」「生食與熟食交叉污染」；Q9「要洗手」「要生熟食分開」 | 食品中毒常見問與答（發布 2011-07-06／維護 2025-08-18） | https://www.fda.gov.tw/TC/siteContent.aspx?sid=2572 | 2026-10-21 | 已查證 |
| K2 | 細菌與病毒；非所有微生物有害 | Q2「1.細菌…2.病毒：如諾羅病毒等」 | 同上 | 同上 | 2026-10-21 | 已查證（後半句為常識補充） |
| K3 | 有害物質／農藥超標不得製造販賣 | 第 15 條第一項第三、五款 | 食品安全衛生管理法 第 15 條 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0040001&flno=15 | 2026-10-21 | 已查證（禁止性規定） |
| K4 | 農藥、重金屬等化學物質 | Q2「4.化學物質：農藥、重金屬、非合法使用之化合物等」 | 食品中毒常見問與答 | 同上 | 2026-10-21 | 已查證 |
| K5 | 加熱非通用解法 | Q6「適當的加熱過程可以殺死活的細菌…但是有許多細菌產生的毒素可以耐熱」 | 同上 | 同上 | 2026-10-21 | 已查證 |
| K6 | 不得含異物 | 第 15 條第一項第三款 | 食品安全衛生管理法 第 15 條 | 同上 | 2026-10-21 | 已查證（禁止性規定） |
| K7 | 器具保持清潔 | Q8「確保與食物接觸的人或物都是清潔乾淨的」；Q3「器具或設備未清洗乾淨」 | 食品中毒常見問與答 | 同上 | 2026-10-21 | 已查證（**已移除無依據的「食材驗收」**） |
| K8 | 五要原則 | Q9 全文 | 同上 | 同上 | 2026-10-21 | 已查證 |
| K9 | GHP 準則 | 第 8 條第一項 | 食品安全衛生管理法 第 8 條 | https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0040001&flno=8 | 2026-10-21 | 已查證（制度層級） |

### 8.3 待查證項目（**只留在本文件，不進玩家圖鑑**）

| # | 項目 | 已嘗試 | 狀態 |
|---|---|---|---|
| P1 | 器具完整性／破損檢查的官方方法 | 法規 pcode 探測（L0040002/3/10/11/12/14/16）、web_search | **待查證，不納入正式內容** |
| P2 | 清潔化學品分區存放 | web_search | **待查證，不納入正式內容** |

**玩家畫面上的處理**：
- 不出現「待查證」「待補」「開發中」等字樣。
- 物理性卡只呈現 K6、K7 兩句，不再有「器具完整性檢查待補」提示。
- 若日後 P1 補齊，以**新增句子**加入，不改變現有卡結構。

**法律條文定位**：K3、K6、K9 只證明「禁止什麼／要求什麼」，不是作業方法證據。

## 9. 畫面、美術與可用性（v1.1-draft-4）

- 邏輯畫布 1280×720，Scale `FIT`＋`CENTER_BOTH`，不拉伸；可玩區 X 60～1220、Y 90～630。
- 桌面鍵盤、手機橫向觸控；直向顯示旋轉提示，不強制鎖定。
- `env(safe-area-inset-*)` 避開瀏海；左方向盤、右射擊區、右上暫停不重疊。
- 觸控目標 ≥48×48 CSS px，主要按鈕 ≥56px。
- 降低動態：關閉震動、強烈閃爍、非必要視差；無敵改固定淡色外框。
- 選單用可聚焦 `<button>`，`:focus-visible` 明顯；圖片不烘焙中文文字。
- 音訊首次互動後解鎖；被拒絕或缺檔仍可玩。

### 9.1 觸控輸入規則（本輪修正）

**兩類事件必須分開處理**，不可一律暫停：

| 事件 | 處理 | 是否暫停 |
|---|---|---|
| `pointerup`（正常放開） | 只解除**該 pointer** 對應的移動或射擊 | **否** |
| 手指移出控制區（pointerleave／離開圓盤範圍） | 只解除該 pointer 的移動；射擊手指不受影響 | **否** |
| 另一根手指仍在射擊 | 射擊照常，輸入不清空 | 否 |
| `pointercancel` | 清除全部輸入 | **是**，自動暫停 |
| `window.blur` | 清除全部輸入 | **是** |
| `visibilitychange` → hidden | 清除全部輸入 | **是** |
| 暫停鍵 | 清除輸入 | 是（玩家主動） |

實作要點：
- 每個 pointer 以 `pointerId` 記錄用途（`move` 或 `fire`），只解除自己的那一筆。
- 方向盤以「目前仍按住的 pointer」重新計算向量；全部放開才歸零。
- 射擊為「至少一根 fire pointer 按住」—用計數，不用布林，避免多指互相覆蓋。

### 9.2 畫面流程與版面

```
首頁 ─┬ 開始 → 教學（可跳過）→ 遊戲 → 結算 →（重玩/回首頁）
      ├ 圖鑑 → 回首頁
      ├ 設定 → 回首頁
      └ 操作說明 → 回首頁
遊戲 → 暫停（繼續／重新開始／回首頁）
```

- **首頁**：標題＋副標；四個大按鈕；最高分；右上音效。
- **HUD**：左上生命＋分數；上中 0–180s 進度；右上暫停。
- **手機橫向**：左方向盤（直徑約 160px）；右側按住射擊區；右上暫停；三者不重疊。
- **暫停**：半透明遮罩＋三個按鈕，位於**不暫停的 UIScene/DOM 層**（§11.1）。
- **結算**：結果、分數、最高分、擊破／逃脫、科普小卡、重玩／回首頁。

### 9.3 素材清單（優先原創簡圖）

| # | 素材 | 尺寸 | 動畫 | 來源策略 |
|---|---|---|---|---|
| A1 | 主角載具 | 96×64 | idle／受擊／推進 | 原創 |
| A2 | 菌團怪 | 64×64 | idle／受擊 | 原創 |
| A3 | 污染雲怪 | 96×64 | idle／停留／預警／發射 | 原創 |
| A4 | 異物尖兵 | 56×56 | idle／預警／衝刺 | 原創 |
| A5 | 玩家彈 | 24×8 | 單格 | 原創簡單圖形 |
| A6 | 敵方彈 | 16×16 | 單格 | 原創簡單圖形 |
| A7 | 背景三層 | 1280×720×3 | 循環 | 原創或 CC0 |
| A8 | 圖示（心、暫停、三危害） | SVG | 靜態 | **優先原創幾何圖形** |
| A9 | 特效 | Sprite sheet | 動畫 | 原創 |
| A10 | 音效 5 種 | ogg／mp3 | — | CC0，逐項記錄 |
| A11 | 音樂 1 首 | ogg／mp3 | — | CC0，逐項記錄 |
| A12 | 字型 | WOFF2 子集 | — | OFL（Noto Sans TC） |

不新增非必要圖示套件；若日後確需引入（如 Lucide，ISC），須逐檔核對並記入 NOTICE。

## 10. 技術方案

### 10.1 唯讀核對（2026-10-21）

| 項目 | 結果 | 依據 |
|---|---|---|
| Phaser npm `latest` | **4.2.1** | registry `dist-tags.latest` |
| Phaser 授權 | **MIT** | GitHub API `/license` |
| Phaser 倉庫 | 未 archived，最近 push 2026-08-21 | GitHub API |
| 範本 | `template-vite-ts` v1.4.0 | 範本 package.json |
| 範本依賴實查 | `phaser: 4.0.0`、`vite: ^6.3.1`、`typescript: ~5.7.2`、`terser: ^5.39.0` | 直接讀檔 |
| **Node 需求** | 範本 **無 `engines`**；Vite 6 需 Node 18＋ | 實查 |
| 範本 commit SHA | **仍未取得**（本輪僅用 web_fetch 讀 raw，未取 commits API 成功值） | 見下 |
| 建置設定 | `base: './'`、manualChunks、terser | config.prod.mjs |

**範本 commit SHA 的狀態**：規定不 clone。可用 `https://api.github.com/repos/phaserjs/template-vite-ts/commits?per_page=1` 或 GitHub 提交頁取得；本輪以 web_fetch 取 raw 檔可讀，但**未成功取得 SHA 值**（回應未包含 commits 欄位）。**列為使用範本前的必要條件**：建立專案當日第一步必須以 `git ls-remote https://github.com/phaserjs/template-vite-ts refs/heads/main` 取得 SHA 並寫入 §14，**未取得 SHA 不得開始搬用範本設定**。

### 10.2 鎖版策略

```json
{
  "engines": { "node": ">=20 <25" },
  "dependencies": { "phaser": "4.2.1" },
  "devDependencies": { "vite": "6.3.1", "typescript": "5.7.2", "terser": "5.39.0" }
}
```

精確版本、提交 lockfile、`.nvmrc` 固定 24.21.0、不自行升主版本、不混用 Phaser 3 範例。

### 10.3 架構

單一 `Phaser.Game`、單一更新循環、不另建 rAF、用 Arcade Physics、有效遊戲時間計時、暫停一致停止、`dist/` 純靜態、無 CDN／API／遠端素材、不含 React／後端／DB／SW／PWA。

### 10.4 子路徑部署（設定方案，**NOT TESTED**）

`base: './'` 只是設定值。驗收方法：

```bash
VITE_BASE=/food-guardian/ npm run build
mkdir -p /tmp/subpath-test && ln -sfn "$PWD/dist" /tmp/subpath-test/food-guardian
(cd /tmp/subpath-test && python3 -m http.server 8099)
# 開 http://<host>:8099/food-guardian/ 逐項檢查
```

| 檢查 | 通過條件 | 本案狀態 |
|---|---|---|
| 頁面載入 | 200 無 404 | NOT TESTED |
| 圖片／音效／字型 | Network 全 200、路徑含子路徑 | NOT TESTED |
| 重新整理 | 直接重整仍正常 | NOT TESTED |

**本輪未建置、未測試**，不得宣稱支援完成。
## 11. 模組設計（v1.1-draft-4：資料唯一歸屬）

| 模組 | 擁有的權威資料 | 只讀／不擁有 | 輸入 | 輸出 |
|---|---|---|---|---|
| Bootstrap／AssetLoader | 載入清單、進度、失敗項 | — | manifest | onProgress／onComplete／onError |
| GameFlow | `GameState`、**`outcomeSettled`（唯一權威）** | RunState 快照 | start／pause／resume／restart／toMenu／settle | onStateChange |
| InputController | `InputState`、pointer ID 映射 | — | 鍵盤、Pointer | `read()`、onPauseRequested |
| PlayerController | 位置、速度、**射擊冷卻**、無敵倒數、受傷表現 | **不存 hp**（讀 RunState.hp） | InputState、dt | requestShot、hit() |
| EnemyController | 敵人實體池、各自狀態機、`settled`（每隻一個） | 不存分數 | spawn／update | dead／escaped／collided／warn |
| WaveDirector | **波次游標**、待生成佇列 | **不另設關卡時鐘**，只讀 `RunState.elapsedMs` | tick(elapsedMs)、reset(seed) | spawn 請求、finishing |
| CombatSystem | 子彈池、碰撞結果 | 不存 hp／分數 | overlap、shot:fire | 傷害請求 → RunState／Enemy |
| RunState／Score | **hp、score、elapsedMs、kills、escapes、spawnSkipped、seed** | — | damage／addKill／addEscape／tick | `snapshot()`（唯讀） |
| UI | DOM 覆蓋層、觸控控制 | 只讀 snapshot | onStateChange、snapshot | 意圖 → GameFlow／Input |
| KnowledgeCatalog | 科普卡片（可上線版本） | — | get／all | 唯讀 |
| Audio／Settings／Storage | schemaVersion、soundOn、reduceMotion、highScore | — | load／save | settings |

**唯一歸屬規則（強制）**：
1. `hp`、`score`、`elapsedMs`、統計 → **只有 RunState** 可以寫。其他模組一律透過 RunState 方法。
2. `outcomeSettled` → **只有 GameFlow** 持有；RunResult 不再複製此旗標。
3. PlayerController **不存 hp**，只保存位置、冷卻、無敵倒數與受傷表現；生命值一律查 RunState。
4. WaveDirector 只**讀** `RunState.elapsedMs`，擁有波次游標；不建立第二個時鐘。
5. UI 只讀 `snapshot()`，不得寫入任何狀態。

| 模組 | 更新時機 | 暫停行為 | 重啟／清理 |
|---|---|---|---|
| Bootstrap | LOADING | 不適用 | 重試清失敗清單；關 loader 事件 |
| GameFlow | 使用者動作或結論 | 凍結時鐘、暫停 UI 場景以外的場景 | 新 RunState；移除監聽、停音樂 |
| InputController | 每步 | 清空輸入 | 解除 listeners、blur／visibility／pointercancel |
| PlayerController | 每步 | 停止移動與冷卻 | 停補間、移除計時器 |
| EnemyController | 每步 | 狀態機停 | 回收全部、清計時器 |
| WaveDirector | 每步 | 游標不動（時間不累加） | 游標歸零、清佇列 |
| CombatSystem | 物理 step 後 | 隨物理停 | removeCollider／removeOverlap 後重建 |
| RunState | 被呼叫時 | tick 不被呼叫 | 新物件取代 |
| UI | 狀態變化＋100ms HUD | 顯示暫停面板（見 §11.1） | 移除節點與事件 |

**資料流**：
```
Input → PlayerController ─┬→ CombatSystem → RunState → UI（唯讀）
EnemyController ←─────────┘        ↑
WaveDirector（讀 elapsedMs）→ EnemyController
GameFlow（唯一狀態機 + outcomeSettled）⟷ UI／Audio
```

### 11.1 暫停選單的場景位置（本輪修正）

**問題**：若暫停選單放在 Game Scene 內，`scene.pause()` 會讓選單也停止更新，按鈕按不到。

**設計**：暫停選單放在**獨立的 UI Scene**（`UIScene`），該場景**永不暫停**。

```
SceneManager:
  GameScene（playing）—— 暫停時 scene.pause('Game')
  UIScene（always running）—— 覆蓋層：選單／HUD／暫停／結算
```

| 事件 | GameScene | UIScene |
|---|---|---|
| 暫停 | `scene.pause()` → update 停止 | 持續執行，顯示暫停面板 |
| 繼續 | `scene.resume()` | 隱藏面板 |
| 重新開始 | `scene.restart()` | 重建 HUD |
| 回首頁 | `scene.stop()` | 切回 Menu |

HTML 層（DOM）也可承載暫停按鈕；兩者擇一，但**不得**放在會暫停的場景內。

## 12. 狀態、資料與生命週期

### 12.1 狀態圖

```
BOOT → LOADING → MENU ⇄ TUTORIAL → PLAYING
PLAYING → PAUSED → PLAYING
PLAYING → WON / LOST（各只一次）
WON/LOST → PLAYING（重玩，新 RunState）｜→ MENU
LOADING → LOAD_ERROR →（重試）→ LOADING
```

### 12.2 型別草案（v1.1-draft-4）

```ts
export type HazardKind = 'biological' | 'chemical' | 'physical';

export interface InputState {
  moveX: number;   // -1..1
  moveY: number;
  firing: boolean;
  pauseRequested: boolean;
}

export interface EnemyDefinition {
  id: 'germ' | 'cloud' | 'shard';
  displayName: string;
  knowledgeName: string;
  hazard: HazardKind;
  hp: number;
  score: number;
  spawnX: number;            // 1280 或 1380
  exitX: number;             // 60
  speed: number;
  size: { w: number; h: number };
  body: { w: number; h: number };   // 碰撞體
  attack: null | {
    type: 'projectile' | 'dash';
    warnMs: number;          // 600
  };
  hover?: { atX: number; durationMs: number; amplitude: number; periodMs: number };
  dash?: { speed: number };  // 420
}

export interface SpawnBatch {
  enemyId: EnemyDefinition['id'];
  count: number;
  y: number[];               // 固定座標或已由 seed 選定的座標
  gapMs: number;
}

export interface WaveGroup {
  atMs: number;              // 唯一時間來源，毫秒整數
  batches: SpawnBatch[];
  gapBetweenBatchesMs: number;
}

/** RunState 是 hp / score / elapsedMs / 統計的唯一權威 */
export interface RunState {
  readonly seed: number;
  hp: number;
  score: number;
  elapsedMs: number;
  phase: 'playing' | 'finishing' | 'won' | 'lost';
  kills: Record<string, number>;
  escapes: Record<string, number>;
  spawnSkipped: Record<string, number>;
}

export interface RunResult {
  outcome: 'won' | 'lost';
  score: number;
  breakdown: { kills: number; hpBonus: number };
  elapsedMs: number;
  kills: Record<string, number>;
  escapes: Record<string, number>;
  isNewHighScore: boolean;
  debug?: { spawnSkipped: Record<string, number> };
}

/** GameFlow 唯一持有 outcomeSettled，不放在 RunState／RunResult */
export interface GameFlowState {
  state: 'BOOT' | 'LOADING' | 'MENU' | 'TUTORIAL' | 'PLAYING' | 'PAUSED' | 'WON' | 'LOST' | 'LOAD_ERROR';
  outcomeSettled: boolean;
}

export interface Settings {
  schemaVersion: number;
  soundOn: boolean;
  reduceMotion: boolean;
  highScore: number;
}

export interface KnowledgeEntry {
  id: string;
  hazard: HazardKind;
  title: string;
  body: string[];            // 只放可上線文案
  sources: { title: string; url: string; checkedAt: string }[];
  verification: 'verified';  // pending 條目不得進入 build
}
```

### 12.3 localStorage

| 項目 | 設計 |
|---|---|
| key | `food-guardian.settings.v1` |
| schemaVersion | 1 |
| 容錯 | parse 失敗／型別不符／版本不符／`SecurityError` → 安全預設 |
| 儲存失敗 | 靜默降級，不阻擋遊戲 |
| 只存 | soundOn、reduceMotion、highScore、schemaVersion |

### 12.4 重玩清理

實體回池、場景計時事件清空、collider／overlap 重建、事件解除、pointer ID 清空、新 `RunState`、停止 SFX。驗收：重玩 10 次不累積。

### 12.5 時間策略（本輪依 Phaser 4.2.1 原始碼重寫）

**核對依據**（唯讀，2026-10-21）：

| 對象 | 事實 | 出處 |
|---|---|---|
| `World.update(time, delta)` | `delta` 單位 **毫秒**；內部累加 `this._elapsed += delta` | `src/physics/arcade/World.js` v4.2.1 L945–1013 |
| `World.step(delta)` | `delta` 單位 **秒**；直接套用到 body | 同上 L1025–1058 |
| `fixedStep` | 預設 `true`；`false` 時 `fixedDelta = delta * 0.001` 並強制 `willStep = true` | 同上 L179、L963–968 |
| `fps` | 預設 60，只影響固定步長模式 | 同上 L168 |
| 自動更新 | `ArcadePhysics` 建構時若 `customUpdate` 為 false 才掛 `SceneEvents.UPDATE → world.update`；`disableUpdate()` 可解除 | `ArcadePhysics.js` v4.2.1 L146–151、L182–185 |
| `postUpdate` | **無論是否停用自動更新，Scene POST_UPDATE 都會呼叫** `world.postUpdate` | 同上 L151、L174–176 |
| 單步更新順序 | `body.preUpdate(willStep, fixedDelta)` → 建樹 → `collider.update()` → `emit(WORLD_STEP)` → 補跑 `step()` | `World.js` L970–1012 |

**選定方案（設計層，A 階段須驗證）**

不自行重寫物理。採「**關閉自動更新，由場景在手動更新點呼叫一次 `world.update`／`world.postUpdate`**」的做法；是否採用需 A 階段以官方 4.2.1 原始碼與實測確認。

```ts
// Scene 建立時
physics.disableUpdate();                 // 解除 SceneEvents.UPDATE → world.update

// 每幀（僅在 PLAYING／FINISHING）
update(time, delta) {
  const dt = Math.min(delta, 50);        // 毫秒；慢畫格上限
  run.elapsedMs += dt;                   // 關卡計時（唯一來源）
  player.update(dt);                     // 冷卻、無敵
  enemies.update(dt);                    // 移動、預警、停留
  waveDirector.update(run.elapsedMs);    // 只比對 elapsedMs
  world.update(time, dt);                // 毫秒，與 elapsedMs 同一個 dt
  world.postUpdate();                    // 因為已停用自動更新，需自行呼叫
  combat.resolve(dt);                    // 處理本幀碰撞結果
}
```

| 項目 | 用什麼 | 單位 | 暫停時 |
|---|---|---|---|
| 關卡計時 | `RunState.elapsedMs += dt` | 毫秒 | `scene.pause()` → update 不執行 |
| 物理移動 | `world.update(time, dt)` | **毫秒** | 同上；另以 `world.pause()` 雙重保險 |
| 射擊冷卻 | `cooldown -= dt` | 毫秒 | 同上 |
| 預警與攻擊 | 狀態機 `-= dt` | 毫秒 | 同上 |
| 無敵時間 | `invulnMs -= dt` | 毫秒 | 同上 |
| 收尾倒數 | `elapsedMs - 180000` | 毫秒 | 同上 |

**關鍵約束**：`dt` 只產生一次，六項全部使用同一個值；**不要**混用 `step(delta)`（秒）與 `update(time, delta)`（毫秒）。

**固定步長模式（`fixedStep = true`，預設）的取捨**：
- 優點：物理步長固定（1/60s），慢畫格時補跑多步，速度快慢不影響位移正確性。
- 風險：一幀內可能出現多個 step，與「關卡每幀只加一個 dt」不同步；碰撞回呼會在補跑時連續觸發。
- 因此設計上**要求 A 階段實測比較**：
  1. 方案 A：`fixedStep = true` + `world.update(time, dt)`（物理自行補跑）；
  2. 方案 B：`fixedStep = false` + `world.update(time, dt)`（每幀單步、dt 上限 50ms）。
- **本設計不預先宣稱任何一方案保證同步**；A 階段以「慢畫格下位移誤差、碰撞是否漏判、冷卻與物理是否對齊」作為判定依據，結果寫回本節。

**避免重複移動**：物件的位移**只由物理 velocity 決定**；自訂 update 不得再對同一 body 做 `x += v*dt`。若某實體不使用物理（如純 UI 動畫），明確標記為 non-physics。

**不要做**：`Date.now()`／`performance.now()` 差值計時、`setInterval`、第二個 rAF、以及對同一物件同時套用物理與手動位移。

**分頁切回**：`visibilitychange` 立即暫停；恢復時 Phaser 可能給大 delta，被 50ms 上限截斷，**不補算**。

**明確標記**：以上為設計依據；時間同步**未實測**，A 階段列為第一項技術驗證，設計階段**不標 PASS**。

## 13. 目錄提案（不建立）

```
docs/
public/assets/{sprites,backgrounds,audio,fonts}/
public/assets/CREDITS.json
src/main.ts
src/game/{bootstrap,gameflow,config}.ts
src/scenes/            # Boot, Menu, Tutorial, Game, UIOverlay
src/entities/          # player.ts, enemies.ts
src/systems/           # combat, waves, input, runstate
src/data/              # enemies.ts, waves.ts, knowledge.ts, balance.ts
src/ui/                # menus, hud, touch
src/platform/          # storage, audio, settings
tests/{unit,e2e}/
```

---

## 14. GitHub 參考與素材授權

| 來源 | 版本／commit | 授權 | 用途 | 判定 |
|---|---|---|---|---|
| SiaHalawani/2D-Shouter-Game | `dad09d5cc55533ac6bce248ff68a5c22dfd75893`（2025-04-27） | 無 LICENSE（API null） | 玩法概念 | **僅參考概念** |
| phaserjs/phaser | **4.2.1** | **MIT** | 引擎 | 可採用 |
| phaserjs/template-vite-ts | v1.4.0；**SHA 未取得** | MIT | 設定參考 | 可採用，但**取得 SHA 前不得搬用** |
| phaserjs/examples | master | 逐檔 | API 用法 | 授權待確認 |
| Noto Sans TC | Google Fonts | SIL OFL 1.1 | 字型 | 可採用 |
| CC0 音效／圖 | 未選定 | CC0 | 輔助 | 逐項記錄 |
| 圖示集 | **不引入** | — | — | 以原創 SVG 取代 |

**逐項核對步驟（核准後、安裝後執行）**：
```bash
# 1) 每個依賴的授權宣告與 LICENSE 檔
for p in phaser vite typescript terser; do
  node -e "console.log('$p', require('./node_modules/$p/package.json').license)"
  ls node_modules/$p/LICENSE* node_modules/$p/NOTICE* 2>/dev/null
done
# 2) 保存必要授權檔到 third_party/licenses/<pkg>/
```
1. `package.json` 的 `license` 與 LICENSE 檔不一致時，**以 LICENSE 檔為準**。
2. Apache-2.0 依賴若含 `NOTICE`，原樣複製保存。
3. 若有修改第三方檔案，在 NOTICE 註明「modified by …」與修改內容。
4. 每個素材寫入 `public/assets/CREDITS.json`：檔名、URL、作者、授權、取得日、修改說明。
5. **程式授權不外推**到同倉庫圖片／音效。

**範本 SHA（未取得，列為前置條件）**：
- 應以 `git ls-remote https://github.com/phaserjs/template-vite-ts refs/heads/main` 或 `api.github.com/repos/phaserjs/template-vite-ts/commits?per_page=1` 取得。
- 本輪僅用 web_fetch 讀 raw 檔，未取得 commits 回應中的 SHA 值，**原因記於此**。
- **在取得 SHA 並寫入本表之前，不得開始搬用範本的 vite 設定或目錄結構。**

## 15. 分階段實作計畫（核准後）

| 階段 | 內容 | 完成標準 | 證據 |
|---|---|---|---|
| **A 骨架＋時間驗證** | 載入、選單、單一實例、移動、射擊、縮放；**§12.5 時間策略 A/B 方案實測** | 可移動＋射擊；等比縮放；慢畫格下位移誤差、碰撞漏判、冷卻對齊三項有數據 | 建置輸出、量測紀錄 |
| B 切片 | 菌團怪、碰撞、生命、計分、勝敗（含 H1–H4 命中案例）、暫停、重玩 | 可完整 WON／LOST 並重玩 | 測試報告 |
| C 完整玩法 | 另兩敵（雲怪單次停留射擊、尖兵單次衝刺）、波次、收尾、觸控 | 行為差異、預警可辨、峰值 ≤16 | 波次對照、實機紀錄 |
| D 完整呈現 | 素材、科普（僅可上線文案）、音效、設定、最高分 | 圖鑑可讀、音效可關 | CREDITS、截圖 |
| E 驗收 | 功能、自動化、效能、修正 | 通過 §16 | 驗收報告 |

**A 階段必先完成**：時間策略驗證是所有後續測試的地基。

---

## 16. 驗收矩陣

### 16.1 功能

| # | 檢查 | 通過條件 |
|---|---|---|
| F1 | 開始→通關→失敗→重玩→回首頁 | 全部可完成 |
| F2 | 三敵人差異 | 菌直行；雲停留 2s、射 1 發；尖兵 0.6s 靜止預警後單次衝刺離場 |
| F3 | 射擊冷卻／斜向不超速 | 0.18s±1 幀；斜向速度＝正向 |
| F4 | 暫停凍結 | §12.5 六項全部停止 |
| F5 | 切分頁 | 不瞬移、不補生成、不持續射擊 |
| **F6** | **命中與結算** | H1 單發非致命不計分；H2 兩發致命計分一次；H3 死亡後第三發不重複；H4 跨步 |
| F7 | 重玩 10 次 | 無累積 |
| F8 | localStorage 不可用 | 仍可玩 |
| F9 | 素材載入失敗 | 有錯誤與重試 |
| F10 | 無 Boss 等未批准功能 | 靜態檢查 |
| F11 | 同屏峰值 | ≤16（現值 13）；實際生成＝排程−跳過 |
| F12 | 190s 邊界 | 先結算後淡出；敗北優先；只結算一次 |
| **F13** | **通關條件** | 敵 0 且敵彈 0；玩家持續射擊不阻止通關 |
| **F14** | **觸控多指** | 放開射擊手指不暫停、不影響移動；移出方向盤只解除移動 |
| **F15** | **暫停選單可用** | Game Scene 暫停後仍能按繼續／重玩／回首頁 |

### 16.2 顯示與輸入

1366×768、1920×1080、844×390、直向提示、多點觸控、pointercancel、介面無遮擋。

### 16.3 子路徑（NOT TESTED）

以 `/food-guardian/` 掛載 dist 實測圖片、音效、字型、重整。

### 16.4 效能（NOT TESTED）

桌面 60 FPS、手機 30 FPS 底線；觀察池上限、重玩清理、慢畫格。Chromium 不能取代實機 iOS Safari。

---

## 17. 風險與待確認

### 17.1 自檢

| 檢查 | 結論 |
|---|---|
| 勝敗矛盾 | 生命歸零優先；GameFlow 的 outcomeSettled 唯一 |
| 收尾無法結束 | 190s 先結算，後 0.3s 裝飾淡出 |
| 暫停時間來源 | §12.5 單一 dt |
| 波次與上限 | 峰值 13，上限 16 有 3 隻餘裕 |
| 科普誤導 | K7 已移除無依據的「食材驗收」；P1/P2 不進畫面 |
| 資料重複擁有 | hp/score/elapsedMs 只歸 RunState；outcomeSettled 只歸 GameFlow |
| 重玩資源 | 清理清單＋F7 |
| 手機輸入衝突 | §9.1 分指處理；暫停選單在不暫停的 UIScene |

### 17.2 風險

| # | 風險 | 緩解 |
|---|---|---|
| R1 | Phaser 4 物理時間策略未驗證 | A 階段第一項任務，A/B 方案實測 |
| R2 | 三敵辨識度 | 輪廓＋動態＋圖示 |
| R3 | 手機多指操作 | 大按鈕、實機測試、F14 |
| R4 | CC0 素材授權誤判 | 逐檔 CREDITS |
| R5 | P1/P2 未補 | 不進玩家畫面 |
| R6 | 尖兵衝刺速度快 | 0.6s 靜止預警＋方向指示 |

### 17.3 待確認

1. A 階段時間策略採方案 A（fixedStep=true）或方案 B（fixedStep=false）— 待實測後再定。
2. P1 是否需要在 Phase 1 前補齊（目前物理性卡只有兩句）。

---

## 18. 建置草案（可重現）

**不使用** `npm create vite@latest`（版本浮動）。改為：

```bash
mkdir food-guardian && cd food-guardian
npm init -y
npm pkg set type=module
npm pkg set engines.node=">=20 <25"

# 精確版本，全部 --save-exact
npm install --save-exact phaser@4.2.1
npm install --save-dev --save-exact vite@6.3.1 typescript@5.7.2 terser@5.39.0

# 手寫最小骨架，不複製範本：
#   index.html / src/main.ts / vite.config.ts / tsconfig.json
```

**子路徑設定（語意說清楚）**：
- 採**固定** `base: './'`（相對路徑），**不**依賴環境變數。
- `VITE_BASE` 只有在 `vite.config.ts` 內以 `process.env.VITE_BASE` 讀取時才生效；本專案預設**不讀**。
- 因此不寫「`VITE_BASE=... npm run build` 就會改 base」。
- 若未來要支援多路徑，才在 config 內加入 `base: process.env.VITE_BASE ?? './'`，並同步更新本節。
- 部署驗證以實際建置產物掛子路徑測試（§10.4），不靠設定值推論。

**.nvmrc**：`24.21.0`

---

## 19. 未解決問題

| # | 問題 | 狀態 |
|---|---|---|
| Q1 | 物理時間策略 A/B 方案 | A 階段驗證 |
| Q2 | P1、P2 來源 | 待查證，不進畫面 |
| Q3 | 範本 commit SHA | 未取得；已改手寫骨架，不依賴範本 |
| Q4 | 子路徑部署 | NOT TESTED |
| Q5 | 效能與實機 | NOT TESTED |

---

## 20. 技能變更（簡短紀錄）

| 時間（UTC） | 變更 | 類型 |
|---|---|---|
| 07:24 | `official-source-probe` 補兩條（spill log、內容頁模板） | 背景 skill review |
| 07:24 | `design-spec-delivery` 新建 | 背景 skill review |
| 07:59–08:00 | `design-spec-delivery` 9 次增補 | 背景 skill review |
| 08:17 | `design-spec-delivery` 再次更新 | 背景 skill review |

- 路徑：`/home/node/.openclaw/agents/hermione/agent/workshop-skills/`（**不在 Git**，靠 `.archive/` 快照）
- 本輪**未手動修改任何技能**；但**本輪仍有背景技能變更**（08:17）。
- 未回滾、未停用背景機制、未改任何設定。

---

## 21. 回報

本次完成設計補正（v1.1-draft-4）；尚未建立遊戲專案、初始化 Git、安裝依賴、啟動服務或撰寫遊戲實作。等待曉杰批准開始開發。

---

## 附錄 A：專案位置、Git 管理與預覽方式（提案，未執行）

| 項目 | 提案 | 理由 |
|---|---|---|
| 專案位置 | `workspace/projects/food-guardian/` | 與 workspace 其他專案分開，不與 spec 混在一起 |
| 替代位置 | Mac 主機 `~/projects/food-guardian` | 若需在 Mac 本機開發與實機測試 |
| Git | 獨立 repo，**不併入 workspace repo** | workspace 已有一套版本規則與大量無關檔案 |
| 首個 commit | `chore: scaffold Phaser 4.2.1 + Vite 6.3.1 + TS 5.7.2` | 可追溯鎖版 |
| 分支 | `main` 穩定；功能用 `feat/phase1-*` | 單人開發足夠 |
| remote | **不設** | 未經指示不推外部 |
| 預覽（開發） | `npm run dev -- --host 0.0.0.0`，同網段以容器名存取 | Chromium 不能用 localhost 回連 |
| 預覽（驗收） | `dist/` 掛子路徑，用獨立靜態服務 | 對齊正式部署條件 |
| 與 spec 關係 | spec 留 `docs/`；專案內放 `docs/SPEC-REF.md` 指向本文件 | 避免兩份規格互相矛盾 |

**未建立任何目錄、未初始化 Git、未啟動服務。**
