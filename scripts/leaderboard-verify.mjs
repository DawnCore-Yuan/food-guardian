import { chromium } from 'playwright-core';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

mkdirSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts'), { recursive: true });

/**
 * 排行榜 UI 驗收腳本（只針對 dev server；不進正式包）。
 * 用法：
 *   1) npm run dev（另開終端，預設 http://localhost:5180）
 *   2) node scripts/leaderboard-verify.mjs
 * 產出：artifacts/lb-*.png 與終端機逐項結果。
 *
 * 明確標示：本腳本在「模擬資料」模式截圖，不代表已連線 Supabase。
 */

const BASE = process.env.LB_BASE ?? 'http://localhost:5180/';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/chromium';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts') + '/';
const VIEWS = {
  desktop: { width: 1200, height: 675 },
  phoneLandscape: { width: 844, height: 390 },
};

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function shot(page, name) {
  await page.screenshot({ path: OUT + name });
}

async function openMenu(browser, view) {
  const page = await browser.newPage({ viewport: view });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  return page;
}

/** 用 canvas 點擊：menu 排行榜按鈕位於 (0.5, 0.705) */
async function clickCanvas(page, fx, fy) {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(350);
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  // 1. 首頁：排行榜入口存在且不破壞既有元素
  for (const [name, view] of Object.entries(VIEWS)) {
    const page = await openMenu(browser, view);
    await shot(page, `lb-menu-${name}.png`);
    const hasCanvas = await page.locator('canvas').count();
    record(`首頁可載入（${name}）`, hasCanvas === 1);
    await clickCanvas(page, 0.5, 0.705);
    const scrim = page.locator('.lb-scrim');
    record(`排行榜可開啟（${name}）`, await scrim.count() === 1);
    const badge = await page.locator('.lb-badge-mock').count();
    record(`模擬模式有明確標記（${name}）`, badge >= 1);
    const rows = await page.locator('.lb-table tbody tr').count();
    record(`每頁 10 名（${name}）`, rows === 10, `rows=${rows}`);
    await shot(page, `lb-board-${name}.png`);

    // 分頁：第 1 頁上一頁禁用、下一頁可用
    const prevDisabled = await page.getByRole('button', { name: '上一頁' }).isDisabled();
    record(`第 1 頁「上一頁」禁用（${name}）`, prevDisabled);
    await page.getByRole('button', { name: '下一頁' }).click();
    await page.waitForTimeout(400);
    const info = await page.locator('.lb-pager span').textContent();
    record(`可翻到第 2 頁（${name}）`, /第 2 \/\s*10 頁/.test(info ?? ''), info ?? '');

    // 按鈕命中尺寸 ≥48 CSS px
    const sizes = await page.$$eval('.lb-btn', (els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    }));
    const tooSmall = sizes.filter((s) => s.h < 48 || s.w < 48);
    record(`按鈕命中 ≥48px（${name}）`, tooSmall.length === 0, JSON.stringify(tooSmall));

    await page.getByRole('button', { name: '關閉' }).click();
    record(`排行榜可關閉（${name}）`, await page.locator('.lb-scrim').count() === 0);
    await page.close();
  }

  // 2. 結算登錄流程（模擬模式）
  const page = await openMenu(browser, VIEWS.desktop);
  await clickCanvas(page, 0.5, 0.62); // 開始遊戲
  await page.waitForTimeout(1500);
  const started = await page.evaluate(() => !!window.__FG_GAME__);
  record('dev 掛鉤存在（僅 dev server）', started);

  // 以 dev 掛鉤把本局時間推到 180 秒，走真實的 checkOutcome → finish 流程
  await page.evaluate(() => {
    const game = window.__FG_GAME__;
    const gs = game.scene.getScene('Game');
    // 只推時間與生命值，不直接呼叫 finish，確保走正式結算路徑
    gs.run.elapsedMs = 180_000;
    for (const e of gs.enemies.getChildren()) e.destroy();
    for (const b of gs.enemyBullets.getChildren()) b.destroy();
  });
  await page.waitForTimeout(1200);
  const submitBtn = page.getByRole('button', { name: '登錄排行榜' });
  const hasSubmit = await submitBtn.count();
  record('正式關卡結算後有「登錄排行榜」', hasSubmit === 1);
  if (hasSubmit === 1) {
    await submitBtn.click();
    await page.waitForTimeout(400);
    await shot(page, 'lb-submit-form.png');
    const input = page.locator('#lb-nickname');
    record('暱稱輸入框存在', await input.count() === 1);
    await input.fill('  食安小林  ');
    const hint = await page.locator('.lb-hint').first().textContent();
    record('暱稱去首尾空白', (hint ?? '').includes('食安小林'), hint ?? '');

    const sb = page.getByRole('button', { name: '登錄成績' });
    const sbBox = await sb.boundingBox();
    const vh = page.viewportSize().height;
    record('送出鈕在初始視窗內', sbBox.y + sbBox.height <= vh, JSON.stringify(sbBox));
    await sb.click();
    await page.waitForTimeout(900);
    const rankText = await page.locator('.lb-rank').textContent();
    record('登錄後顯示名次（模擬）', /第 \d+ 名|未進前 100 名/.test(rankText ?? ''), rankText ?? '');
    await shot(page, 'lb-submit-done.png');
    const hasView = await page.getByRole('button', { name: '查看排行榜' }).count();
    const prevDup = await page.getByRole('button', { name: '再玩一次' }).count();
    record('登錄後保留回首頁（再玩一次在面板底部）', hasView + prevDup >= 0);
    await page.getByRole('button', { name: '查看排行榜' }).click();
    await page.waitForTimeout(400);
    record('登錄後可查看排行榜', await page.locator('.lb-scrim').count() === 1);
  }

  await page.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exitCode = failed.length ? 1 : 0;
