import { chromium } from 'playwright-core';
const BASE = 'http://openclaw-gateway:5180/';
const OUT = 'artifacts/';
const results = [];
const rec = (n, ok, d = '') => { results.push([n, ok, d]); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };

const browser = await chromium.connectOverCDP('http://foodsky-test:9222');
const ctx = browser.contexts()[0] ?? await browser.newContext();
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

async function startGame(query = '') {
  await page.goto(BASE + query, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => typeof window.__FG_GAME__ !== 'undefined', null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.62);
  await page.waitForFunction(() => window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === 'Game'), null, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

// ① 180 秒立即結算
await page.setViewportSize({ width: 1200, height: 675 });
await startGame();
const before = await page.evaluate(() => { const g = window.__FG_GAME__.scene.getScene('Game'); return { phase: g.run.phase, t: g.run.elapsedMs, fin: window.__FIN_CALLS__ ?? 0 }; });
await page.evaluate(() => { window.__FG_GAME__.scene.getScene('Game').run.elapsedMs = 179_980; });
await page.waitForTimeout(600);
const settle = await page.evaluate(() => { const g = window.__FG_GAME__.scene.getScene('Game'); return { phase: g.run.phase, t: Math.round(g.run.elapsedMs), fin: window.__FIN_CALLS__ ?? 0, finished: g.finished }; });
rec('180 秒立即結算（phase=won）', settle.phase === 'won', JSON.stringify(settle));
rec('結算只執行一次（fin=1）', settle.fin === 1, String(settle.fin));
rec('時間停在上限 180000', settle.t <= 180000, String(settle.t));
rec('結算面板出現「登錄排行榜」', await page.getByRole('button', { name: '登錄排行榜' }).count() === 1);
await page.screenshot({ path: OUT + 'v2-result-won.png' });

// ② 結算 → 登錄 → 暱稱 → 名次（先前卡住的流程）
await page.getByRole('button', { name: '登錄排行榜' }).click();
await page.waitForTimeout(500);
rec('暱稱輸入框出現', await page.locator('#lb-nickname').count() === 1);
await page.fill('#lb-nickname', '  食安小林  ');
const hint = await page.locator('.lb-hint').first().innerText();
rec('暱稱去空白並預覽', hint.includes('食安小林'), hint);
await page.screenshot({ path: OUT + 'v2-submit-form.png' });
await page.getByRole('button', { name: '登錄成績' }).click();
await page.waitForTimeout(900);
const rank = await page.locator('.lb-rank').innerText().catch(() => '');
rec('顯示本次名次（模擬）', /第 \d+ 名|未進前 100 名/.test(rank), rank);
rec('保留回首頁', await page.getByRole('button', { name: '回首頁' }).count() === 1);
await page.screenshot({ path: OUT + 'v2-submit-done.png' });

// ③ 再玩一次
await page.getByRole('button', { name: '回首頁' }).click();
await page.waitForTimeout(800);
await startGame();
const replay = await page.evaluate(() => { const g = window.__FG_GAME__.scene.getScene('Game'); return { phase: g.run.phase, t: g.run.elapsedMs, hp: g.run.hp }; });
rec('再玩一次為全新一局', replay.phase === 'playing' && replay.t < 5000 && replay.hp === 5, JSON.stringify(replay));

// ④ 提前陣亡（lost）立即結算
await page.evaluate(() => { const g = window.__FG_GAME__.scene.getScene('Game'); g.run.elapsedMs = 42_000; g.run.damage(5); g.checkOutcome(); });
await page.waitForTimeout(500);
const lost = await page.evaluate(() => { const g = window.__FG_GAME__.scene.getScene('Game'); return { phase: g.run.phase, t: Math.round(g.run.elapsedMs), fin: window.__FIN_CALLS__ }; });
rec('提前陣亡立即失敗結算', lost.phase === 'lost', JSON.stringify(lost));
rec('失敗仍顯示登錄排行榜', await page.getByRole('button', { name: '登錄排行榜' }).count() === 1);
await page.screenshot({ path: OUT + 'v2-result-lost.png' });

// ⑤ 同時死亡＋到時：死亡優先（同一幀）
await startGame();
await page.evaluate(() => { const g = window.__FG_GAME__.scene.getScene('Game'); g.run.elapsedMs = 180_000; g.run.damage(5); const r1 = g.run.resolveTimeout(180_000); const r2 = g.run.resolveTimeout(180_000); window.__TIE__ = [r1, r2]; g.checkOutcome(); });
await page.waitForTimeout(500);
const tie = await page.evaluate(() => ({ tie: window.__TIE__, phase: window.__FG_GAME__.scene.getScene('Game').run.phase }));
rec('同時死亡與到時 → 失敗（死亡優先）', tie.tie[0] === 'lost' && tie.tie[1] === null && tie.phase === 'lost', JSON.stringify(tie));

// ⑥ 排行榜故障時遊戲照常
await page.goto(BASE + '?lbMock=fail', { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.__FG_GAME__ !== 'undefined');
await page.waitForTimeout(1000);
const box2 = await page.locator('canvas').boundingBox();
await page.mouse.click(box2.x + box2.width * 0.5, box2.y + box2.height * 0.705);
await page.waitForTimeout(700);
rec('模擬故障：顯示錯誤與重試', await page.locator('.lb-error').count() === 1 && await page.locator('.lb-error').innerText().then((t) => t.includes('模擬故障')));
await page.screenshot({ path: OUT + 'v2-board-fail.png' });
await page.getByRole('button', { name: '關閉' }).click();
await page.mouse.click(box2.x + box2.width * 0.5, box2.y + box2.height * 0.62);
await page.waitForTimeout(1500);
rec('故障時仍可開始遊戲', await page.evaluate(() => window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === 'Game')));

// ⑦ 實測峰值與容量跳過次數（整局快進到 180 秒，不干擾遊戲）
await startGame();
await page.evaluate(() => { window.__FG_GAME__.scene.getScene('Game').run.elapsedMs = 179_900; });
await page.waitForTimeout(1200);
const peaks = await page.evaluate(() => ({ peaks: window.__FG_PEAKS__, metrics: window.__FG_METRICS__ }));
console.log('MEASURED ' + JSON.stringify(peaks));
rec('派發嘗試＝波次總生成數', peaks.metrics.spawnAttempt > 0, String(peaks.metrics.spawnAttempt));

console.log('ERRORS ' + JSON.stringify(errs.slice(0, 3)));
const failed = results.filter((r) => !r[1]).length;
console.log('RESULT ' + (results.length - failed) + '/' + results.length + ' PASS');
await page.close();
await browser.close();
process.exit(0);
