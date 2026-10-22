import { connect } from './cdp-raw.mjs';

/**
 * 送出面板後的控制恢復驗收（dev server + 遠端 CDP）。
 * 驗收：Escape 關閉面板 → 關閉後不再暫停（不順帶解除／不順帶恢復錯誤狀態）→ 重玩後 WASD/Space 正常。
 */
const BASE = process.env.LB_BASE ?? 'http://openclaw-gateway:5180/';
const log = [];
const rec = (n, ok, d = '') => { log.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const cdp = await connect(null, { target: /5180/ });
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Page.navigate', { url: BASE });
await cdp.sleep(2500);
await cdp.send('Page.reload', { ignoreCache: true });
await cdp.sleep(2500);

const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await cdp.sleep(150); }
  return false;
};
await waitFor(() => cdp.evaluate('window.__FG_GAME__ && window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === "Menu")'), 10000);
await cdp.sleep(1200);

const canvasBox = () => cdp.evaluate(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
const clickGame = async (gx, gy) => {
  const b = await canvasBox();
  const x = b.x + (gx / 1280) * b.w;
  const y = b.y + (gy / 720) * b.h;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
};
const press = async (code, key, keyCode) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
};

await clickGame(520, 461);
await waitFor(() => cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").run.phase === "playing"'));
await cdp.sleep(800);

// 1) 在戰鬥中按住 W（不清鍵），再開面板，確認按鍵狀態被清掉
await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
await cdp.sleep(250);
const movingBefore = await cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").input2.read().moveY');
rec('戰鬥中按住 W 會移動', movingBefore === -1, String(movingBefore));

await cdp.evaluate(`(() => {
  const hud = window.__FG_GAME__.scene.getScene('Hud');
  const gs = window.__FG_GAME__.scene.getScene('Game');
  hud.openLeaderboardSubmit({ score: gs.run.finalScore('won'), outcome: 'won', elapsedMs: gs.run.elapsedMs, kills: gs.run.kills, escapes: gs.run.escapes, leaderboardEligible: true, runTicketId: null });
  return true;
})()`);
await waitFor(() => cdp.evaluate('!!document.getElementById("lb-nickname")'));
const cleared = await cdp.evaluate(`(() => { const s = window.__FG_GAME__.scene.getScene('Game').input2.read(); return { x: s.moveX, y: s.moveY, f: s.firing }; })()`);
rec('開面板後遊戲按鍵狀態被清空', cleared.x === 0 && cleared.y === 0 && cleared.f === false, JSON.stringify(cleared));
rec('開面板後 Game 場景已暫停', await cdp.evaluate('window.__FG_GAME__.scene.isPaused("Game")'));

// 2) Escape 關閉面板：走真正 onClose（回首頁流程），檢查沒有殘留面板
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await cdp.sleep(900);
rec('Escape 關閉登錄面板', await cdp.evaluate('!document.querySelector(".lb-scrim")'));
const atMenu = await waitFor(() => cdp.evaluate('window.__FG_GAME__.scene.getScenes(true).some((s) => s.scene.key === "Menu")'));
rec('關閉後回到主選單', atMenu);
rec('關閉後 Game 場景未停留在暫停狀態（已結束回到選單）', !(await cdp.evaluate('window.__FG_GAME__.scene.isPaused("Game")')));

// 3) 重玩：回到選單後再次開始，WASD/Space 必須正常（控制依遊戲狀態恢復）
await cdp.sleep(600);
await clickGame(520, 461);
const restarted = await waitFor(() => cdp.evaluate('window.__FG_GAME__.scene.getScene("Game").run.phase === "playing"'));
rec('重玩成功進入戰鬥', restarted);
await cdp.sleep(700);
await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyD', key: 'd', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
await cdp.sleep(300);
const afterRestart = await cdp.evaluate(`(() => {
  const s = window.__FG_GAME__.scene.getScene('Game').input2.read();
  const body = window.__FG_GAME__.scene.getScene('Game').player.body;
  return { moveX: s.moveX, vx: Math.round(body.velocity.x) };
})()`);
rec('重玩後 D 鍵正常移動', afterRestart.moveX === 1 && afterRestart.vx > 0, JSON.stringify(afterRestart));
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyD', key: 'd', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });

await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
await cdp.sleep(400);
const firing = await cdp.evaluate(`(() => {
  const gs = window.__FG_GAME__.scene.getScene('Game');
  return { firing: gs.input2.read().firing, bullets: gs.bullets.countActive(true) };
})()`);
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
rec('重玩後 Space 正常射擊', firing.firing === true && firing.bullets > 0, JSON.stringify(firing));

// 4) 暫停鍵仍有效（不得順帶解除暫停）
await press('KeyP', 'p', 80);
await cdp.sleep(500);
rec('P 仍可暫停（未順帶解除暫停）', await cdp.evaluate('window.__FG_GAME__.scene.isPaused("Game")'));

console.log(log.join('\n'));
const failed = log.filter((l) => l.startsWith('FAIL')).length;
cdp.close();
process.exit(failed === 0 ? 0 : 2);
