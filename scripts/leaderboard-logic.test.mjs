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

// ── 2. UI：未連線時必須顯示「尚未開放」，不得出現假榜單 ──
test('UI：未連線時顯示「排行榜尚未開放」，不出現任何榜單資料', async () => {
  installDom();
  const { LeaderboardUI } = await mod('ui');
  const ui = new LeaderboardUI();
  assert.equal(ui.getMode(), 'unavailable', '未設定連線時必須是 unavailable');
  ui.openBoard(() => {});
  await new Promise((r) => setTimeout(r, 80));
  const scrim = document.getElementById('ui-layer').children[0];
  assert.ok(scrim, '應建立 scrim');
  const text = scrim.textContent;
  assert.ok(text.includes('排行榜尚未開放'), '必須明示尚未開放');
  assert.ok(!text.includes('模擬'), '不得出現模擬字樣');
  assert.equal(scrim.findByClass('lb-table'), undefined, '不得渲染任何榜單表格');
});

test('UI：未連線時結算不提供登錄（避免假名次）', async () => {
  installDom();
  const { LeaderboardUI } = await mod('ui');
  const ui = new LeaderboardUI();
  assert.equal(ui.currentTicketId(), null, '未連線時不得有單局識別');
});

test('API：未設定連線時不發出請求，並回傳 not_configured', async () => {
  const { fetchPage } = await mod('api');
  let called = 0;
  globalThis.fetch = () => { called += 1; return Promise.resolve(new Response('{}')); };
  const cfg = { supabaseUrl: '', supabaseAnonKey: '', version: 'v', pageSize: 10, maxPages: 10 };
  await assert.rejects(fetchPage(cfg, 1), (e) => e.code === 'not_configured');
  assert.equal(called, 0, '未設定時不得送出請求');
});
