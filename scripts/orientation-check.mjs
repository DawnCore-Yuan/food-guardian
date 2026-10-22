import { connect } from './cdp-raw.mjs';

/**
 * 方向／縮放驗收（瀏覽器模擬；真機需另測）。
 * 用法：npm run dev（5180）＋ node scripts/orientation-check.mjs [--shots-only]
 * 量測：首頁直向提示、直→橫→直→橫後 canvas 比例與置中、遊戲中旋轉的暫停與 HUD、觸控命中、排行榜面板。
 */
const BASE = process.env.LB_BASE ?? 'http://openclaw-gateway:5180/';
const SHOTS = process.argv.includes('--shots-only');
const log = [];
const rec = (n, ok, d = '') => { log.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const MOBILE_PORTRAIT = { width: 390, height: 844 };
const MOBILE_LANDSCAPE = { width: 844, height: 390 };
const DESKTOP = { width: 1280, height: 720 };

const cdp = await connect(null, { target: /5180/ });
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');

const setViewport = async (w, h, mobile = true) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 3, mobile,
    screenOrientation: { angle: w > h ? 90 : 0, type: w > h ? 'landscapePrimary' : 'portraitPrimary' },
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
  // 模擬旋轉：先 resize 事件，再等穩定
  await cdp.evaluate('window.dispatchEvent(new Event("resize")); true');
  await cdp.sleep(700);
};
const sleep = (ms) => cdp.sleep(ms);
const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150); }
  return false;
};
const shot = async (name) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const path = `artifacts/orient-${name}.png`;
  const fs = await import('node:fs');
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(path, Buffer.from(r.data, 'base64'));
  return path;
};

const reload = async () => {
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(2500);
  await waitFor(() => cdp.evaluate('typeof window.__FG_GAME__ !== "undefined"'), 12000);
  await waitFor(() => cdp.evaluate('window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === "Menu")'), 12000);
  await sleep(600);
};
const hintCount = () => cdp.evaluate("document.querySelectorAll('.vp-rotate-hint').length");
const hintShown = () => cdp.evaluate(`(() => { const el = document.getElementById('rotate-hint'); return !!el && getComputedStyle(el).display !== 'none'; })()`);
const canvasFit = () => cdp.evaluate(`(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  const vv = window.visualViewport;
  const vw = Math.round(vv?.width ?? document.documentElement.clientWidth);
  const vh = Math.round(vv?.height ?? document.documentElement.clientHeight);
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), vw, vh,
    ratio: +(r.width / r.height).toFixed(4), covered: r.width <= vw + 1 && r.height <= vh + 1 };
})()`);

const tapCanvas = async (lx, ly) => {
  const b = await cdp.evaluate(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const x = b.x + (lx / 1280) * b.w;
  const y = b.y + (ly / 720) * b.h;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
};

// ── 1. 手機直向首次載入：首頁就要顯示提示，且蓋住按鈕 ──
await setViewport(MOBILE_PORTRAIT.width, MOBILE_PORTRAIT.height, true);
await cdp.send('Page.navigate', { url: BASE });
await sleep(1200);
await reload();
if (!SHOTS) {
  const before = await shot('portrait-menu');
  rec('直向首頁顯示旋轉提示', await hintShown(), before);
  rec('提示節點唯一（不重複堆疊）', (await hintCount()) === 1, 'count=' + (await hintCount()));
  const hit = await cdp.evaluate(`(() => {
    const el = document.getElementById('rotate-hint');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return { covers: top === el || el.contains(top), z: getComputedStyle(el).zIndex, pe: getComputedStyle(el).pointerEvents };
  })()`);
  rec('提示蓋住全螢幕並攔截觸控（不穿透點到開始）', !!hit && hit.covers && hit.pe !== 'none', JSON.stringify(hit));
}

// ── 2. 首頁直→橫→直→橫：比例、置中、按鈕可點 ──
await setViewport(MOBILE_LANDSCAPE.width, MOBILE_LANDSCAPE.height, true);
await sleep(400);
if (!SHOTS) {
  await shot('landscape-menu');
  rec('轉橫向後提示立即消失', !(await hintShown()));
  const fit = await canvasFit();
  rec('橫向 canvas 等比（≈16:9）且不超出可視區', Math.abs(fit.ratio - 16 / 9) < 0.02 && fit.covered, JSON.stringify(fit));
  rec('橫向 canvas 水平置中', Math.abs(fit.x - (fit.vw - fit.w) / 2) <= 2 && Math.abs(fit.y - (fit.vh - fit.h) / 2) <= 2, JSON.stringify(fit));
  // 實際點擊開始按鈕，必須真的進入 Game（證明沒有被殘留覆蓋層擋住）
  await tapCanvas(520, 461);
  const entered = await waitFor(() => cdp.evaluate('window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === "Game")'), 6000);
  rec('橫向首頁「開始遊戲」可實際點擊', entered);
  if (entered) {
    await cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").stopForMenu(); true');
    await waitFor(() => cdp.evaluate('window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === "Menu")'), 6000);
    await sleep(600);
  }
}
await setViewport(MOBILE_PORTRAIT.width, MOBILE_PORTRAIT.height, true);
await sleep(400);
if (!SHOTS) rec('再轉直向又重新顯示提示', await hintShown());
await setViewport(MOBILE_LANDSCAPE.width, MOBILE_LANDSCAPE.height, true);
await sleep(400);
if (!SHOTS) {
  rec('再轉回橫向提示消失', !(await hintShown()));
  const fit2 = await canvasFit();
  rec('反覆旋轉後比例仍正確（無拉伸）', Math.abs(fit2.ratio - 16 / 9) < 0.02, JSON.stringify(fit2));
}

// ── 3. 遊戲中旋轉：暫停、時間不前進、HUD 與觸控命中 ──
if (!SHOTS) {
  await tapCanvas(520, 461);            // 開始遊戲（rowY = 0.64 × 720）
  await waitFor(() => cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").run.phase === "playing"'));
  await sleep(1200);
  await shot('landscape-game');
  const t1 = await cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").run.elapsedMs');
  await sleep(700);
  const t2 = await cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").run.elapsedMs');
  rec('橫向遊戲中時間會前進', t2 > t1, t1 + ' → ' + t2);

  await setViewport(MOBILE_PORTRAIT.width, MOBILE_PORTRAIT.height, true);
  await sleep(600);
  await shot('portrait-game');
  rec('遊戲中轉直向顯示提示', await hintShown());
  rec('遊戲中轉直向已暫停', await cdp.evaluate('window.__FG_GAME__.scene.isPaused("Game")'));
  const p1 = await cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").run.elapsedMs');
  await sleep(1200);
  const p2 = await cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").run.elapsedMs');
  rec('暫停中遊戲時間不前進', p2 === p1, p1 + ' → ' + p2);
  const inputs = await cdp.evaluate(`(() => { const s = window.__FG_GAME__.scene.getScene('Game').input2.read(); return { x: s.moveX, y: s.moveY, f: s.firing }; })()`);
  rec('暫停後按鍵狀態已清除', inputs.x === 0 && inputs.y === 0 && inputs.f === false, JSON.stringify(inputs));

  await setViewport(MOBILE_LANDSCAPE.width, MOBILE_LANDSCAPE.height, true);
  await sleep(700);
  if (!SHOTS) {
    await shot('landscape-game-after-rotate');
    rec('轉回橫向提示消失', !(await hintShown()));
    rec('轉回橫向仍保持暫停（需手動繼續）', await cdp.evaluate('window.__FG_GAME__.scene.isPaused("Game")'));
    const fit3 = await canvasFit();
    rec('旋轉後 canvas 仍等比置中', Math.abs(fit3.ratio - 16 / 9) < 0.02 && fit3.covered, JSON.stringify(fit3));
    const sameRun = await cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").run.phase === "playing"');
    rec('旋轉不重置本局（phase 仍 playing）', sameRun);
    const touchHits = await cdp.evaluate(`(() => {
      const gs = window.__FG_GAME__.scene.getScene('Game');
      const t = gs.touch;
      return t ? { has: true } : { has: false };
    })()`);
    rec('觸控控制器存在（模擬行動裝置）', !!touchHits.has);
  }
  // 手動繼續
  await tapCanvas(640, 320);            // 「繼續」按鈕（height/2 − 40）
  await sleep(600);
  rec('手動按繼續後恢復', !(await cdp.evaluate('window.__FG_GAME__.scene.isPaused("Game")')));
}

// ── 4. 排行榜面板與暱稱輸入框在旋轉後仍可操作 ──
if (!SHOTS) {
  await cdp.evaluate(`(() => {
    const hud = window.__FG_GAME__.scene.getScene('Hud');
    const gs = window.__FG_GAME__.scene.getScene('Game');
    hud.openLeaderboardSubmit({ score: 11930, outcome: 'won', elapsedMs: 180000, kills: 62, escapes: 0, leaderboardEligible: true, runTicketId: null });
    return true;
  })()`);
  const opened = await waitFor(() => cdp.evaluate('!!document.getElementById("lb-nickname")'));
  rec('排行榜面板可開啟', opened);
  await shot('landscape-lb-panel');
  await setViewport(MOBILE_PORTRAIT.width, MOBILE_PORTRAIT.height, true);
  await sleep(500);
  const stillThere = await cdp.evaluate('!!document.getElementById("lb-nickname")');
  rec('旋轉後面板與輸入框仍在（未被重建）', stillThere);
  const box = await cdp.evaluate(`(() => { const r = document.querySelector('.lb-card').getBoundingClientRect(); const vv = window.visualViewport; return { w: Math.round(r.width), h: Math.round(r.height), vw: Math.round(vv.width), vh: Math.round(vv.height), inside: r.left >= -1 && r.top >= -1 && r.right <= vv.width + 1 && r.bottom <= vv.height + 1 }; })()`);
  rec('直向時面板仍在可視區內（可捲動、不溢出）', !!box && box.inside, JSON.stringify(box));
  await setViewport(MOBILE_LANDSCAPE.width, MOBILE_LANDSCAPE.height, true);
  await sleep(500);
  const box2 = await cdp.evaluate(`(() => { const r = document.querySelector('.lb-card')?.getBoundingClientRect(); const vv = window.visualViewport; return r ? { w: Math.round(r.width), h: Math.round(r.height), vw: Math.round(vv.width), vh: Math.round(vv.height), inside: r.left >= -1 && r.top >= -1 && r.right <= vv.width + 1 && r.bottom <= vv.height + 1 } : null; })()`);
  rec('轉回橫向面板回到可視區內', !!box2 && box2.inside, JSON.stringify(box2));
  const hit = await cdp.evaluate(`(() => {
    const el = document.getElementById('lb-nickname');
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    el.focus();
    return { reachable: top === el || el.contains(top), focused: document.activeElement === el };
  })()`);
  rec('輸入框在旋轉後仍可點到並取得焦點', hit.reachable && hit.focused, JSON.stringify(hit));
  // 實際輸入（不是只看 DOM 存在）
  await cdp.send('Input.insertText', { text: 'WASD 食安' });
  const typed = await cdp.evaluate("document.getElementById('lb-nickname').value");
  rec('暱稱輸入框可實際輸入文字', typed.includes('WASD') && typed.includes('食安'), typed);
}

// ── 5. 桌面 ──
await setViewport(DESKTOP.width, DESKTOP.height, false);
await setViewport(1440, 900, false);
await reload();
if (!SHOTS) {
  await shot('desktop-menu');
  rec('桌面不顯示旋轉提示', !(await hintShown()));
  const d = await canvasFit();
  rec('桌面 canvas 等比置中', Math.abs(d.ratio - 16 / 9) < 0.02 && d.covered, JSON.stringify(d));
}

console.log(log.join('\n'));
const failed = log.filter((l) => l.startsWith('FAIL')).length;
cdp.close();
process.exit(failed === 0 ? 0 : 2);
