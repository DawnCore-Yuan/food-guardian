import { loadLeaderboardConfig, isLeaderboardConfigured, type LeaderboardConfig } from './config';
import { fetchPage, startRun, submitRun } from './api';
import { normalizeNickname } from './nickname';
import { LeaderboardError, type LeaderboardEntry, type LeaderboardPage, type RunTicket, type SubmitResult } from './types';
import { MOCK_PAGES, MOCK_SUBMIT } from './mock';

/**
 * 排行榜 UI 層（HTML overlay，掛在 #ui-layer）。
 *
 * 為什麼不用 Canvas 畫：暱稱輸入需要真正的 <input>，手機鍵盤才不會蓋住送出鈕；
 * 文字一律用 textContent 輸出，杜絕暱稱注入 HTML。
 * 排行榜任何失敗只影響這一層：不 throw 進場景、不阻止遊戲。
 */

type Mode = 'live' | 'mock';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'done'; result: SubmitResult }
  | { kind: 'error'; message: string; retryable: boolean };

export interface ResultContext {
  score: number;
  outcome: 'won' | 'lost';
  elapsedMs: number;
  kills: number;
  escapes: number;
}

const STYLE_ID = 'lb-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .lb-scrim {
      position: fixed; inset: 0; z-index: 20; pointer-events: auto;
      display: flex; align-items: center; justify-content: center;
      background: rgba(11, 43, 60, 0.62); padding: 12px;
      font-family: "Noto Sans TC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .lb-card {
      background: #ffffff; border: 4px solid #2a9d8f; border-radius: 18px;
      width: min(600px, 100%); max-height: calc(100dvh - 24px);
      display: flex; flex-direction: column; color: #1b4965;
      box-shadow: 0 10px 30px rgba(6, 30, 44, 0.35);
    }
    .lb-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px 6px; gap: 8px;
    }
    .lb-title { font-size: 24px; font-weight: 700; margin: 0; }
    .lb-badge-mock {
      display: inline-block; font-size: 13px; font-weight: 700; color: #7a3e00;
      background: #ffe8b8; border: 2px dashed #d98324; border-radius: 8px;
      padding: 2px 8px; margin-left: 8px;
    }
    .lb-body { padding: 0 16px 12px; overflow: auto; -webkit-overflow-scrolling: touch; }
    .lb-table { width: 100%; border-collapse: collapse; font-size: 17px; }
    .lb-table th { text-align: left; color: #5a8aa8; font-weight: 600; font-size: 14px; padding: 6px 4px; }
    .lb-table td { padding: 8px 4px; border-top: 1px solid #e2eef5; }
    .lb-table td.num { font-variant-numeric: tabular-nums; }
    .lb-table td.score { text-align: right; font-weight: 700; }
    .lb-table td.win { color: #1f7a4d; font-weight: 700; }
    .lb-table td.lose { color: #a2443c; }
    .lb-empty, .lb-error, .lb-loading, .lb-note {
      padding: 14px 4px; color: #5a8aa8; font-size: 16px; line-height: 1.5;
    }
    .lb-error { color: #a2443c; }
    .lb-foot {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 10px 16px; border-top: 1px solid #e2eef5; flex-wrap: wrap;
    }
    .lb-pager { display: flex; align-items: center; gap: 8px; font-size: 16px; }
    .lb-btn {
      min-height: 48px; min-width: 48px; padding: 10px 18px; font-size: 18px;
      font-family: inherit; font-weight: 700; color: #ffffff; background: #2a9d8f;
      border: none; border-radius: 12px; cursor: pointer; touch-action: manipulation;
    }
    .lb-btn:disabled { background: #b9cfda; cursor: default; }
    .lb-btn.ghost { background: #ffffff; color: #1b4965; border: 2px solid #b9cfda; }
    .lb-label { display: block; font-size: 16px; font-weight: 600; margin: 10px 0 6px; }
    .lb-input {
      width: 100%; min-height: 52px; font-size: 20px; font-family: inherit;
      padding: 10px 12px; border: 2px solid #b9cfda; border-radius: 12px; color: #1b4965;
      box-sizing: border-box;
    }
    .lb-input:focus { outline: 3px solid #7fdffc; border-color: #2a9d8f; }
    .lb-hint { font-size: 14px; color: #5a8aa8; margin-top: 6px; }
    .lb-hint.warn { color: #a2443c; }
    .lb-big { font-size: 30px; font-weight: 700; text-align: center; margin: 6px 0 2px; }
    .lb-sub { font-size: 16px; color: #5a8aa8; text-align: center; margin: 2px 0; }
    .lb-rank { font-size: 44px; font-weight: 800; text-align: center; color: #2a6f77; margin: 4px 0; }
    .lb-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; width: 100%; }
    .lb-actions .lb-btn { flex: 1 1 150px; }
    @media (max-height: 430px) {
      .lb-title { font-size: 20px; }
      .lb-head { padding: 8px 12px 2px; }
      .lb-body { padding: 0 12px 8px; }
      .lb-table { font-size: 15px; }
      .lb-table td { padding: 5px 4px; }
      .lb-foot { padding: 6px 12px; }
      .lb-rank { font-size: 32px; }
      .lb-big { font-size: 22px; }
    }
  `;
  document.head.appendChild(style);
}

function layer(): HTMLElement {
  let host = document.getElementById('ui-layer');
  if (!host) {
    host = document.createElement('div');
    host.id = 'ui-layer';
    document.body.appendChild(host);
  }
  return host;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, textContent?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function button(label: string, onClick: () => void, cls = 'lb-btn'): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function outcomeLabel(o: 'won' | 'lost'): string {
  return o === 'won' ? '勝' : '負';
}

export class LeaderboardUI {
  private cfg: LeaderboardConfig = loadLeaderboardConfig();
  private mode: Mode = isLeaderboardConfigured(this.cfg) ? 'live' : 'mock';
  /** dev-only 模擬故障：?lbMock=fail（載入失敗）／?lbMock=empty（空榜）／?lbMock=slow（延遲） */
  private mockScenario = (() => {
    if (!__DEV_HOOK__) return '' as string;
    return new URLSearchParams(location.search).get('lbMock') ?? '';
  })();
  private scrim: HTMLElement | null = null;
  private ticket: RunTicket | null = null;
  private pendingStart: Promise<void> | null = null;
  private lastSubmit: { state: SubmitState; ctx: ResultContext } | null = null;

  constructor() {
    injectStyle();
    if (this.mode === 'mock') {
      this.mockTicketId = 'mock-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    } else {
      this.prefetch();
    }
  }

  getMode(): Mode { return this.mode; }

  /** 這局拿到的伺服器識別；沒有（或 mock 模式）回 null */
  currentTicketId(): string | null {
    if (this.mode === 'live') return this.ticket ? this.ticket.ticketId : null;
    // 模擬模式核發的「模擬識別」：只存在記憶體、只給 UI 流程使用，
    // 格式與 server ticket 不同（mock- 前綴），不可能通過伺服器驗證。
    return this.mockTicketId;
  }

  /** 模擬模式的單局識別（每次 newRun 換一個） */
  private mockTicketId: string | null = null;

  /** 遊戲開始時先取得單局識別；失敗不阻擋遊戲，結算時再重試 */
  prefetch(): void {
    if (this.mode !== 'live' || this.pendingStart) return;
    this.ticket = null;
    this.pendingStart = startRun(this.cfg)
      .then((t) => { this.ticket = t; })
      .catch(() => { this.ticket = null; })
      .finally(() => { this.pendingStart = null; });
  }

  /** 每次真正開始一局（含再玩一次）都呼叫：換新的單局識別 */
  newRun(): void {
    this.lastSubmit = null;
    if (this.mode === 'mock') {
      this.mockTicketId = 'mock-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
      return;
    }
    this.prefetch();
  }

  private async ensureTicket(): Promise<RunTicket | null> {
    if (this.ticket) return this.ticket;
    if (this.pendingStart) await this.pendingStart;
    if (this.ticket) return this.ticket;
    if (this.mode !== 'live') return null;
    try {
      this.ticket = await startRun(this.cfg);
      return this.ticket;
    } catch {
      return null;
    }
  }

  close(): void {
    if (this.scrim) {
      this.scrim.remove();
      this.scrim = null;
    }
  }

  private mount(card: HTMLElement, onClose: () => void): void {
    this.close();
    const scrim = el('div', 'lb-scrim');
    scrim.appendChild(card);
    this.scrim = scrim;
    layer().appendChild(scrim);
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { this.close(); onClose(); }
    };
    document.addEventListener('keydown', key);
    const dupCtl = new AbortController();
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) { this.close(); onClose(); }
    });
    const origClose = this.close.bind(this);
    this.close = (): void => {
      document.removeEventListener('keydown', key);
      dupCtl.abort();
      origClose();
    };
  }

  // ───────────────────────── 首頁：公開榜單 ─────────────────────────

  openBoard(onClose: () => void): void {
    const card = el('div', 'lb-card');
    const head = el('div', 'lb-head');
    const titles = el('div');
    titles.appendChild(el('h2', 'lb-title', '排行榜'));
    if (this.mode === 'mock') titles.appendChild(el('span', 'lb-badge-mock', '模擬資料'));
    head.appendChild(titles);
    head.appendChild(button('關閉', () => { this.close(); onClose(); }, 'lb-btn ghost'));
    card.appendChild(head);

    const body = el('div', 'lb-body');
    card.appendChild(body);

    const foot = el('div', 'lb-foot');
    let page = 1;
    let totalPages = 1;
    const prev = button('上一頁', () => { if (page > 1) { page -= 1; void load(); } }, 'lb-btn ghost');
    const next = button('下一頁', () => { if (page < totalPages) { page += 1; void load(); } }, 'lb-btn ghost');
    const info = el('span', '', '');
    const pager = el('div', 'lb-pager');
    pager.appendChild(prev); pager.appendChild(info); pager.appendChild(next);
    foot.appendChild(pager);
    card.appendChild(foot);

    const setPager = (): void => {
      info.textContent = `第 ${page} / ${totalPages} 頁`;
      prev.disabled = page <= 1;
      next.disabled = page >= totalPages;
    };

    const renderRows = (p: LeaderboardPage): void => {
      body.replaceChildren();
      if (p.entries.length === 0) {
        body.appendChild(el('div', 'lb-empty', '目前還沒有人上榜。完成一局正式關卡後，就能把你的成績留在這裡。'));
        return;
      }
      const table = el('table', 'lb-table');
      const thead = el('thead');
      const hr = el('tr');
      for (const t of ['名次', '暱稱', '分數', '勝負']) hr.appendChild(el('th', '', t));
      thead.appendChild(hr);
      table.appendChild(thead);
      const tbody = el('tbody');
      for (const e of p.entries as LeaderboardEntry[]) {
        const tr = el('tr');
        tr.appendChild(el('td', 'num', String(e.rank)));
        tr.appendChild(el('td', '', e.nickname));
        tr.appendChild(el('td', 'num score', e.score.toLocaleString('zh-TW')));
        tr.appendChild(el('td', e.outcome === 'won' ? 'win' : 'lose', outcomeLabel(e.outcome)));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      body.appendChild(table);
      body.appendChild(el('div', 'lb-note', this.mode === 'mock'
        ? '以上為明確標示的模擬資料，尚未連線 Supabase。'
        : '只列出前 100 名。同分時較早登錄者在前。'));
    };

    const load = async (): Promise<void> => {
      body.replaceChildren(el('div', 'lb-loading', '排行榜載入中…'));
      setPager();
      if (this.mode === 'mock') {
        if (this.mockScenario === 'slow') await new Promise((r) => setTimeout(r, 2500));
        if (this.mockScenario === 'fail') {
          body.replaceChildren(
            el('div', 'lb-error', '排行榜暫時無法載入：無法連線（模擬故障）'),
            el('div', 'lb-hint', '遊戲本身不受影響，可以照常開始遊戲。'),
            button('重新載入', () => { void load(); }),
          );
          return;
        }
        if (this.mockScenario === 'empty') {
          body.replaceChildren(el('div', 'lb-empty', '目前還沒有人上榜（模擬空榜）。'));
          return;
        }
      }
      try {
        const p = this.mode === 'mock'
          ? MOCK_PAGES[Math.min(page - 1, MOCK_PAGES.length - 1)]
          : await fetchPage(this.cfg, page);
        totalPages = Math.max(1, p.totalPages);
        if (page > totalPages) page = totalPages;
        renderRows(p);
        setPager();
      } catch (e) {
        const err = e instanceof LeaderboardError ? e : new LeaderboardError('unknown', '排行榜暫時無法載入', true);
        body.replaceChildren();
        body.appendChild(el('div', 'lb-error', '排行榜暫時無法載入：' + err.message));
        body.appendChild(el('div', 'lb-hint', '遊戲本身不受影響，可以照常開始遊戲。'));
        body.appendChild(button('重新載入', () => { void load(); }));
      }
    };

    this.mount(card, onClose);
    setPager();
    void load();
  }

  // ───────────────────────── 結算：登錄成績 ─────────────────────────

  openSubmit(ctx: ResultContext, onBackToMenu: () => void): void {
    const card = el('div', 'lb-card');
    const head = el('div', 'lb-head');
    head.appendChild(el('h2', 'lb-title', '登錄成績'));
    card.appendChild(head);
    const body = el('div', 'lb-body');
    card.appendChild(body);
    const foot = el('div', 'lb-foot');
    card.appendChild(foot);
    const actions = el('div', 'lb-actions');
    foot.appendChild(actions);

    const summary = (): void => {
      body.appendChild(el('div', 'lb-big', `分數 ${ctx.score.toLocaleString('zh-TW')}`));
      body.appendChild(el('div', 'lb-sub', `${outcomeLabel(ctx.outcome)}｜擊破 ${ctx.kills}　逃脫 ${ctx.escapes}`));
      if (this.mode === 'mock') body.appendChild(el('div', 'lb-badge-mock', '模擬模式：不會寫入雲端'));
    };

    const renderDone = (result: SubmitResult, nickname: string): void => {
      body.replaceChildren();
      body.appendChild(el('div', 'lb-sub', result.duplicate ? '這一局先前已登錄（不會重複寫入）' : '登錄成功'));
      body.appendChild(el('div', 'lb-rank', result.rank !== null ? `第 ${result.rank} 名` : '未進前 100 名'));
      body.appendChild(el('div', 'lb-sub', `暱稱：${nickname || '（已登錄）'}　分數：${ctx.score.toLocaleString('zh-TW')}`));
      if (this.mode === 'mock') {
        body.appendChild(el('div', 'lb-sub', '（模擬模式：示範名次，未寫入任何伺服器）'));
      }
      actions.replaceChildren();
      if (result.rank !== null) {
        actions.appendChild(button('查看排行榜', () => this.openBoard(onBackToMenu)));
      }
      actions.appendChild(button('回首頁', () => { this.close(); onBackToMenu(); }, 'lb-btn ghost'));
    };

    const renderForm = (): void => {
      body.replaceChildren();
      summary();

      const label = el('label', 'lb-label', '暱稱（免註冊，最多 12 個字）');
      label.htmlFor = 'lb-nickname';
      body.appendChild(label);
      const input = el('input', 'lb-input');
      input.id = 'lb-nickname';
      input.type = 'text';
      input.name = 'nickname';
      input.autocomplete = 'on';
      input.enterKeyHint = 'send';
      input.maxLength = 48;
      input.placeholder = '不填就是匿名隊員';
      body.appendChild(input);
      const hint = el('div', 'lb-hint', '');
      body.appendChild(hint);

      const submitBtn = button('登錄成績', () => { void doSubmit(); });
      const skipBtn = button('不登錄，直接回首頁', () => { this.close(); onBackToMenu(); }, 'lb-btn ghost');
      actions.replaceChildren(submitBtn, skipBtn);

      input.addEventListener('input', () => {
        const norm = normalizeNickname(input.value);
        hint.textContent = `送出後顯示：${norm}（${Array.from(norm).length}/12 字）`;
        hint.className = 'lb-hint';
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); void doSubmit(); }
      });

      // 手機：等鍵盤彈出後把送出鈕捲進可視區，避免被鍵盤遮住
      window.setTimeout(() => {
        input.focus({ preventScroll: true });
        submitBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 80);

      const doSubmit = async (): Promise<void> => {
        if (this.lastSubmit?.state.kind === 'pending') return;
        if (submitBtn.disabled) return;
        const nickname = normalizeNickname(input.value);
        this.lastSubmit = { state: { kind: 'pending' }, ctx };
        submitBtn.disabled = true;
        skipBtn.disabled = true;
        submitBtn.textContent = '登錄中…';
        hint.textContent = '正在送出，請稍候…';
        hint.className = 'lb-hint';
        try {
          let result: SubmitResult;
          if (this.mode === 'mock') {
            result = await MOCK_SUBMIT(!!this.duplicatedThisRun(), ctx.score);
          } else {
            const t = await this.ensureTicket();
            if (!t) throw new LeaderboardError('no_ticket', '沒有取得本局識別，請重新開始一局再登錄', true);
            result = await submitRun(this.cfg, {
              ticketId: t.ticketId,
              token: t.token,
              nickname,
              score: ctx.score,
              outcome: ctx.outcome,
              elapsedMs: ctx.elapsedMs,
              kills: ctx.kills,
              escapes: ctx.escapes,
            });
          }
          this.lastSubmit = { state: { kind: 'done', result }, ctx };
          renderDone(result, nickname);
        } catch (e) {
          const err = e instanceof LeaderboardError ? e : new LeaderboardError('unknown', '登錄失敗', true);
          this.lastSubmit = { state: { kind: 'error', message: err.message, retryable: err.retryable }, ctx };
          submitBtn.disabled = false;
          skipBtn.disabled = false;
          submitBtn.textContent = err.retryable ? '重試登錄' : '登錄成績';
          hint.textContent = '登錄失敗：' + err.message + (err.retryable ? '（可直接重試，同一局不會重複寫入）' : '');
          hint.className = 'lb-hint warn';
        }
      };

      input.focus({ preventScroll: true });
    };

    const prev = this.lastSubmit;
    if (prev?.state.kind === 'done' && prev.ctx.score === ctx.score && prev.ctx.outcome === ctx.outcome) {
      renderDone(prev.state.result, '');
    } else {
      renderForm();
    }

    this.mount(card, onBackToMenu);
  }

  private duplicatedThisRun(): boolean {
    return this.lastSubmit?.state.kind === 'done';
  }
}
