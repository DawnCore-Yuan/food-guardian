/**
 * AudioManager：集中管理所有遊戲音效（Web Audio 合成，無外部素材）。
 *
 * 設計原則
 *  - 全遊戲共用一個 AudioContext，不在射擊或重玩時新建。
 *  - 每個音效都是「短包絡 + 單一振盪器/噪聲」即時合成，播完即釋放節點。
 *  - 同時發聲音部上限 8（8 個 voice），容量不足時優先捨棄射擊聲。
 *  - 高優先（受傷／結果／預警）不受射擊節流影響。
 *  - 靜音時立即停止所有聲部；再次開啟只播後續事件，不補播。
 *  - localStorage 不可用時仍可正常遊玩（設定讀寫失敗一律吞掉）。
 */

export type SfxName =
  | 'shoot' | 'hit' | 'kill' | 'hurt' | 'warn' | 'ui' | 'win' | 'lose';

interface Voice {
  name: SfxName;
  priority: number;      // 數字越大越優先；射擊為最低
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
  stopAt: number;
}

const MAX_VOICES = 8;
/** 同時活動的聲源節點上限（Oscillator + BufferSource 合計），避免疊音爆量 */
const MAX_SOURCES = 24;

const PRIORITY: Record<SfxName, number> = {
  shoot: 0,
  hit: 1,
  kill: 2,
  warn: 3,
  ui: 4,
  hurt: 5,
  win: 6,
  lose: 6,
};

import { loadSettings, saveSettings } from './storage';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private enabled = true;
  private suspended = false;
  // -1 代表「尚未播放過」，與時間 0 區分
  private lastShootAt = -1;
  private lastHitAt = -1;
  private lastWarnAt = -1;
  /** resume() 曾失敗（iOS 手勢失效或系統中斷）；下一次手勢會再試 */
  private resumeFailed = false;
  private _lastResult = '';
  /** 目前在生命週期內的聲源節點數（建立時 +1、結束時 -1） */
  private activeSources = 0;

  constructor() {
    this.enabled = this.readPref();
  }

  // ── 偏好 ────────────────────────────────────────────────
  /** 偏好沿用專案既有 settings（food-guardian.settings.v1 → soundOn），不另建 key */
  private readPref(): boolean {
    try {
      return loadSettings().soundOn;
    } catch {
      return true;   // localStorage 不可用 → 預設開啟，遊戲照常
    }
  }

  isEnabled(): boolean { return this.enabled; }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      const s = loadSettings();
      s.soundOn = on;
      saveSettings(s);
    } catch { /* 忽略：儲存失敗不影響遊玩 */ }
    if (!on) this.stopAll();
    else void this.resume();                      // 只影響後續事件，不補播
  }

  // ── 生命週期 ────────────────────────────────────────────
  /**
   * 必須在「使用者手勢」的同步階段呼叫（pointerup / touchend / click）。
   * iOS Safari 只認手勢當下建立並 resume 的 AudioContext；
   * 若等到 async 之後才建立，常常停在 suspended。
   */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.setValueAtTime(0.9, this.ctx.currentTime);
        this.master.connect(this.ctx.destination);
      }
      // 同步建立後立刻呼叫 resume()；成功／失敗都要處理，不能假定已 running
      if (this.ctx.state !== 'running') {
        const p = this.ctx.resume();
        if (p && typeof p.then === 'function') {
          p.then(
            () => this.onResumed(),
            () => { this.resumeFailed = true; },
          );
        }
      } else {
        this.onResumed();
      }
      this.watchState();
    } catch {
      // 解鎖失敗不阻塞遊戲；後續手勢會再試
    }
  }

  private onResumed(): void {
    this.resumeFailed = false;
    this.suspended = false;
  }

  /** 記錄 state 變化並在變成 suspended 時嘗試恢復（只在使用者手勢內有效） */
  private watchState(): void {
    const ctx = this.ctx;
    if (!ctx || (ctx as unknown as { __w?: boolean }).__w) return;
    (ctx as unknown as { __w?: boolean }).__w = true;
    ctx.onstatechange = () => {
      // iOS 除 suspended 外還有非標準的 'interrupted'（來電／切換 App）。
      // 兩者都代表「此刻無聲」，但成因不同：interrupted 需等系統釋放後由手勢 resume。
      if (ctx.state === 'running') {
        this.resumeFailed = false;
        this.suspended = false;
      }
    };
  }

  /** 目前狀態（供除錯與複驗判斷，不影響玩法） */
  state(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  /**
   * 等待 resume() 真正完成後再繼續（成功或失敗都會回傳實際 state）。
   * 用途：點「開始遊戲」時必須先等 Context running，才切場景並播第一個音，
   * 避免「尚未恢復就播放」或「剛恢復又被生命週期停止」。
   */
  whenReady(): Promise<string> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve('none');
    if (ctx.state === 'running') return Promise.resolve('running');
    const p = ctx.resume();
    if (!p || typeof p.then !== 'function') return Promise.resolve(ctx.state);
    return p.then(
      () => { this.onResumed(); return ctx.state; },
      () => { this.resumeFailed = true; return ctx.state; },
    );
  }

  /**
   * 診斷專用：在「管理器自己的 Context 與 master 鏈」上播放固定 440Hz／0.3 秒對照音。
   * 不另建 Context、不繞過 master、不改音量。
   * 若這條能發聲而 shoot 不能，差異就在聲音種類；若都不能，則在共用輸出鏈。
   */
  probeTone(): string {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx) return 'blocked: no-ctx';
    if (!master) return 'blocked: no-master';
    if (ctx.state !== 'running') return 'blocked: ctx-' + ctx.state;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.32);
      return 'scheduled-tone（440Hz 0.3s 經 master）';
    } catch (e) {
      return 'error: ' + (e instanceof Error ? e.message : String(e));
    }
  }

  /** 診斷：AudioManager 的離線渲染，使用與 spawn() 相同的聲源與包絡參數 */
  static async renderOffline(kind: SfxName, seconds = 0.4): Promise<{ peak: number; nonzero: number; error?: string }> {
    const Ctor = window.OfflineAudioContext
      ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctor) return { peak: 0, nonzero: 0, error: 'OfflineAudioContext 不支援' };
    const ctx = new Ctor(1, Math.floor(44100 * seconds), 44100);
    // 用同一組頻率與包絡常數（與 spawn 中的 case 對應）
    const spec: Record<string, { type: OscillatorType; f0: number; f1: number; dur: number; peak: number }[]> = {
      shoot: [{ type: 'triangle', f0: 620, f1: 980, dur: 0.085, peak: 0.10 }],
      hit: [{ type: 'square', f0: 420, f1: 260, dur: 0.05, peak: 0.045 }],
      kill: [{ type: 'sine', f0: 300, f1: 90, dur: 0.24, peak: 0.16 }],
      hurt: [{ type: 'sawtooth', f0: 330, f1: 180, dur: 0.16, peak: 0.13 }],
      warn: [{ type: 'square', f0: 720, f1: 720, dur: 0.07, peak: 0.075 }],
      ui: [{ type: 'triangle', f0: 880, f1: 620, dur: 0.06, peak: 0.08 }],
      win: [{ type: 'triangle', f0: 523, f1: 523, dur: 0.14, peak: 0.12 }],
      lose: [{ type: 'sine', f0: 392, f1: 392, dur: 0.18, peak: 0.11 }],
    };
    try {
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const voice = ctx.createGain();
      voice.gain.value = 0;
      voice.connect(master);
      for (const s of spec[kind] ?? []) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = s.type;
        o.frequency.setValueAtTime(s.f0, 0);
        o.frequency.exponentialRampToValueAtTime(Math.max(40, s.f1), s.dur);
        g.gain.setValueAtTime(0, 0);
        g.gain.linearRampToValueAtTime(s.peak, 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, s.dur);
        o.connect(g);
        g.connect(voice);
        o.start(0);
        o.stop(s.dur + 0.02);
      }
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
    } catch (e) {
      return { peak: 0, nonzero: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** resume 是否曾失敗（僅供除錯判斷，不影響玩法） */
  hasResumeFailed(): boolean { return this.resumeFailed; }

  /**
   * 唯讀診斷快照：只讀，不改變任何播放狀態。
   * 診斷頁用它顯示 AudioManager 自己的 Context，不與原生對照 Context 混用。
   */
  debugSnapshot(): {
    enabled: boolean;
    suspended: boolean;
    resumeFailed: boolean;
    hasCtx: boolean;
    state: string;
    currentTime: number;
    masterGain: number | null;
    masterConnected: boolean;
    voices: number;
  } {
    const ctx = this.ctx;
    return {
      enabled: this.enabled,
      suspended: this.suspended,
      resumeFailed: this.resumeFailed,
      hasCtx: !!ctx,
      state: ctx ? ctx.state : 'none',
      currentTime: ctx ? ctx.currentTime : 0,
      masterGain: this.master ? this.master.gain.value : null,
      masterConnected: !!this.master,
      voices: this.voices.length,
    };
  }

  /** 診斷用：回傳最近一次 play() 的判定結果（不改變行為） */
  lastPlayResult(): string {
    return this._lastResult || 'none';
  }

  /** 診斷頁專用的公開測試入口：走完全相同的 play() 路徑，但回報結果與原因 */
  verbosePlay(kind: SfxName): string {
    if (!this.enabled) { this._lastResult = 'blocked: muted'; return this._lastResult; }
    if (this.suspended) { this._lastResult = 'blocked: app-suspended'; return this._lastResult; }
    const ctx = this.ctx;
    if (!ctx) { this._lastResult = 'blocked: no-ctx（尚未在點擊中 unlock）'; return this._lastResult; }
    if (!this.master) { this._lastResult = 'blocked: no-master'; return this._lastResult; }
    if (ctx.state !== 'running') { this._lastResult = 'blocked: ctx-' + ctx.state; return this._lastResult; }
    const now = ctx.currentTime * 1000;
    if (this.throttled(kind, now)) { this._lastResult = 'blocked: throttled'; return this._lastResult; }
    if (this.voices.length >= MAX_VOICES) {
      const weakest = this.voices.reduce((a, b) => (a.priority <= b.priority ? a : b));
      if (weakest.priority >= PRIORITY[kind]) { this._lastResult = 'blocked: dropped-capacity'; return this._lastResult; }
      this.voices = this.voices.filter((v) => v !== weakest);
      this.kill(weakest);
    }
    const voice = this.spawn(ctx, this.master, kind);
    if (!voice) { this._lastResult = 'spawn-failed'; return this._lastResult; }
    this.markPlayed(kind, now);
    this.voices.push(voice);
    const lifeMs = (voice.stopAt - ctx.currentTime) * 1000;
    window.setTimeout(() => {
      this.voices = this.voices.filter((v) => v !== voice);
    }, Math.max(0, lifeMs) + 60);
    this._lastResult = 'scheduled（source 開始 ' + voice.nodes.length + ' 個節點）';
    return this._lastResult;
  }

  private async resume(): Promise<void> {
    if (!this.ctx) return this.unlock();
    try {
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch { /* 忽略 */ }
  }

  /** 暫停／失焦／轉直向：停止戰鬥聲，保留按鈕回饋（由呼叫端決定是否全停） */
  setSuspended(v: boolean): void {
    if (__DEV_HOOK__) this.log('setSuspended:' + String(v) + ':' + this.caller(), 'ui');
    this.suspended = v;
    if (v) this.stopAll();
    else void this.resume();
  }

  stopAll(): void {
    if (__DEV_HOOK__) this.log('stopAll:' + this.voices.length + ':' + this.caller(), 'ui');
    for (const v of this.voices) this.kill(v);
    this.voices = [];
  }

  dispose(): void {
    this.stopAll();
    try { void this.ctx?.close(); } catch { /* 忽略 */ }
    this.ctx = null;
    this.master = null;
  }

  // ── 節流 ────────────────────────────────────────────────
  /**
   * 節流：以 AudioContext.currentTime（同一時間軸）判斷。
   * 規則：
   *   1. 沒有歷史紀錄 → 直接允許（首次請求不應被擋）
   *   2. 間隔足夠 → 允許
   *   3. 被拒絕時**不更新**最後時間，避免把排程時間往前推
   * 只有「真的排程出去」的請求才呼叫 markPlayed() 記錄時間。
   */
  private throttled(kind: SfxName, now: number): boolean {
    if (kind === 'shoot') return this.lastShootAt !== -1 && now - this.lastShootAt < 55;
    if (kind === 'hit') return this.lastHitAt !== -1 && now - this.lastHitAt < 45;
    if (kind === 'warn') return this.lastWarnAt !== -1 && now - this.lastWarnAt < 220;
    return false;
  }

  /** 排程成功後才記錄時間（被節流擋下的請求不記錄） */
  private markPlayed(kind: SfxName, now: number): void {
    if (kind === 'shoot') this.lastShootAt = now;
    else if (kind === 'hit') this.lastHitAt = now;
    else if (kind === 'warn') this.lastWarnAt = now;
  }

  // ── 播放 ────────────────────────────────────────────────
  play(kind: SfxName): void {
    if (__DEV_HOOK__) {
      const w = window as unknown as { __SFX__?: Array<{ t: number; type: string; result: string }> };
      w.__SFX__ = w.__SFX__ || [];
      if (w.__SFX__.length < 500) {
        let result = 'played';
        if (!this.enabled) result = 'muted';
        else if (this.suspended) result = 'suspended';
        else if (!this.ctx) result = 'no-ctx';
        else if (this.ctx.state !== 'running') result = 'ctx-' + this.ctx.state;
        w.__SFX__.push({ t: Math.round(performance.now()), type: kind, result });
      }
    }
    if (!this.enabled || this.suspended) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const now = ctx.currentTime * 1000;
    if (this.throttled(kind, now)) { this.log('throttled', kind); return; }

    // 聲部上限：容量不足時，先丟掉優先度最低的（射擊）
    if (this.voices.length >= MAX_VOICES) {
      const weakest = this.voices.reduce((a, b) => (a.priority <= b.priority ? a : b));
      if (weakest.priority >= PRIORITY[kind]) { this.log('dropped-capacity', kind); return; }
      this.voices = this.voices.filter((v) => v !== weakest);
      this.kill(weakest);
    }

    const voice = this.spawn(ctx, master, kind);
    if (!voice) return;
    this.markPlayed(kind, now);
    this.voices.push(voice);

    const lifeMs = (voice.stopAt - ctx.currentTime) * 1000;
    window.setTimeout(() => {
      this.voices = this.voices.filter((v) => v !== voice);
    }, Math.max(0, lifeMs) + 60);
  }

  /** dev：取呼叫堆疊中的第一個非 audio.ts 幀，辨識呼叫來源 */
  private caller(): string {
    const st = new Error().stack ?? '';
    const line = st.split('\n').find((l) => l.includes('http') && !l.includes('/systems/audio'));
    if (!line) return 'unknown';
    const m = line.match(/([A-Za-z0-9_-]+\.ts):(\d+)/);
    return m ? m[1] + ':' + m[2] : 'unknown';
  }

  private log(reason: string, kind: SfxName): void {
    if (!__DEV_HOOK__) return;
    const w = window as unknown as { __SFX__?: Array<{ t: number; type: string; result: string }> };
    w.__SFX__ = w.__SFX__ || [];
    if (w.__SFX__.length < 500) {
      w.__SFX__.push({ t: Math.round(performance.now()), type: kind, result: reason });
    }
  }

  /** 聲源計數：排程時 +1，結束時（onended 或 stop）皆會 -1，只減一次 */
  private trackSource(node: AudioScheduledSourceNode, startAt: number, stopAt: number): void {
    const key = '__counted';
    (node as unknown as Record<string, boolean>)[key] = true;
    this.activeSources += 1;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      (node as unknown as Record<string, boolean>)[key] = false;
      this.activeSources = Math.max(0, this.activeSources - 1);
    };
    node.onended = release;
    // 保險：即使 onended 未觸發，也在結束後釋放
    const ms = Math.max(0, (stopAt - startAt) * 1000) + 120;
    window.setTimeout(release, ms);
  }

  /** 是否還有聲源容量可容納 need 個節點 */
  private hasSourceRoom(need: number): boolean {
    return this.activeSources + need <= MAX_SOURCES;
  }

  private kill(v: Voice): void {
    try {
      v.gain.gain.cancelScheduledValues(0);
      v.gain.gain.setValueAtTime(0, 0);
      for (const n of v.nodes) { try { n.stop(); } catch { /* 已停止 */ } }
      v.gain.disconnect();
    } catch { /* 忽略 */ }
  }

  /** 每個音效都是一個短包絡；不放循環、不長尾 */
  /** 各音效需要的聲源節點數（與 spawn 中的呼叫次數對應） */
  private static readonly SOURCE_NEED: Record<SfxName, number> = {
    shoot: 2, hit: 2, kill: 3, hurt: 2, warn: 2, ui: 1, win: 4, lose: 3,
  };

  private spawn(ctx: AudioContext, out: GainNode, kind: SfxName): Voice | null {
    // 容量不足就先不放：避免只播出「半個和弦」或不完整的疊音
    if (!this.hasSourceRoom(AudioManager.SOURCE_NEED[kind])) {
      this._lastResult = 'blocked: source-capacity';
      return null;
    }
    const t = ctx.currentTime;
    // voice 增益層保留給 stopAll 歸零用；初值必須是 1，
    // 否則（原本為 0 且從未排程）會把整條鏈乘成 0 → 完全無聲。
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(out);

    const nodes: AudioScheduledSourceNode[] = [];

    const tone = (
      type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0,
    ): void => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + delay + dur);
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(peak, t + delay + 0.012);      // 淡入，避免喀聲
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);  // 淡出
      o.connect(g); g.connect(gain);
      this.trackSource(o, t + delay, t + delay + dur + 0.02);
      nodes.push(o);
    };

    // 輕泛音：與主音同時起音，音量很低，只為增加層次
    const overtone = (
      type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0,
    ): void => {
      tone(type, f0, f1, dur, peak, delay);
    };

    const noiseHit = (dur: number, peak: number, hp = 800): void => {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = hp;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt); filt.connect(g); g.connect(gain);
      this.trackSource(src, t, t + dur);
      nodes.push(src);
    };

    let end = 0;
    switch (kind) {
      case 'shoot': {
        // 短促滑音 + 很輕的泛音（不同波形），維持低音量；不做和弦
        tone('triangle', 760, 1180, 0.075, 0.095);
        overtone('sine', 1520, 2360, 0.05, 0.022);
        end = 0.10;
        break;
      }
      case 'hit': {
        // 短敲擊 + 少量噪聲，與射擊（滑音）明顯不同
        noiseHit(0.045, 0.085, 1800);
        tone('square', 300, 180, 0.045, 0.05);
        end = 0.06;
        break;
      }
      case 'kill': {
        // 低音衝擊 + 短爆散；力度靠低頻與噪聲，不靠大音量
        tone('sine', 220, 70, 0.22, 0.17);
        overtone('triangle', 110, 55, 0.18, 0.06);
        noiseHit(0.11, 0.06, 500);
        end = 0.26;
        break;
      }
      case 'hurt': {
        // 清楚的雙音下行（避開擊破的低頻衝擊感）
        tone('triangle', 520, 520, 0.10, 0.13);
        tone('triangle', 392, 392, 0.16, 0.12, 0.10);
        end = 0.28;
        break;
      }
      case 'warn': {
        // 簡短易辨識：兩音上跳，不密集
        tone('square', 660, 660, 0.055, 0.07);
        tone('square', 880, 880, 0.055, 0.06, 0.07);
        end = 0.14;
        break;
      }
      case 'ui': {
        tone('triangle', 820, 640, 0.05, 0.07);
        end = 0.06;
        break;
      }
      case 'win': {
        // 短促明亮和弦（同時發聲，非旋律）
        tone('triangle', 523, 523, 0.20, 0.10);
        tone('triangle', 659, 659, 0.20, 0.09);
        tone('triangle', 784, 784, 0.26, 0.09);
        overtone('sine', 1046, 1046, 0.22, 0.05);
        end = 0.30;
        break;
      }
      case 'lose': {
        // 柔和低沉雙音
        tone('sine', 330, 330, 0.26, 0.10);
        tone('sine', 247, 247, 0.38, 0.095, 0.12);
        overtone('sine', 165, 165, 0.36, 0.045, 0.12);
        end = 0.52;
        break;
      }
    }

    return { name: kind, priority: PRIORITY[kind], gain, nodes, stopAt: t + end + 0.05 };
  }
}

/** 全遊戲單例：重玩／回首頁都沿用同一個 AudioContext */
export const audio = new AudioManager();
