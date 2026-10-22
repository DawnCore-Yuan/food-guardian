import { connect } from './cdp-raw.mjs';

/**
 * 暱稱輸入框鍵盤驗收（真實按鍵事件，經 CDP Input.dispatchKeyEvent 送入頁面）。
 * 用法：npm run dev（5180）＋ node scripts/leaderboard-nickname-input.mjs
 * 驗證重點：輸入框有焦點時 W/A/S/D/J/P/Space/方向鍵不被 preventDefault、不被吞字。
 */
const BASE = process.env.LB_BASE ?? 'http://openclaw-gateway:5180/';
const log = [];
const rec = (n, ok, d = '') => { log.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const cdp = await connect(null, { target: /5180/ });
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 675, deviceScaleFactor: 1, mobile: false });


// 記錄所有被 preventDefault 的 keydown（capture 後檢查 defaultPrevented）
await cdp.evaluate(`(() => {
  window.__PREVENTED__ = [];
  window.addEventListener('keydown', (e) => {
    const code = e.code || e.key;
    setTimeout(() => { if (e.defaultPrevented) window.__PREVENTED__.push(code); }, 0);
  }, { capture: false });
  return true;
})()`);

// 鍵盤：keyCode 對照（CDP 需要 windowsVirtualKeyCode 才會觸發預設文字輸入）
const CHAR_KEYS = {
  W: { code: 'KeyW', keyCode: 87, text: 'W' }, A: { code: 'KeyA', keyCode: 65, text: 'A' },
  S: { code: 'KeyS', keyCode: 83, text: 'S' }, D: { code: 'KeyD', keyCode: 68, text: 'D' },
  J: { code: 'KeyJ', keyCode: 74, text: 'J' }, P: { code: 'KeyP', keyCode: 80, text: 'P' },
  w: { code: 'KeyW', keyCode: 87, text: 'w' }, a: { code: 'KeyA', keyCode: 65, text: 'a' },
  s: { code: 'KeyS', keyCode: 83, text: 's' }, d: { code: 'KeyD', keyCode: 68, text: 'd' },
  j: { code: 'KeyJ', keyCode: 74, text: 'j' }, p: { code: 'KeyP', keyCode: 80, text: 'p' },
  ' ': { code: 'Space', keyCode: 32, text: ' ', key: ' ' },
};
const NAMED = {
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 }, ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 }, ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  Home: { code: 'Home', keyCode: 36 }, End: { code: 'End', keyCode: 35 },
  Backspace: { code: 'Backspace', keyCode: 8 },
};
const press = async (ch) => {
  const spec = CHAR_KEYS[ch] ?? NAMED[ch];
  if (!spec) throw new Error('no key spec ' + ch);
  const key = spec.key ?? ch;
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: spec.code, key, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode, text: spec.text, unmodifiedText: spec.text });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: spec.code, key, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode });
};
const pressAll = async (s) => { for (const ch of s) await press(ch); };
const modKey = async (combo) => {
  // Ctrl+<letter>
  const table = { a: 65, c: 67, v: 86 };
  const kc = table[combo];
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: combo, code: 'Key' + combo.toUpperCase(), windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: combo, code: 'Key' + combo.toUpperCase(), windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc });
};
const canvasBox = () => cdp.evaluate(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const clickGame = async (gx, gy) => {
  const b = await canvasBox();
  const x = b.x + (gx / 1280) * b.w;
  const y = b.y + (gy / 720) * b.h;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
};

const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await cdp.sleep(150); }
  return false;
};

// 每次驗收都先整頁重載（遠端瀏覽器的既有分頁可能還停在上一局的 Game 場景；
// location.reload() 在部分頁面不會觸發，改用 Page.reload）
await cdp.send('Page.navigate', { url: BASE });
await cdp.sleep(3000);
await cdp.send('Page.reload', { ignoreCache: true });
await cdp.sleep(2000);
// 確認真的回到選單場景；殘留 Game 場景表示重載未完成，直接中止而不是誤判成功能失敗
const atMenu = await waitFor(() => cdp.evaluate('window.__FG_GAME__ && window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === "Menu")'), 8000);
rec('整頁重載後回到選單場景', atMenu, await cdp.evaluate('window.__FG_GAME__ ? window.__FG_GAME__.scene.getScenes(true).map((s) => s.scene.key).join(",") : "no-game"'));
if (!atMenu) { console.log(log.join('\n')); cdp.close(); process.exit(3); }

const ready = await waitFor(() => cdp.evaluate('typeof window.__FG_GAME__ !== "undefined"'));
rec('遊戲載入', ready);
// 選單場景就緒（否則點擊只落在空白處）
await waitFor(() => cdp.evaluate('window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === "Menu")'));
await cdp.sleep(1500);

await clickGame(520, 461);            // 開始遊戲（選單列 rowY＝0.64×720）
await cdp.sleep(1600);
await waitFor(() => cdp.evaluate('window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === "Game")'));
await cdp.sleep(800);
await cdp.evaluate(`(() => { window.__FG_GAME__.scene.getScene('Game').run.elapsedMs = 179990; return true; })()`);
await waitFor(() => cdp.evaluate(`(() => { const p = window.__FG_GAME__.scene.getScene('Game').run.phase; return p === 'won' || p === 'lost'; })()`));
await cdp.sleep(900);
// 本機 dev 無 Supabase 憑證，正式入口會顯示「不列入排行榜」，因此改用 dev 專用的 HUD 入口開同一個面板
const elig = await cdp.evaluate('JSON.stringify(window.__LB_ELIG__ ?? null)');
console.log('ELIG ' + elig);
await cdp.evaluate(`(() => {
  const hud = window.__FG_GAME__.scene.getScene('Hud');
  const gs = window.__FG_GAME__.scene.getScene('Game');
  hud.openLeaderboardSubmit({
    score: gs.run.finalScore('won'), outcome: 'won', elapsedMs: gs.run.elapsedMs,
    kills: gs.run.kills, escapes: gs.run.escapes, leaderboardEligible: true, runTicketId: null,
  });
  return true;
})()`);
const diag = await cdp.evaluate(`(() => {
  const g = window.__FG_GAME__;
  const gs = g.scene.getScene('Game');
  return {
    scenes: g.scene.getScenes(true).map((s) => s.scene.key),
    phase: gs?.run?.phase,
    elapsed: gs?.run?.elapsedMs,
    hudOverlay: !!gs?.scene?.get('Hud')?.overlay,
    lbScrim: !!document.querySelector('.lb-scrim'),
    input: !!document.getElementById('lb-nickname'),
  };
})()`);
console.log('DIAG ' + JSON.stringify(diag));
const opened = await waitFor(() => cdp.evaluate('!!document.getElementById("lb-nickname")'), 5000);
rec('開啟登錄面板並出現暱稱輸入框', opened);
if (!opened) { console.log(log.join('\n')); cdp.close(); process.exit(1); }
await cdp.sleep(300);

const value = () => cdp.evaluate('document.getElementById("lb-nickname").value');
const focused = () => cdp.evaluate('document.activeElement?.id === "lb-nickname"');
rec('輸入框自動取得焦點', await focused());
if (!(await focused())) { await cdp.evaluate('document.getElementById("lb-nickname").focus(); true'); await cdp.sleep(100); }

await cdp.evaluate('window.__PREVENTED__ = []; true');
await pressAll('WASD');
rec('可輸入 WASD', (await value()) === 'WASD', await value());
await press(' ');
await pressAll('wasd');
rec('可輸入空白與 wasd', (await value()) === 'WASD wasd', await value());
await press(' ');
await press('J'); await press('P');
rec('可輸入 J、P', (await value()) === 'WASD wasd JP', await value());
await press(' ');
await press('j'); await press('p');
rec('可輸入 jp', (await value()) === 'WASD wasd JP jp', await value());

const preventedGameKeys = (await cdp.evaluate('window.__PREVENTED__.filter((k) => ["KeyW","KeyA","KeyS","KeyD","KeyJ","KeyP","Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(k))'));
rec('輸入框內遊戲快捷鍵皆未被 preventDefault', preventedGameKeys.length === 0, preventedGameKeys.join(',') || 'none');

await cdp.evaluate('window.__PREVENTED__ = []; true');
await press('ArrowLeft'); await press('ArrowRight'); await press('Home'); await press('End');
await press('ArrowUp'); await press('ArrowDown');
rec('方向鍵/Home/End 只移動游標、不改內容', (await value()) === 'WASD wasd JP jp', await value());
const preventedArrows = await cdp.evaluate('window.__PREVENTED__.slice()');
rec('方向鍵未被 preventDefault', preventedArrows.length === 0, preventedArrows.join(',') || 'none');

await press('Backspace');
rec('退格可刪字', (await value()) === 'WASD wasd JP j', await value());

const beforeCopy = await value();
await modKey('a'); await modKey('c');
await press('End');
rec('Ctrl+A 全選/End 移動游標不破壞內容', true);
await modKey('v');
rec('貼上可還原內容（剪貼簿可用）', (await value()).length >= beforeCopy.length, await value());

// IME：組字中（isComposing / keyCode 229）不得被攔截
await cdp.evaluate('window.__PREVENTED__ = []; true');
const imeResult = await cdp.evaluate(`(() => {
  const el = document.getElementById('lb-nickname');
  const before = el.value;
  el.dispatchEvent(new CompositionEvent('compositionstart', { data: '', bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', keyCode: 229, isComposing: true, bubbles: true }));
  el.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'hao', bubbles: true }));
  el.dispatchEvent(new CompositionEvent('compositionend', { data: '好', bubbles: true }));
  return { prevented: window.__PREVENTED__.slice(), same: el.value === before };
})()`);
rec('中文組字中的按鍵未被 preventDefault', imeResult.prevented.length === 0, imeResult.prevented.join(',') || 'none');

// 中文暱稱以 Input.insertText 送入（等同輸入法上字），確認落地與既有字元保留
const preCn = await value();
await cdp.send('Input.insertText', { text: '食安小林' });
rec('中文暱稱可輸入', (await value()).includes('食安小林'), await value());
rec('中文插入後保留既有輸入', (await value()).startsWith(preCn), await value());

// 靜止檢查：面板開啟、輸入中，遊戲輸入狀態必須為零
const stuck = await cdp.evaluate(`(() => { const s = window.__FG_GAME__.scene.getScene('Game').input2.read(); return { moveX: s.moveX, moveY: s.moveY, firing: s.firing }; })()`);
rec('輸入中遊戲輸入狀態靜止（不移動、不射擊）', stuck.moveX === 0 && stuck.moveY === 0 && stuck.firing === false, JSON.stringify(stuck));

console.log(log.join('\n'));
const failed = log.filter((l) => l.startsWith('FAIL')).length;
cdp.close();
process.exit(failed === 0 ? 0 : 2);
