/**
 * 音訊診斷入口（獨立 Vite 建置入口，不接入遊戲）。
 * 使用與遊戲完全相同的 AudioManager 原始碼，不複製另一套實作。
 */
import { audio } from './systems/audio';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const set = (id: string, v: string): void => { $(id).textContent = v; };

/** 建置識別：由 Vite 於編譯期注入（每次建置不同） */
declare const __BUILD_ID__: string;
set('build', typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'unknown');

let settings: { soundOn?: boolean } | null = null;
try {
  settings = JSON.parse(localStorage.getItem('food-guardian.settings.v1') || 'null');
} catch {
  settings = null;
}
set('soundOn', settings ? String(settings.soundOn) : '未設定（遊戲預設為開）');

// ── 診斷專用 Context（原生對照音使用，測完關閉） ──────────────
let diagCtx: AudioContext | null = null;
let diagMaster: GainNode | null = null;

function ensureCtx(): AudioContext {
  if (!diagCtx) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    diagCtx = new Ctor();
    diagMaster = diagCtx.createGain();
    diagMaster.gain.value = 0.35;
    diagMaster.connect(diagCtx.destination);
  }
  return diagCtx;
}

async function resumeDiag(): Promise<AudioContext> {
  const ctx = ensureCtx();
  try {
    await ctx.resume();
    set('resume', 'ok（' + ctx.state + '）');
  } catch (e) {
    set('resume', 'failed: ' + (e instanceof Error ? e.message : String(e)));
  }
  set('ctxState', ctx.state);
  set('masterGain', String(diagMaster ? diagMaster.gain.value : 'n/a'));
  const t0 = ctx.currentTime;
  setTimeout(() => {
    const t1 = ctx.currentTime;
    set('ctxTime', t1 > t0 ? ('推進中 ' + t0.toFixed(3) + ' → ' + t1.toFixed(3)) : ('未推進（' + t0.toFixed(3) + '）'));
  }, 400);
  return ctx;
}

/** 載入新測試前清除舊數值，避免原生測試的結果被誤讀成 AudioManager 狀態 */
function clearManagedFields(): void {
  set('ctxState', '—');
  set('ctxTime', '—');
  set('masterGain', '—');
  set('resume', '—');
  set('lastPlay', '—');
  set('offlineAM', '測試中…');
}

// ── 1. 原生對照音：最小 oscillator → gain → destination ──────
$('native').addEventListener('click', () => {
  void (async () => {
    const ctx = await resumeDiag();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g);
    g.connect(diagMaster as GainNode);
    osc.start(t);
    osc.stop(t + 0.32);
    set('lastPlay', 'native 440Hz 0.3s 已排程（不代表裝置已出聲）');
  })();
});

// ── 2. 遊戲 AudioManager 測試音（同一份原始碼） ───────────────
$('managed').addEventListener('click', () => {
  clearManagedFields();
  try {
    audio.unlock();
    void audio.whenReady().then((state) => {
      audio.setSuspended(false);
      set('amLoad', '成功（已匯入同一份 AudioManager）');
      set('ctxState', audio.state());
      set('resume', (audio.hasResumeFailed() ? 'failed' : 'ok') + '（' + state + '）');
      audio.play('shoot');
      set('lastPlay', 'AudioManager "shoot" 已請求（API 排程成功 ≠ 聽到聲音）');
    });
  } catch (e) {
    set('amLoad', '失敗：' + (e instanceof Error ? e.message : String(e)));
    clearManagedFields();
  }
});

// ── OfflineAudioContext：波形檢查（分開標明測的是哪條路徑） ──
async function offlineCheck(): Promise<{ peak: number; nonzero: number } | null> {
  try {
    const OAC = window.OfflineAudioContext
      ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OAC) return null;
    const ctx = new OAC(1, 44100 * 0.4, 44100);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, 0);
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.6, 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, 0.3);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.32);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    let peak = 0;
    let nonzero = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
      if (v > 1e-6) nonzero++;
    }
    return { peak, nonzero };
  } catch {
    return null;
  }
}

offlineCheck().then((r) => {
  set('offlineNative', r
    ? (r.peak > 0.01 ? ('原生路徑有波形，peak=' + r.peak.toFixed(3) + '，非零樣本=' + r.nonzero) : '原生路徑波形為 0')
    : '不支援或失敗（原生路徑）');
});
