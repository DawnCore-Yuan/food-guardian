import { chromium } from 'playwright-core';
const OUT = 'artifacts/';
const browser = await chromium.connectOverCDP('http://foodsky-test:9222');
const ctx = browser.contexts()[0] ?? await browser.newContext();
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
const log = [];
const check = (name, pass, detail = '') => { console.error('STEP ' + name + ' ' + pass); log.push(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);

async function openMenu(view) {
  await page.setViewportSize(view);
  await page.goto('http://openclaw-gateway:5180/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
}

// ── 桌面：首頁 → 排行榜 → 分頁 → 關閉 → 開始遊戲 → 模擬結算 → 登錄 ──
await openMenu({ width: 1200, height: 675 });
await page.screenshot({ path: OUT + 'lb-menu-desktop.png' });
const box = await page.locator('canvas').boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.705);
await page.waitForTimeout(600);
check('桌面可開排行榜', await page.locator('.lb-scrim').count() === 1);
check('模擬標記存在', await page.locator('.lb-badge-mock').count() >= 1);
check('每頁 10 名', await page.locator('.lb-table tbody tr').count() === 10);
await page.screenshot({ path: OUT + 'lb-board-desktop.png' });
await page.getByRole('button', { name: '下一頁' }).click();
await page.waitForTimeout(400);
check('翻頁到 2/10', /第 2 \/ 10 頁/.test(await page.locator('.lb-pager span').innerText()));
await page.getByRole('button', { name: '關閉' }).click();
check('可關閉', await page.locator('.lb-scrim').count() === 0);

await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.62);
await page.waitForTimeout(1500);
const activeScenes = await page.evaluate(() => { const g = window.__FG_GAME__; return g ? g.scene.getScenes(true).map((sc) => sc.scene.key) : null; });
check('進入遊戲場景', Array.isArray(activeScenes) && activeScenes.includes('Game'), JSON.stringify(activeScenes));
// 推到 180 秒並清空敵人，走正式 checkOutcome → finish
await page.evaluate(() => {
  const gs = window.__FG_GAME__.scene.getScene('Game');
  gs.run.elapsedMs = 180_000;
  for (const e of [...gs.enemies.getChildren()]) e.destroy();
  for (const b of [...gs.enemyBullets.getChildren()]) b.destroy();
});
await page.waitForTimeout(1200);
const submitBtn = page.getByRole('button', { name: '登錄排行榜' });
check('結算面板有登錄排行榜', await submitBtn.count() === 1);
await page.screenshot({ path: OUT + 'lb-result.png' });
await submitBtn.click();
await page.waitForTimeout(500);
check('暱稱輸入框出現', await page.locator('#lb-nickname').count() === 1);
await page.locator('#lb-nickname').fill('  食安小林  ');
const hint = await page.locator('.lb-hint').first().innerText();
check('暱稱去空白並預覽', hint.includes('食安小林'), hint);
const sb = await page.getByRole('button', { name: '登錄成績' }).boundingBox();
check('送出鈕在視窗內', sb.y + sb.height <= 675, JSON.stringify(sb));
await page.screenshot({ path: OUT + 'lb-submit-form.png' });
await page.getByRole('button', { name: '登錄成績' }).click();
await page.waitForTimeout(900);
const rank = await page.locator('.lb-rank').innerText();
check('顯示名次（模擬）', /第 \d+ 名|未進前 100 名/.test(rank), rank);
await page.screenshot({ path: OUT + 'lb-submit-done.png' });
check('有查看排行榜', await page.getByRole('button', { name: '查看排行榜' }).count() === 1);
check('有回首頁', await page.getByRole('button', { name: '回首頁' }).count() === 1);
await page.getByRole('button', { name: '回首頁' }).click();
await page.waitForTimeout(800);
const menuActive = await page.evaluate(() => window.__FG_GAME__.scene.getScenes(true).map((sc) => sc.scene.key));
check('回首頁後回到選單', menuActive.includes('Menu'), JSON.stringify(menuActive));

// ── 手機橫向：輸入框與送出鈕不被裁切、按鈕 ≥48px ──
await openMenu({ width: 844, height: 390 });
await page.screenshot({ path: OUT + 'lb-menu-phone.png' });
const c2 = await page.locator('canvas').boundingBox();
await page.mouse.click(c2.x + c2.width * 0.5, c2.y + c2.height * 0.705);
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + 'lb-board-phone.png' });
const btnSizes = await page.$$eval('.lb-btn', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
check('手機按鈕 ≥48px', btnSizes.every(([w, h]) => w >= 48 && h >= 48), JSON.stringify(btnSizes));
const cardBox = await page.locator('.lb-card').boundingBox();
check('手機卡片在視窗內', cardBox.y >= 0 && cardBox.y + cardBox.height <= 391, JSON.stringify(cardBox));
await page.getByRole('button', { name: '關閉' }).click();

console.log(log.join('\n'));
console.log('ERRORS', JSON.stringify(errs.slice(0, 5)));
await page.close();
await browser.close();
