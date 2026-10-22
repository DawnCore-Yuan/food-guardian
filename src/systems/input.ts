import type { InputState } from '../types';

/**
 * 判斷事件是否來自行「文字輸入」的欄位（暱稱輸入框、貼上、組字）。
 * 這些元素有焦點時，遊戲快捷鍵不得攔截、不得 preventDefault，也不得記成按鍵狀態。
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  // 只放行會輸入文字的 type；radio/checkbox/button 等仍視為一般按鍵操作
  const type = (target as HTMLInputElement).type;
  return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type);
}

/**
 * InputController：鍵盤與觸控 → 共同 InputState。
 * 依規格 §9.1：正常 pointerup 只解除該 pointer；cancel/blur/hidden 才清空並要求暫停。
 */
export class InputController {
  private keys = new Set<string>();
  private readonly state: InputState = { moveX: 0, moveY: 0, firing: false, pauseRequested: false };
  private onInterrupt: (() => void) | null = null;
  private readonly cleanups: Array<() => void> = [];

  attach(_target: HTMLElement, onInterrupt: () => void): void {
    this.onInterrupt = onInterrupt;

    const kd = (e: KeyboardEvent) => {
      // 文字輸入優先：輸入框（含中文組字）有焦點時整個事件不處理。
      // 不可只跳過 preventDefault，否則按鍵仍會留在 keys，關閉面板後角色會自己動。
      if (isTextEntryTarget(e.target) || e.isComposing || e.keyCode === 229) return;
      if (this.isGameKey(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.state.pauseRequested = true;
    };
    const ku = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target) || e.isComposing) return;
      this.keys.delete(e.code);
    };

    const blur = () => { this.clearAll(); this.onInterrupt?.(); };
    const vis = () => { if (document.hidden) { this.clearAll(); this.onInterrupt?.(); } };

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', vis);

    this.cleanups.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => window.removeEventListener('blur', blur),
      () => document.removeEventListener('visibilitychange', vis),
    );
  }

  private isGameKey(code: string): boolean {
    return ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyJ','KeyP','Escape'].includes(code);
  }

  clearAll(): void {
    this.keys.clear();
    this.state.moveX = 0;
    this.state.moveY = 0;
    this.state.firing = false;
    this.state.pauseRequested = false;
  }

  read(): InputState {
    let x = 0;
    let y = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) y -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) y += 1;

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }

    this.state.moveX = x;
    this.state.moveY = y;
    this.state.firing = this.keys.has('Space') || this.keys.has('KeyJ');
    return this.state;
  }

  consumePause(): boolean {
    const v = this.state.pauseRequested;
    this.state.pauseRequested = false;
    return v;
  }

  destroy(): void {
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    this.onInterrupt = null;
  }
}
