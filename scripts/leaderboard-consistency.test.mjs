/**
 * 規則一致性：波次（唯一來源）→ score-rules → Edge Function → SQL。
 *
 * 不是 grep 文字，而是：
 *  1) 以 event 展開 OFFICIAL_WAVES，算各敵人數量、擊破分、通關上限；
 *  2) 從 edge function 原始碼「解析」OFFICIAL_COUNTS / MAX_SCORE / MAX_KILLS 與分值表，比對數值；
 *  3) 從 migration SQL「解析」CHECK 範圍，比對分數上限、擊破上限與勝局時間；
 *  4) 從文件表格解析各段生成數，比對實算結果。
 * 任一處漂移都會失敗。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OFFICIAL_WAVES, waveStats } from '../src/systems/waves.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const SFX = { 'salmonella-normal': 200, 'sulfur_dioxide_excess-normal': 180, 'aflatoxin-normal': 150, 's_aureus-normal': 150 };

function segmentCounts(waves) {
  const times = [];
  for (const g of waves) {
    let t = g.atMs;
    g.batches.forEach((b, i) => {
      if (i > 0) t += g.gapBetweenBatchesMs;
      for (let k = 0; k < b.count; k += 1) { times.push(t); t += b.gapMs; }
    });
  }
  times.sort((a, b) => a - b);
  const bounds = [0, 30000, 60000, 90000, 120000, 150000, 170000, 180000];
  const out = [];
  for (let i = 0; i < 7; i += 1) out.push(times.filter((t) => t >= bounds[i] && t < bounds[i + 1]).length);
  return { segments: out, total: times.length, last: times.at(-1) ?? 0 };
}

const stats = waveStats(OFFICIAL_WAVES);
const raw = Object.entries(stats.perEnemy).reduce((a, [id, n]) => a + n * (SFX[id] ?? 0), 0);
const maxWin = raw + 5 * 200;
const exp = segmentCounts(OFFICIAL_WAVES);

test('波次展開：總生成、各段合計與逐段數量一致', () => {
  assert.equal(stats.total, 63);
  assert.equal(exp.total, 63);
  assert.equal(exp.segments.reduce((a, b) => a + b, 0), stats.total);
  assert.deepEqual(exp.segments, [7, 8, 9, 11, 12, 11, 5]);
  assert.equal(exp.last, 176000);
  assert.equal(stats.lastSpawnMs, 176000);
});

test('波次展開：四種敵人數量與擊破分、通關上限', () => {
  assert.deepEqual(stats.perEnemy, {
    'salmonella-normal': 26,
    'aflatoxin-normal': 14,
    'sulfur_dioxide_excess-normal': 12,
    's_aureus-normal': 11,
  });
  assert.equal(raw, 11110);
  assert.equal(maxWin, 12110);
});

test('Edge Function 常數與波次實算一致（解析原始碼，非搜尋文字）', () => {
  const src = readFileSync(`${ROOT}supabase/functions/leaderboard-submit/index.ts`, 'utf8');
  const counts = Object.fromEntries([...src.matchAll(/(salmonella|sulfur|aflatoxin|aureus):\s*(\d+)/g)]
    .filter((m) => m.index < src.indexOf('const HP_BONUS_PER_LIFE'))
    .map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(counts, { salmonella: 26, sulfur: 12, aflatoxin: 14, aureus: 11 }, 'OFFICIAL_COUNTS 必須等於波次實算');

  const maxScore = Number(src.match(/const MAX_SCORE = (\d+);/)[1]);
  const maxKills = Number(src.match(/const MAX_KILLS = (\d+);/)[1]);
  assert.equal(maxScore, 12500);
  assert.equal(maxScore, Math.ceil(maxWin / 500) * 500, '硬上限必須是通關最高分向上取整 500');
  assert.equal(maxKills, stats.total, '擊破上限必須等於波次總生成數');
});

test('SQL CHECK 與波次實算一致（解析 migration）', () => {
  const sql = readFileSync(`${ROOT}supabase/migrations/0004_leaderboard_v2_hardened.sql`, 'utf8');
  const scoreRange = sql.match(/check \(score between (\d+) and (\d+)\)/);
  const killsRange = sql.match(/check \(kills between (\d+) and (\d+)\)/);
  const wonDur = sql.match(/elapsed_ms >= (\d+)/);
  assert.equal(Number(scoreRange[2]), 12500);
  assert.equal(Number(killsRange[2]), stats.total);
  assert.equal(Number(wonDur[1]), 177000, '通關遊戲時間下限＝180 秒 − 3 秒容差');
});

test('SQL 暱稱限制：只驗非空、位元組上限、禁控制字元；不得用 \\X 或 char_length 字素近似', () => {
  const sql = readFileSync(`${ROOT}supabase/migrations/0004_leaderboard_v2_hardened.sql`, 'utf8');
  assert.ok(/octet_length\(nickname\) between 1 and 200/.test(sql), '應以位元組長度限制');
  assert.ok(!/\\\\X/.test(sql), 'PostgreSQL 內建正則不支援 \\X，不得使用');
  assert.ok(!/char_length\(nickname\)/.test(sql), '不得以 char_length 當字素計數');
  assert.ok(/nickname !~ '\[\[:cntrl:\]\]'/.test(sql), '應禁止控制字元');
});

test('五支函式權限：REVOKE 含 PUBLIC，GRANT 只給 service_role', () => {
  const sql = readFileSync(`${ROOT}supabase/migrations/0004_leaderboard_v2_hardened.sql`, 'utf8');
  const revokes = [...sql.matchAll(/revoke all on function [^(]+\([^)]*\)\s+from ([^;]+);/g)].map((m) => m[1]);
  assert.equal(revokes.length, 5);
  for (const r of revokes) {
    assert.ok(/public/i.test(r) && /anon/.test(r) && /authenticated/.test(r), `REVOKE 需含 public/anon/authenticated：${r}`);
  }
  const grants = [...sql.matchAll(/grant execute on function [^(]+\([^)]*\)\s+to ([^;]+);/g)].map((m) => m[1].trim());
  assert.equal(grants.length, 5);
  assert.ok(grants.every((g) => g === 'service_role'), '只授權 service_role');
  assert.ok(/begin;/.test(sql) && /commit;/.test(sql), '建立與授權必須同一交易');
});

test('IP salt：helpers 缺鹽時回 null，start 端點回明確設定錯誤', () => {
  const helpers = readFileSync(`${ROOT}supabase/functions/_shared/helpers.ts`, 'utf8');
  const start = readFileSync(`${ROOT}supabase/functions/leaderboard-start/index.ts`, 'utf8');
  assert.ok(!helpers.includes("?? 'no-salt'"), "不得以固定字串代替缺鹽");
  assert.ok(!/encode\(raw \+ '\|' \+ '[^']+'\)/.test(helpers), "雜湊輸入不得使用硬編碼鹽");
  assert.ok(/Promise<string \| null>/.test(helpers), 'ipHash 需可回 null 表示設定錯誤');
  assert.ok(/not_configured/.test(start), 'start 端點需回明確設定錯誤');
});

test('文件表格的逐段生成數與實算一致', () => {
  const doc = readFileSync(`${ROOT}docs/LEADERBOARD-RULES.md`, 'utf8');
  const rows = [...doc.matchAll(/^\| P(\d) \|[^|]*\|\s*(\d+)\s*\|/gm)].map((m) => Number(m[2]));
  assert.equal(rows.length, 7, '文件必須有 7 段');
  assert.deepEqual(rows, exp.segments, '文件逐段生成數必須等於實算');
});
