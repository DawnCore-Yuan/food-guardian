import type { SpawnBatch, WaveGroup } from '../types';

/**
 * 關卡波次（唯一數值來源）。
 *
 * v2 設計（leaderboard_version = official-180s-v2）：
 *   P1 0–30 秒   熟悉操作：沙門氏菌為主、少量黃麴毒素，分散出場
 *   P2 30–60 秒  加入二氧化硫（會發射敵彈），逐步升溫
 *   P3 60–90 秒  加入金黃色葡萄球菌，四敵混合
 *   P4 90–120 秒 縮短間隔，提高組合壓力
 *   P5 120–150 秒 提高同時在場數，預警自然錯開（名額 3）
 *   P6 150–170 秒 最後衝刺，最高密度
 *   P7 170–178 秒 維持高潮，不新增機制；最後一隻在 176 秒前出場，確保有時間交戰
 *  178–180 秒     不再生成任何敵人
 * 段與段之間保留 1–2 秒喘息；敵人血量、傷害、速度、玩家射速、碰撞體一律未改。
 */

/** 18 秒測試關卡（保留給 dev／測試；正式首頁預設 180 秒） */
export const TEST_LEVEL_DURATION_MS = 18_000;
export const TEST_FINISH_MS = 10_000;

/** 正式關卡：整局嚴格 3 分鐘，時間到立即結算，不再有 finishing 清場期 */
export const LEVEL_DURATION_MS = 180_000;
/** 保留欄位以相容既有呼叫端；正式關卡為 0（結算後才計入收尾） */
export const FINISH_MS = 0;

export type LevelId = 'test-18s' | 'official-180s';

export interface LevelConfig {
  id: LevelId;
  durationMs: number;
  finishMs: number;
  waves: WaveGroup[];
}

const g = (atMs: number, batches: SpawnBatch[], gap = 800): WaveGroup =>
  ({ atMs, batches, gapBetweenBatchesMs: gap });

const b = (enemyId: string, count: number, y: number[], gapMs: number): SpawnBatch =>
  ({ enemyId, count, y, gapMs });

/** 150 / 180 / 150 / 200 為既有敵人分值；v2 未改任何戰鬥數值 */
export const OFFICIAL_WAVES: WaveGroup[] = [
  // ── P1：0–30 秒，僅沙門氏菌＋黃麴毒素 ──
  g(2_000,  [b('salmonella-normal', 2, [300, 480], 1200)]),
  g(8_000,  [b('aflatoxin-normal', 1, [220], 0)]),
  g(13_000, [b('salmonella-normal', 2, [220, 520], 1300)]),
  g(20_000, [b('aflatoxin-normal', 1, [520], 0)]),
  g(24_000, [b('salmonella-normal', 1, [360], 0)]),

  // ── P2：30–60 秒，加入二氧化硫 ──
  g(31_000, [b('salmonella-normal', 2, [260, 500], 1200)]),
  g(37_000, [b('sulfur_dioxide_excess-normal', 1, [360], 0)]),
  g(42_000, [b('aflatoxin-normal', 1, [200], 0), b('salmonella-normal', 1, [540], 0)]),
  g(48_000, [b('sulfur_dioxide_excess-normal', 1, [300], 0), b('aflatoxin-normal', 1, [520], 0)]),
  g(54_000, [b('salmonella-normal', 1, [380], 0)]),

  // ── P3：60–90 秒，加入葡萄球菌，四敵混合 ──
  g(61_000, [b('salmonella-normal', 2, [240, 500], 1100)]),
  g(67_000, [b('s_aureus-normal', 1, [300], 0)]),
  g(72_000, [b('sulfur_dioxide_excess-normal', 1, [520], 0), b('aflatoxin-normal', 1, [220], 0)]),
  g(77_000, [b('s_aureus-normal', 1, [200], 0), b('salmonella-normal', 1, [480], 0)]),
  g(83_000, [b('aflatoxin-normal', 1, [360], 0), b('sulfur_dioxide_excess-normal', 1, [260], 0)]),

  // ── P4：90–120 秒，間隔縮短 ──
  g(91_000, [b('salmonella-normal', 2, [220, 520], 1000)]),
  g(96_000, [b('sulfur_dioxide_excess-normal', 1, [300], 0), b('s_aureus-normal', 1, [540], 0)]),
  g(101_000,[b('aflatoxin-normal', 1, [200], 0), b('sulfur_dioxide_excess-normal', 1, [420], 0)]),
  g(106_000,[b('salmonella-normal', 1, [340], 0), b('s_aureus-normal', 1, [260], 0)]),
  g(110_000,[b('aflatoxin-normal', 1, [480], 0), b('s_aureus-normal', 1, [200], 0)]),
  g(114_000,[b('salmonella-normal', 1, [560], 0)]),

  // ── P5：120–150 秒，同時在場數上升（敵彈仍受 12 發上限） ──
  g(121_000,[b('salmonella-normal', 2, [220, 520], 1000)]),
  g(126_000,[b('sulfur_dioxide_excess-normal', 1, [300], 0), b('aflatoxin-normal', 1, [540], 0)]),
  g(130_000,[b('s_aureus-normal', 1, [220], 0), b('salmonella-normal', 1, [460], 0)]),
  g(134_000,[b('sulfur_dioxide_excess-normal', 1, [380], 0), b('aflatoxin-normal', 1, [260], 0)]),
  g(138_000,[b('s_aureus-normal', 1, [500], 0), b('salmonella-normal', 1, [300], 0)]),
  g(141_000,[b('aflatoxin-normal', 1, [220], 0)]),
  g(144_000,[b('sulfur_dioxide_excess-normal', 1, [520], 0)]),

  // ── P6：150–170 秒，最高密度 ──
  g(151_000,[b('salmonella-normal', 2, [240, 500], 900)]),
  g(155_000,[b('sulfur_dioxide_excess-normal', 1, [320], 0), b('aflatoxin-normal', 1, [520], 0)]),
  g(159_000,[b('s_aureus-normal', 1, [220], 0), b('salmonella-normal', 1, [440], 0)]),
  g(162_000,[b('sulfur_dioxide_excess-normal', 1, [560], 400), b('s_aureus-normal', 1, [300], 0)]),
  g(165_000,[b('aflatoxin-normal', 1, [380], 300), b('salmonella-normal', 1, [220], 0)]),
  g(167_500,[b('s_aureus-normal', 1, [500], 0)]),

  // ── P7：170–178 秒，維持高潮但不新增機制 ──
  g(171_000,[b('salmonella-normal', 2, [260, 480], 1400)]),
  g(175_000,[b('aflatoxin-normal', 1, [360], 0), b('sulfur_dioxide_excess-normal', 1, [220], 0)]),
  g(176_000,[b('s_aureus-normal', 1, [520], 0)]),
];

/** 18 秒測試波次（僅菌團怪行為，dev 用） */
export const TEST_WAVES: WaveGroup[] = [
  g(1_000,  [{ enemyId: 'salmonella-normal', count: 2, y: [300, 480], gapMs: 900 }]),
  g(4_000,  [{ enemyId: 'aflatoxin-normal', count: 2, y: [220, 520], gapMs: 900 }]),
  g(8_000,  [{ enemyId: 'sulfur_dioxide_excess-normal', count: 2, y: [260, 500], gapMs: 1000 }]),
  g(12_000, [{ enemyId: 's_aureus-normal', count: 2, y: [300, 520], gapMs: 1000 }]),
];

export const LEVELS: Record<LevelId, LevelConfig> = {
  'test-18s': { id: 'test-18s', durationMs: TEST_LEVEL_DURATION_MS, finishMs: TEST_FINISH_MS, waves: TEST_WAVES },
  'official-180s': { id: 'official-180s', durationMs: LEVEL_DURATION_MS, finishMs: FINISH_MS, waves: OFFICIAL_WAVES },
};

/** 正式首頁預設關卡 */
export const DEFAULT_LEVEL: LevelId = 'official-180s';

/**
 * 由波次設定計算「理論生成數」與「最少生成間隔」。
 * 前端、伺服器與文件共用同一個算法，避免手寫數字漂移。
 *  - 仍會受敵人容量（16）限制，實際生成數以實測為準（見 docs/LEADERBOARD-RULES.md §1.2）。
 */
export function waveStats(waves: WaveGroup[]): {
  perEnemy: Record<string, number>;
  total: number;
  lastSpawnMs: number;
  minGapMs: number;
} {
  const perEnemy: Record<string, number> = {};
  const times: number[] = [];
  for (const group of waves) {
    // 與 GameScene.scheduleWaves 相同的展開規則
    let t = group.atMs;
    group.batches.forEach((batch, i) => {
      if (i > 0) t += group.gapBetweenBatchesMs;
      for (let k = 0; k < batch.count; k += 1) {
        times.push(t);
        perEnemy[batch.enemyId] = (perEnemy[batch.enemyId] ?? 0) + 1;
        t += batch.gapMs;
      }
    });
  }
  times.sort((x, y) => x - y);
  let minGapMs = Number.POSITIVE_INFINITY;
  for (let i = 1; i < times.length; i += 1) minGapMs = Math.min(minGapMs, times[i] - times[i - 1]);
  return {
    perEnemy,
    total: times.length,
    lastSpawnMs: times.length ? times[times.length - 1] : 0,
    minGapMs: Number.isFinite(minGapMs) ? minGapMs : 0,
  };
}
