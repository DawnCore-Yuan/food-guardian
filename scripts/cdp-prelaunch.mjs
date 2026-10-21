import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://foodsky-test:9222');
const ctx = browser.contexts()[0] ?? await browser.newContext();
const page = await ctx.newPage();
const log = [];
const rec = (n, ok, d = '') => log.push((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : ''));
const BASE = 'http://openclaw-gateway:5181/';
const out = [];

async function measureAt(w, h, tag) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const g = window.__FG_GAME__;
    const menu = g.scene.getScene('Menu');
    const pick = (name) => menu.children.list.find((o) => o.name === name);
    const s = pick('menu-start-hit');
    const l = pick('menu-leaderboard-hit');
    const sb = s?.getBounds();
    const lb = l?.getBounds();
    const canvas = g.canvas.getBoundingClientRect();
    const k = canvas.width / g.scale.width;
    return {
      canvasCss: { w: Math.round(canvas.width), h: Math.round(canvas.height) },
      start: sb && { x: sb.x, y: sb.y, w: sb.width, h: sb.height },
      lb: lb && { x: lb.x, y: lb.y, w: lb.width, h: lb.height },
      css: k,
      overlap: !!(sb && lb && sb.right > lb.x && lb.right > sb.x && sb.bottom > lb.y && lb.bottom > sb.y),
    };
  });
  const box = await page.locator('canvas').boundingBox();
  const toScreen = (x, y) => [box.x + (x / 1280) * box.width, box.y + (y / 720) * box.height];
  const sCss = info.start ? { w: info.start.w * info.css, h: info.start.h * info.css } : null;
  const lCss = info.lb ? { w: info.lb.w * info.css, h: info.lb.h * info.css } : null;
  gapLogical = info.lb && info.start ? info.lb.x - (info.start.x + info.start.w) : 0;
  rec(`${tag} 兩鈕不重疊`, !info.overlap, JSON.stringify({ start: info.start, lb: info.lb }));
  rec(`${tag} 等高`, !!info.start && Math.abs(info.start.h - info.lb.h) < 0.5, `${info.start?.h}/${info.lb?.h}`);
  rec(`${tag} 間距 24–32 邏輯px`, gapLogical >= 24 && gapLogical <= 32, String(gapLogical));
  rec(`${tag} 命中區 ≥48 CSS px`, !!sCss && !!lCss && sCss.h >= 48 && lCss.h >= 48 && sCss.w >= 48 && lCss.w >= 48, JSON.stringify({ sCss, lCss }));
  rec(`${tag} 整組水平置中`, Math.abs((info.start.x + info.lb.x + info.lb.w - (1280 - info.start.x)) / 2) < 2, `left=${info.start.x.toFixed(1)} right=${(1280 - (info.lb.x + info.lb.w)).toFixed(1)}`);
  await page.screenshot({ path: 'artifacts/' + tag + '.png' });
  return { info, toScreen, tag };
}
let gapLogical = 0;

// 桌面
const d = await measureAt(1200, 675, 'menu-buttons-desktop');
// 點擊右鈕 → 排行榜（未連線應顯示尚未開放）
await page.mouse.click(...d.toScreen(d.info.lb.x + d.info.lb.w / 2, d.info.lb.y + d.info.lb.h / 2));
await page.waitForTimeout(600);
const boardText = await page.locator('.lb-scrim').innerText().catch(() => '');
rec('桌面點「排行榜」開啟面板', await page.locator('.lb-scrim').count() === 1);
rec('未連線顯示「排行榜尚未開放」', boardText.includes('排行榜尚未開放'), boardText.slice(0, 40));
rec('不顯示假榜單（無表格、無模擬字樣）', await page.locator('.lb-table').count() === 0 && !boardText.includes('模擬'));
await page.screenshot({ path: 'artifacts/lb-unavailable-desktop.png' });
await page.getByRole('button', { name: '關閉' }).click();

// 點擊左鈕 → 遊戲
await page.mouse.click(...d.toScreen(d.info.start.x + d.info.start.w / 2, d.info.start.y + d.info.start.h / 2));
await page.waitForTimeout(1600);
const inGame = await page.evaluate(() => window.__FG_GAME__.scene.getScenes(true).map((s) => s.scene.key));
rec('桌面點「開始遊戲」進入遊戲', inGame.includes('Game'), JSON.stringify(inGame));
await page.screenshot({ path: 'artifacts/game-start-desktop.png' });

// 結算（快轉僅驗證結算流程，不代表整場量測）
await page.evaluate(() => { window.__FG_GAME__.scene.getScene('Game').run.elapsedMs = 179_990; });
await page.waitForTimeout(900);
const settled = await page.evaluate(() => ({ phase: window.__FG_GAME__.scene.getScene('Game').run.phase, fin: window.__FIN_CALLS__ }));
rec('180 秒立即結算（won，只一次）', settled.phase === 'won' && settled.fin === 1, JSON.stringify(settled));
const panel = await page.evaluate(() => {
  const hud = window.__FG_GAME__.scene.getScene('Hud');
  const texts = [];
  const walk = (l) => l.forEach((o) => { if (o.text) texts.push(o.text); if (o.list) walk(o.list); });
  walk(hud.children.list);
  return texts;
});
rec('結算面板顯示資格說明（未連線→不列入）', panel.some((t) => t.includes('不列入排行榜') || t.includes('登錄排行榜')), panel.filter((t) => t.includes('排行')).join('|'));
await page.screenshot({ path: 'artifacts/game-result-desktop.png' });

// 再玩一次（面板按鈕 y = 530）
const cbox = await page.locator('canvas').boundingBox();
await page.mouse.click(cbox.x + (640 / 1280) * cbox.width, cbox.y + (530 / 720) * cbox.height);
await page.waitForTimeout(1500);
const replay = await page.evaluate(() => { const g = window.__FG_GAME__.scene.getScene('Game'); return { phase: g.run.phase, t: Math.round(g.run.elapsedMs), hp: g.run.hp }; });
rec('再玩一次為全新一局', replay.phase === 'playing' && replay.t < 5000, JSON.stringify(replay));

// 回到選單（暫停 → 回主選單不易自動化；改以 stopForMenu 走正式路徑）
await page.evaluate(() => window.__FG_GAME__.scene.getScene('Game').stopForMenu());
await page.waitForTimeout(900);
const backMenu = await page.evaluate(() => window.__FG_GAME__.scene.getScenes(true).map((s) => s.scene.key));
rec('返回主選單', backMenu.includes('Menu') && !backMenu.includes('Game'), JSON.stringify(backMenu));

// 手機橫向
const m = await measureAt(844, 390, 'menu-buttons-phone');
await page.mouse.click(...m.toScreen(m.info.lb.x + m.info.lb.w / 2, m.info.lb.y + m.info.lb.h / 2));
await page.waitForTimeout(600);
rec('手機點「排行榜」開啟面板', await page.locator('.lb-scrim').count() === 1);
await page.screenshot({ path: 'artifacts/lb-unavailable-phone.png' });

console.log(log.join('\n'));
await page.close();
await browser.close();
