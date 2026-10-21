import type { WaveGroup } from '../types';

/** 18 秒測試關卡（保留給 dev／測試；正式首頁預設 180 秒） */
export const TEST_LEVEL_DURATION_MS = 18_000;
export const TEST_FINISH_MS = 10_000;

/** 正式關卡 */
export const LEVEL_DURATION_MS = 180_000;
export const FINISH_MS = 10_000;

export type LevelId = 'test-18s' | 'official-180s';

export interface LevelConfig {
  id: LevelId;
  durationMs: number;
  finishMs: number;
  waves: WaveGroup[];
}

const g = (atMs: number, batches: WaveGroup['batches'], gap = 800): WaveGroup =>
  ({ atMs, batches, gapBetweenBatchesMs: gap });

/** 正式 18 群（依 v1.2 §6.3）；Y 座標與間隔為初始調校值 */
export const OFFICIAL_WAVES: WaveGroup[] = [
  g(4_000,   [{ enemyId: 'salmonella-normal', count: 2, y: [300, 480], gapMs: 1000 }]),
  g(12_000,  [{ enemyId: 'aflatoxin-normal', count: 2, y: [220, 520], gapMs: 1200 }]),
  g(22_000,  [{ enemyId: 'salmonella-normal', count: 3, y: [200, 360, 520], gapMs: 900 }]),
  g(32_000,  [{ enemyId: 'aflatoxin-normal', count: 3, y: [180, 360, 540], gapMs: 900 }]),
  g(44_000,  [{ enemyId: 'salmonella-normal', count: 2, y: [260, 460], gapMs: 900 },
              { enemyId: 'aflatoxin-normal', count: 2, y: [200, 520], gapMs: 900 }]),
  g(54_000,  [{ enemyId: 'salmonella-normal', count: 4, y: [160, 300, 440, 580], gapMs: 700 }]),
  g(60_000,  [{ enemyId: 'sulfur_dioxide_excess-normal', count: 1, y: [360], gapMs: 0 }]),
  g(70_000,  [{ enemyId: 'sulfur_dioxide_excess-normal', count: 2, y: [260, 480], gapMs: 1200 }]),
  g(80_000,  [{ enemyId: 'salmonella-normal', count: 2, y: [240, 480], gapMs: 800 },
              { enemyId: 'aflatoxin-normal', count: 2, y: [180, 540], gapMs: 800 }]),
  g(90_000,  [{ enemyId: 'sulfur_dioxide_excess-normal', count: 2, y: [280, 500], gapMs: 1000 },
              { enemyId: 'aflatoxin-normal', count: 2, y: [200, 420], gapMs: 900 }]),
  g(100_000, [{ enemyId: 'salmonella-normal', count: 3, y: [180, 360, 540], gapMs: 700 },
              { enemyId: 'sulfur_dioxide_excess-normal', count: 2, y: [260, 480], gapMs: 1000 }]),
  g(110_000, [{ enemyId: 'sulfur_dioxide_excess-normal', count: 3, y: [200, 380, 560], gapMs: 900 }]),
  g(120_000, [{ enemyId: 's_aureus-normal', count: 1, y: [360], gapMs: 0 }]),
  g(130_000, [{ enemyId: 's_aureus-normal', count: 2, y: [240, 500], gapMs: 1100 },
              { enemyId: 'salmonella-normal', count: 2, y: [180, 420], gapMs: 900 }]),
  g(140_000, [{ enemyId: 'aflatoxin-normal', count: 1, y: [200], gapMs: 0 },
              { enemyId: 'sulfur_dioxide_excess-normal', count: 1, y: [360], gapMs: 0 },
              { enemyId: 'salmonella-normal', count: 2, y: [280, 520], gapMs: 800 },
              { enemyId: 's_aureus-normal', count: 1, y: [440], gapMs: 0 }]),
  g(150_000, [{ enemyId: 'aflatoxin-normal', count: 2, y: [180, 400], gapMs: 800 },
              { enemyId: 'sulfur_dioxide_excess-normal', count: 2, y: [260, 500], gapMs: 900 },
              { enemyId: 'salmonella-normal', count: 2, y: [340, 580], gapMs: 800 },
              { enemyId: 's_aureus-normal', count: 1, y: [480], gapMs: 0 }]),
  g(160_000, [{ enemyId: 's_aureus-normal', count: 3, y: [200, 380, 560], gapMs: 900 },
              { enemyId: 'sulfur_dioxide_excess-normal', count: 2, y: [280, 500], gapMs: 1000 }]),
  g(168_000, [{ enemyId: 'aflatoxin-normal', count: 2, y: [200, 440], gapMs: 800 },
              { enemyId: 'sulfur_dioxide_excess-normal', count: 2, y: [260, 500], gapMs: 900 },
              { enemyId: 'salmonella-normal', count: 2, y: [320, 560], gapMs: 800 },
              { enemyId: 's_aureus-normal', count: 2, y: [380, 200], gapMs: 900 }]),
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
