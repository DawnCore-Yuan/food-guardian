/**
 * 排行榜伺服器時間規則（純函式版本）＋案例表（SCRIPT-LEVEL）。
 *
 * 為什麼是「純函式版本」：Edge Function 依賴 Deno 與 Supabase 環境，容器內無法執行；
 * 這裡把 submit 的時間/分數判定抽成同一組常數與同一段邏輯獨立實作，
 * 逐案驗證規則，並在 docs/LEADERBOARD-RULES.md 標明「尚未在雲端實跑」。
 * 兩邊若改動，必須同步修改這裡的常數（測試會抓出不一致的行為）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// v2（official-180s-v2）：由 src/systems/waves.ts 七段波次算出，數字與 Edge Function／SQL 一致
const RULES = {
  SFX: { salmonella: 200, sulfur: 180, aflatoxin: 150, aureus: 150 },
  COUNTS: { salmonella: 26, sulfur: 12, aflatoxin: 14, aureus: 11 },
  HP: 5,
  HP_BONUS_PER_LIFE: 200,
  MAX_SCORE: 12500,
  MAX_KILLS: 63,
  DURATION_MS: 180000,
  MIN_LOST_MS: 0,          // 不放任意下限：最早可能陣亡由遊戲規則決定
  MAX_GAME_MS: 240000,
  SLACK_MS: 3000,
};
const RAW_MAX = RULES.COUNTS.salmonella * RULES.SFX.salmonella
  + RULES.COUNTS.sulfur * RULES.SFX.sulfur
  + RULES.COUNTS.aflatoxin * RULES.SFX.aflatoxin
  + RULES.COUNTS.aureus * RULES.SFX.aureus;

/**
 * @param {object} p 客戶端提交內容
 * @param {number} serverElapsedMs 伺服器時間 − 伺服器核發時間（ms）
 * @returns {{ok: true} | {ok: false, code: string}}
 */
function evaluate(p, serverElapsedMs) {
  if (p.score > RULES.MAX_SCORE) return { ok: false, code: 'bad_score' };
  if (p.kills > RULES.MAX_KILLS || p.escapes > RULES.MAX_KILLS) return { ok: false, code: 'bad_stats' };
  if (serverElapsedMs < 0) return { ok: false, code: 'bad_time' };
  if (p.elapsedMs > serverElapsedMs + RULES.SLACK_MS) return { ok: false, code: 'bad_time' };
  if (p.outcome === 'won' && serverElapsedMs < RULES.DURATION_MS) return { ok: false, code: 'bad_time' };
  if (p.elapsedMs < RULES.MIN_LOST_MS) return { ok: false, code: 'bad_time' };
  if (p.outcome === 'won' && p.elapsedMs < RULES.DURATION_MS - RULES.SLACK_MS) return { ok: false, code: 'bad_time' };
  if (p.score > RAW_MAX + RULES.HP_BONUS_PER_LIFE && p.kills < RULES.MAX_KILLS) return { ok: false, code: 'bad_score' };
  if (p.outcome === 'lost' && p.score > RAW_MAX) return { ok: false, code: 'bad_score' };
  return { ok: true };
}

const base = { outcome: 'lost', score: 4200, elapsedMs: 60000, kills: 21, escapes: 0 };
const won = { outcome: 'won', score: 12110, elapsedMs: 180400, kills: 63, escapes: 0 };

// ── 成功案例 ──
test('成功：通關（伺服器時間已跨 180 秒）', () => {
  assert.deepEqual(evaluate(won, 181000), { ok: true });
});
test('成功：通關後暫停 10 分鐘才輸入暱稱，仍可登錄', () => {
  assert.deepEqual(evaluate(won, 181000 + 600000), { ok: true });
});
test('成功：180 秒前正常陣亡（lost）', () => {
  assert.deepEqual(evaluate({ ...base, elapsedMs: 45000 }, 46000), { ok: true });
});
test('成功：開局 2 秒被撞死也能登錄（無任意 3 秒下限）', () => {
  assert.deepEqual(evaluate({ ...base, score: 0, kills: 0, elapsedMs: 2000 }, 2400), { ok: true });
});

// ── 拒絕案例：時間 ──
test('拒絕：宣稱通關但伺服器時間不足 180 秒（提前偽造 won）', () => {
  assert.deepEqual(evaluate(won, 120000), { ok: false, code: 'bad_time' });
});
test('拒絕：客戶端遊戲時間大於伺服器經過時間（回報造假）', () => {
  assert.deepEqual(evaluate({ ...base, elapsedMs: 90000 }, 40000), { ok: false, code: 'bad_time' });
});
test('成功（容差內）：1.5 秒遊戲時間 vs 0.5 秒伺服器時間，差 1 秒 < 3 秒容差', () => {
  // 1500ms 遊戲時間 vs 500ms 伺服器經過時間：超出 3 秒容差？沒有（差 1 秒），因此不應以時間為由拒絕
  assert.deepEqual(evaluate({ ...base, elapsedMs: 1500 }, 500), { ok: true });
});
test('拒絕：通關時間低於 180 秒（差額超過容差）', () => {
  assert.deepEqual(evaluate({ ...won, elapsedMs: 170000 }, 200000), { ok: false, code: 'bad_time' });
});

// ── 拒絕案例：分數／統計 ──
test('拒絕：分數超過 12500 上限', () => {
  assert.deepEqual(evaluate({ ...won, score: 12501, kills: 63 }, 181000), { ok: false, code: 'bad_score' });
});
test('拒絕：未通關卻拿了生命獎勵級分數', () => {
  assert.deepEqual(evaluate({ ...base, score: 12000, kills: 60 }, 200000), { ok: false, code: 'bad_score' });
});
test('拒絕：高分但擊破數不足', () => {
  assert.deepEqual(evaluate({ ...won, score: 12110, kills: 10 }, 181000), { ok: false, code: 'bad_score' });
});
test('拒絕：擊破數超過波次總數 63', () => {
  assert.deepEqual(evaluate({ ...won, kills: 64 }, 181000), { ok: false, code: 'bad_stats' });
});

// ── 計分依據本身 ──
test('計分依據（v2）：63 隻、擊破 11,110、理論上限 12,110、硬上限 12,500', () => {
  assert.equal(RAW_MAX, 11110);
  assert.equal(RAW_MAX + RULES.HP * RULES.HP_BONUS_PER_LIFE, 12110);
  assert.equal(RULES.MAX_SCORE, 12500);
  assert.equal(RULES.COUNTS.salmonella + RULES.COUNTS.sulfur + RULES.COUNTS.aflatoxin + RULES.COUNTS.aureus, RULES.MAX_KILLS);
  assert.equal(RULES.MAX_KILLS, 63);
});
