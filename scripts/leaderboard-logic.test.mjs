/**
 * 排行榜程式碼層驗證（無瀏覽器可跑）。
 *
 * 這裡證明的是「程式邏輯與 DOM 產出正確」，不是瀏覽器畫面試玩：
 *  - api.ts / nickname.ts 以 TypeScript 編譯後直接 import（Node 24 內建 TS 支援）。
 *  - ui.ts 在一個最小 DOM 替身上執行，檢查實際建立的節點與文字。
 * 逐項標示 SCRIPT-LEVEL，不與瀏覽器驗收混為一談。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

globalThis.__DEV_HOOK__ = false;

const outDir = mkdtempSync(join(tmpdir(), 'lb-build-'));
execSync(`./node_modules/.bin/tsc src/leaderboard/*.ts src/systems/waves.ts src/types.ts src/data/balance.ts --outDir ${outDir} --module esnext --target es2022 --moduleResolution bundler --skipLibCheck --noCheck`, { stdio: 'inherit' });
const mod = async (name) => {
  // tsc 產出的 import 不帶副檔名，Node ESM 不接受。遞迴掃描暫存目錄，
  // 把相對 import 補上 .js（只在暫存目錄內改，不動專案原始碼）。
  const { readdirSync, readFileSync, writeFileSync, statSync } = await import('node:fs');
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const full = join(dir, f);
    return statSync(full).isDirectory() ? [full, ...walk(full)] : [full];
  });
  for (const file of walk(outDir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(file, 'utf8').replace(/from '(\.{1,2}\/[^']+)'/g, (m, rel) => (rel.endsWith('.js') ? m : `from '${rel}.js'`));
    writeFileSync(file, src);
  }
  writeFileSync(join(outDir, 'package.json'), '{"type":"module"}');
  return import(`${outDir}/leaderboard/${name}.js`);
};

// ── 最小 DOM 替身（只實作 ui.ts 用到的 API） ──
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = '';
    this._text = '';
    this.listeners = new Map();
    this.attrs = {};
    this.value = '';
    this.disabled = false;
    this.style = {};
  }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  set textContent(v) { this.children = []; this._text = String(v); }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  replaceChildren(...cs) { this.children = cs; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); }
  addEventListener(t, f) { const a = this.listeners.get(t) ?? []; a.push(f); this.listeners.set(t, a); }
  removeEventListener(t, f) { const a = this.listeners.get(t) ?? []; this.listeners.set(t, a.filter((x) => x !== f)); }
  dispatch(t, ev = {}) { for (const f of this.listeners.get(t) ?? []) f({ target: this, preventDefault() {}, ...ev }); }
  querySelectorAll(className) {
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (c.className === className) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  findByClass(className) { return this.querySelectorAll(className)[0]; }
  getBoundingClientRect() { return { width: 600, height: 40, top: 0, left: 0 }; }
  scrollIntoView() {}
  focus() {}
}

function installDom() {
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  head.appendChild(new FakeElement('style'));
  const byId = new Map();
  const doc = {
    body, head,
    createElement: (t) => new FakeElement(t),
    getElementById: (id) => byId.get(id) ?? null,
    addEventListener() {}, removeEventListener() {},
  };
  const layerEl = new FakeElement('div');
  layerEl.id = 'ui-layer';
  byId.set('ui-layer', layerEl);
  globalThis.document = doc;
  globalThis.window = { setTimeout: (f, ms) => setTimeout(f, ms) };
  if (!globalThis.__IMPORT_META_ENV__) globalThis.__IMPORT_META_ENV__ = {};
  return { body, layerEl };
}

// ── 1. 暱稱正規化 ──
test('暱稱：去首尾空白、上限 12 字、空白退回匿名隊員、控制字元剝除', async () => {
  const { normalizeNickname, NICKNAME_FALLBACK } = await mod('nickname');
  assert.equal(normalizeNickname('  食安小林  '), '食安小林');
  assert.equal(normalizeNickname('   '), NICKNAME_FALLBACK);
  assert.equal(normalizeNickname(''), NICKNAME_FALLBACK);
  assert.equal(Array.from(normalizeNickname('一二三四五六七八九十十一十二')).length, 12);
  assert.equal(normalizeNickname('😀😀'), '😀😀', 'emoji 以字素計，不被拆半');
  assert.equal(normalizeNickname('a\u0007b'), 'ab');
});

// ── 2. UI：模擬榜單與輸入流程 ──
test('UI：模擬模式標示、每頁 10 名、名次/暱稱/分數/勝負欄位', async () => {
  installDom();
  const { LeaderboardUI } = await mod('ui');
  const ui = new LeaderboardUI();
  assert.equal(ui.getMode(), 'mock', '未設定連線時必須是 mock');
  await new Promise((r) => setTimeout(r, 500));
  ui.openBoard(() => {});
  await new Promise((r) => setTimeout(r, 50));
  const scrim = document.body.children.find((c) => c.className === 'lb-scrim') ?? document.getElementById('ui-layer').children[0];
  assert.ok(scrim, '應建立 scrim');
  const badges = scrim.querySelectorAll('lb-badge-mock');
  assert.equal(badges.length, 1, '模擬模式必須有標記');
  const table = scrim.findByClass('lb-table');
  assert.ok(table, '應有榜單表格');
  const tbody = table.children.find((n) => n.tagName === 'TBODY');
  const rows = tbody.children;
  assert.equal(rows.length, 10, '每頁 10 名');
  assert.equal(rows[0].children.map((td) => td.textContent).join('|').split('|').length, 4, '每列四欄');
  const head = table.children.find((n) => n.tagName === 'THEAD');
  assert.equal(head.children[0].children.map((th) => th.textContent).join(','), '名次,暱稱,分數,勝負');
  // 分數由高到低
  const scores = rows.map((r) => Number(r.children[2].textContent.replace(/,/g, '')));
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), '分數需由高到低');
  // 前四名刻意同分，名次仍遞增（同分依登錄時間）
  assert.equal(rows[0].children[2].textContent, rows[3].children[2].textContent, '前四名同分');
  assert.deepEqual(rows.slice(0, 4).map((r) => r.children[0].textContent), ['1', '2', '3', '4']);
});

test('UI：結算登錄 → 顯示名次，同一局重複顯示結果不重送', async () => {
  installDom();
  const { LeaderboardUI } = await mod('ui');
  const ui = new LeaderboardUI();
  const ctx = { score: 1234, outcome: 'won', elapsedMs: 180000, kills: 30, escapes: 2 };
  ui.openSubmit(ctx, () => {});
  await new Promise((r) => setTimeout(r, 200));
  const scrim = document.getElementById('ui-layer').children[0];
  const card = scrim.children[0];
  const input = card?.findByClass('lb-input');
  assert.ok(input, '應有暱稱輸入框');
  input.value = '  小八  ';
  const allBtns = (node) => { const out = []; const walk = (n) => { for (const ch of n.children) { if (ch.tagName === 'BUTTON') out.push(ch); walk(ch); } }; walk(node); return out; };
  const submit = allBtns(card).find((b) => b.textContent === '登錄成績');
  assert.ok(submit, '應有登錄成績按鈕');
  submit.dispatch('click');
  await new Promise((r) => setTimeout(r, 700));
  const rank = card.findByClass('lb-rank');
  assert.ok(rank, '登錄後應顯示名次區塊');
  assert.match(rank.textContent, /^(第 \d+ 名|未進前 100 名)$/);
  assert.ok(allBtns(card).some((b) => b.textContent === '回首頁'), '應保留回首頁');
  // 再次開啟同一局結算：直接顯示已登錄結果，不重新出現輸入表單
  ui.openSubmit(ctx, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const scrim2 = document.getElementById('ui-layer').children[0];
  assert.equal(scrim2.children[0].findByClass('lb-input'), undefined, '同局不得再次送出');
  assert.ok(scrim2.children[0].findByClass('lb-rank'), '同局重開需顯示原名次');
});

test('API：未設定連線時不發出請求，並回傳 not_configured', async () => {
  const { fetchPage } = await mod('api');
  let called = 0;
  globalThis.fetch = () => { called += 1; return Promise.resolve(new Response('{}')); };
  const cfg = { supabaseUrl: '', supabaseAnonKey: '', version: 'v', pageSize: 10, maxPages: 10 };
  await assert.rejects(fetchPage(cfg, 1), (e) => e.code === 'not_configured');
  assert.equal(called, 0, '未設定時不得送出請求');
});
