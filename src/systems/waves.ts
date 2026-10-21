import type { WaveGroup } from '../types';

/**
 * B 階段測試用短關卡（獨立設定，不改動正式 180 秒波次）。
 * 正式波次表（87 隻、18 群、31 子批）保留在 spec，C 階段接上。
 */
export const TEST_WAVES: WaveGroup[] = [
  { atMs: 1000, batches: [{ enemyId: 'germ', count: 2, y: [300, 480], gapMs: 900 }], gapBetweenBatchesMs: 0 },
  { atMs: 4000, batches: [{ enemyId: 'germ', count: 3, y: [180, 330, 520], gapMs: 800 }], gapBetweenBatchesMs: 0 },
  { atMs: 8000, batches: [{ enemyId: 'germ', count: 3, y: [240, 400, 560], gapMs: 700 }], gapBetweenBatchesMs: 0 },
  { atMs: 12000, batches: [{ enemyId: 'germ', count: 4, y: [160, 280, 420, 580], gapMs: 600 }], gapBetweenBatchesMs: 0 },
];

/** B 階段短關卡總長（秒）。正式版為 180。 */
export const TEST_LEVEL_DURATION_MS = 18_000;
export const TEST_FINISH_MS = 10_000;
