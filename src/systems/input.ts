import type { InputState } from '../types';

/**
 * InputController：鍵盤與觸控 → 共同 InputState。
 * 依規格 §9.1：正常 pointerup 只解除該 pointer；cancel/blur/hidden 才清空並要求暫停。
 */
export class InputController {
  private keys = new Set<string>();
  private firePointers = new Set<number>();
  private movePointers = new Map<number, { x: number; y: number }>();
  private readonly state: InputState = { moveX: 0, moveY: 0, firing: false, pauseRequested: false };
  private onInterrupt: (() => void) | null = null;
  private readonly cleanups: Array<() => void> = [];

  attach(target: HTMLElement, onInterrupt: () => void): void {
    this.onInterrupt = onInterrupt;

    const kd = (e: KeyboardEvent) => {
      if (this.isGameKey(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') this.state.pauseRequested = true;
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);

    const down = (e: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      if (relX < 0.5) {
        this.movePointers.set(e.pointerId, { x: relX, y: (e.clientY - rect.top) / rect.height });
      } else {
        this.firePointers.add(e.pointerId);
      }
      target.setPointerCapture?.(e.pointerId);
    };
    const up = (e: PointerEvent) => {
      // 正常放開：只解除這根手指，不暫停
      this.movePointers.delete(e.pointerId);
      this.firePointers.delete(e.pointerId);
    };
    const cancel = (e: PointerEvent) => {
      this.movePointers.delete(e.pointerId);
      this.firePointers.delete(e.pointerId);
      this.clearAll();
      this.onInterrupt?.();
    };
    const blur = () => { this.clearAll(); this.onInterrupt?.(); };
    const vis = () => { if (document.hidden) { this.clearAll(); this.onInterrupt?.(); } };

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', vis);

    this.cleanups.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => target.removeEventListener('pointerdown', down),
      () => target.removeEventListener('pointerup', up),
      () => target.removeEventListener('pointercancel', cancel),
      () => window.removeEventListener('blur', blur),
      () => document.removeEventListener('visibilitychange', vis),
    );
  }

  private isGameKey(code: string): boolean {
    return ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD','KeyJ','KeyP','Escape'].includes(code);
  }

  clearAll(): void {
    this.keys.clear();
    this.firePointers.clear();
    this.movePointers.clear();
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

    if (this.movePointers.size > 0) {
      let sx = 0; let sy = 0;
      for (const p of this.movePointers.values()) { sx += p.x - 0.25; sy += p.y - 0.5; }
      x += sx * 2;
      y += sy * 2;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }

    this.state.moveX = x;
    this.state.moveY = y;
    this.state.firing = this.firePointers.size > 0 || this.keys.has('Space') || this.keys.has('KeyJ');
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
