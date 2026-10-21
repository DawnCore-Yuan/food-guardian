import { OFFICIAL_WAVES, waveStats } from '../systems/waves';

/**
 * 排行榜 v2 的計分上限：由波次設定與敵人分值「算出來」，不手寫猜值。
 * 設定上的理論上限（所有排定生成都被擊破且滿血通關）與
 * 受容量限制的實際數值分開記錄：實際生成受敵人容量 16 影響，以實測為準。
 */
export const LEADERBOARD_VERSION = 'official-180s-v2';

const SFX: Record<string, number> = {
  'salmonella-normal': 200,
  'sulfur_dioxide_excess-normal': 180,
  'aflatoxin-normal': 150,
  's_aureus-normal': 150,
};
/** 與 BALANCE.player.hp、BALANCE.score.hpBonusPerLife 一致（此檔不 import balance 以免把平衡值打進前端以外的程式） */
const HP = 5;
const HP_BONUS = 200;

export function computeScoreBounds(): {
  perEnemy: Record<string, number>;
  totalEnemies: number;
  rawKillScore: number;
  hpBonusMax: number;
  theoreticalMax: number;
  /** 伺服器硬上限（向上取整至 500） */
  hardMax: number;
  lastSpawnMs: number;
  minGapMs: number;
} {
  const s = waveStats(OFFICIAL_WAVES);
  let raw = 0;
  for (const [id, n] of Object.entries(s.perEnemy)) raw += n * (SFX[id] ?? 0);
  const hpBonusMax = HP * HP_BONUS;
  const theoreticalMax = raw + hpBonusMax;
  return {
    perEnemy: s.perEnemy,
    totalEnemies: s.total,
    rawKillScore: raw,
    hpBonusMax,
    theoreticalMax,
    hardMax: Math.ceil(theoreticalMax / 500) * 500,
    lastSpawnMs: s.lastSpawnMs,
    minGapMs: s.minGapMs,
  };
}
