/**
 * 方向／縮放層：全站唯一的方向提示與尺寸來源。
 *
 * 為什麼要集中：舊版只在 GameScene 建立提示，首頁完全不顯示；
 * 且以「旋轉瞬間」的 window.innerHeight/innerWidth 判斷，位址列伸縮時會得到舊尺寸。
 * 這裡改成：以 visualViewport（含 fallback）→ 實際可視尺寸，延遲量測直到穩定。
 */

export interface ViewportSize {
  width: number;
  height: number;
}

/** 延遲毫秒：resize/orientationchange 後的靜默期，避免讀到尚未穩定的尺寸 */
const SETTLE_MS = 180;
/** 連續量測直到兩次一致的最長等待（位址列伸縮動畫） */
const STABLE_MAX_MS = 900;

let hintEl: HTMLElement | null = null;
let listenBound = false;
let lastSize: ViewportSize = { width: 0, height: 0 };
let pendingTimer = 0;
let listeners: Array<(size: ViewportSize, isLandscape: boolean) => void> = [];
let onPortraitEnter: (() => void) | null = null;

/**
 * 目前實際可視區。
 *
 * 注意：#app 使用 position:fixed; inset:0，它會把整頁的「捲動尺寸／可視區」撐成上一次的
 * 固定大小（旋轉後 documentElement.clientWidth/Height 與 visualViewport 仍可能回舊值）。
 * 因此這裡不單獨信任任何一個來源，而是取「三者中最一致的橫直判定」：
 *   1. visualViewport（有縮放/鍵盤時最準）
 *   2. documentElement.clientWidth/Height
 *   3. window.innerWidth/innerHeight（最不受 fixed 子元素影響）
 * 判定規則：以 innerWidth/innerHeight 為主，若 visualViewport 明確且方向一致則採用其尺寸。
 */
export function readViewport(): ViewportSize {
  const vv = window.visualViewport;
  const de = document.documentElement;
  const iw = Math.round(window.innerWidth);
  const ih = Math.round(window.innerHeight);
  // innerWidth/innerHeight 不會被 position:fixed 子元素撐大，作為方向與尺寸的權威來源。
  // visualViewport 僅在「方向一致且尺寸相差 ≤2px」時採用（縮放/鍵盤造成的可視區差異）。
  if (vv) {
    const vw = Math.round(vv.width);
    const vh = Math.round(vv.height);
    if ((vw > vh) === (iw > ih) && Math.abs(vw - iw) <= 2 && Math.abs(vh - ih) <= 2) {
      return { width: vw, height: vh };
    }
  }
  // 不回退等待其他來源一致：固定層會保留舊值，等待只會無限延後（此為有界限設計）。
  if (de && (de.clientWidth > de.clientHeight) === (iw > ih)) {
    return { width: de.clientWidth, height: de.clientHeight };
  }
  return { width: iw, height: ih };
}

/**
 * 連續量測到穩定：位址列收合時尺寸會連續變化，
 * 只取第一次讀值會得到「旋轉瞬間」的舊尺寸。
 */
export async function readStableViewport(): Promise<ViewportSize> {
  const started = Date.now();
  let prev = readViewport();
  while (Date.now() - started < STABLE_MAX_MS) {
    await new Promise((r) => setTimeout(r, 90));
    const next = readViewport();
    if (Math.abs(next.width - prev.width) <= 1 && Math.abs(next.height - prev.height) <= 1) return next;
    prev = next;
  }
  return readViewport();
}

/** 直向判定：以實際可視尺寸為準（正方形視為橫向，避免誤擋） */
export function isPortraitSize(size: ViewportSize): boolean {
  return size.height > size.width;
}

function hintHost(): HTMLElement {
  return document.getElementById('ui-layer') ?? document.body;
}

/**
 * 只保留單一提示節點。
 *
 * 為什麼要清重複：dev HMR 或任何重複初始化都會各自留下一個 #rotate-hint；
 * 舊的閉包不再被呼叫，就會永遠停在 display:flex，蓋住整個畫面並攔截點擊。
 * 因此：1) 已有節點就沿用；2) 多於一個就全部移除後重建；3) 新節點帶 data-vp-hint 標記。
 */
function ensureHint(): HTMLElement {
  if (hintEl && hintEl.isConnected) {
    // 精簡到只剩這一個（其他模組留下的舊節點一律移除）
    for (const extra of Array.from(document.querySelectorAll('.vp-rotate-hint'))) {
      if (extra !== hintEl) extra.remove();
    }
    return hintEl;
  }
  for (const stale of Array.from(document.querySelectorAll('#rotate-hint, .vp-rotate-hint'))) stale.remove();
  const el = document.createElement('div');
  el.id = 'rotate-hint';
  el.className = 'vp-rotate-hint';
  el.setAttribute('role', 'alert');
  el.textContent = '請將手機轉為橫向';
  Object.assign(el.style, {
    position: 'fixed', inset: '0', display: 'none', zIndex: '9999',
    background: 'rgba(11,43,60,0.97)', color: '#fff', fontSize: '22px',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    pointerEvents: 'auto', touchAction: 'none',
    padding: 'calc(env(safe-area-inset-top) + 24px) calc(env(safe-area-inset-right) + 24px) '
      + 'calc(env(safe-area-inset-bottom) + 24px) calc(env(safe-area-inset-left) + 24px)',
  } as CSSStyleDeclaration);
  hintEl = el;
  return el;
}

let lastPortrait = false;

function apply(raw: ViewportSize): void {
  // 提示層本身是 position:fixed inset:0，若把它的 rect 算進量測，會讓寬高互換後永遠判定為直向；
  // 因此以「扣除覆蓋層」的 documentElement 尺寸為準，visualViewport 只作為縮放/鍵盤的可視補正。
  const size = raw.width && raw.height ? raw : readViewport();
  const portrait = isPortraitSize(size);
  const el = ensureHint();
  if (!el.isConnected) hintHost().appendChild(el);
  // 直向必須「立即」蓋住畫面並吃掉所有觸控，避免穿透點到首頁按鈕
  el.style.display = portrait ? 'flex' : 'none';
  if (portrait !== lastPortrait) {
    lastPortrait = portrait;
    if (portrait) onPortraitEnter?.();
  }
  lastSize = size;
  if ((window as unknown as { __VP_TRACE__?: boolean }).__VP_TRACE__) {
    (window as unknown as { __VP_LOG__?: unknown[] }).__VP_LOG__ ??= [];
    (window as unknown as { __VP_LOG__?: unknown[] }).__VP_LOG__!.push({
      t: Math.round(performance.now()), w: size.width, h: size.height, portrait,
    });
  }
  for (const fn of listeners) fn(size, !portrait);
}

function schedule(): void {
  clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    void readStableViewport().then(apply);
  }, SETTLE_MS);
}

/** 單一節流器：事件與輪詢共用，避免任何一條路徑失效就整體停擺 */
function applyNow(): void {
  apply(readViewport());
}

/**
 * 啟動一次即涵蓋全站（首頁、遊戲、排行榜）。
 * onPortrait：進入直向時回呼（遊戲用來暫停並清除輸入）。
 * onResize：尺寸穩定後回呼（場景用來重新排版）。
 */
export function initViewportGuard(opts: {
  onPortrait?: () => void;
  onResize?: (size: ViewportSize, isLandscape: boolean) => void;
} = {}): void {
  if (opts.onPortrait) onPortraitEnter = opts.onPortrait;
  if (opts.onResize) listeners.push(opts.onResize);
  if (listenBound) {
    applyNow();
    return;
  }
  listenBound = true;
  const vv = window.visualViewport;
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  vv?.addEventListener('resize', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  // 輪詢保底：部分行動瀏覽器（含遮罩模式的視窗）旋轉後不送 resize；
  // 只在尺寸或直橫真的變化時才寫 DOM。
  window.setInterval(() => {
    const now = readViewport();
    if (now.width !== lastSize.width || now.height !== lastSize.height || isPortraitSize(now) !== lastPortrait) {
      apply(now);
    }
  }, 350);
  applyNow();
  schedule();
}

/** 目前是否顯示方向提示（測試與場景共用） */
export function isRotateHintShown(): boolean {
  const el = hintEl && hintEl.isConnected ? hintEl : document.querySelector('.vp-rotate-hint');
  return !!el && (el as HTMLElement).style.display !== 'none';
}

/** 目前提示節點數量（驗收用：必須永遠是 0（橫向）或 1（直向）） */
export function rotateHintCount(): number {
  return document.querySelectorAll('.vp-rotate-hint').length;
}

/** 最近一次量測的尺寸（供監看；不作為唯一來源） */
export function currentViewportSize(): ViewportSize {
  return lastSize.width ? lastSize : readViewport();
}

export function onViewportResize(fn: (size: ViewportSize, isLandscape: boolean) => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter((f) => f !== fn); };
}
