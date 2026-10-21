import Phaser from 'phaser';

/**
 * 手機橫向觸控：左側移動盤、右側按住射擊、右上獨立暫停。
 * 與鍵盤共用 InputState；多指分別追蹤；pointercancel／失焦清除並暫停。
 */
export interface TouchState {
  moveX: number;
  moveY: number;
  firing: boolean;
  pauseRequested: boolean;
}

export class TouchController {
  private readonly state: TouchState = { moveX: 0, moveY: 0, firing: false, pauseRequested: false };
  private readonly movePointers = new Map<number, { x: number; y: number }>();
  private readonly firePointers = new Set<number>();
  private readonly cleanups: Array<() => void> = [];
  private readonly radius = 80;
  private readonly deadZone = 12;
  /** 浮動搖桿中心：按下時決定，放開清空 */
  private origin: { id: number; x: number; y: number } | null = null;
  private stick?: Phaser.GameObjects.Arc;
  private knob?: Phaser.GameObjects.Arc;
  private fireZone?: Phaser.GameObjects.Rectangle;
  private pauseBtn?: Phaser.GameObjects.Text;
  private pauseBg?: Phaser.GameObjects.Rectangle;
  private pauseBounds?: Phaser.Geom.Rectangle;
  private onInterrupt: (() => void) | null = null;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, onInterrupt: () => void) {
    this.scene = scene;
    this.onInterrupt = onInterrupt;
  }

  /** 只在觸控裝置顯示；桌面不佔畫面 */
  attach(canvas: HTMLCanvasElement, enabled: boolean): void {
    if (!enabled) return;

    this.stick = this.scene.add.circle(0, 0, this.radius, 0xffffff, 0.18)
      .setDepth(20).setStrokeStyle(2, 0xffffff, 0.5).setVisible(false);
    this.knob = this.scene.add.circle(0, 0, 32, 0x2a9d8f, 0.75).setDepth(21).setVisible(false);
    this.fireZone = this.scene.add.rectangle(1050, 540, 380, 340, 0xffffff, 0.08)
      .setDepth(20).setStrokeStyle(1, 0xffffff, 0.25);
    this.scene.add.text(1050, 540, '按住射擊', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(21).setAlpha(0.7);
    // 暫停鈕：邏輯 96×96 → 844×390 下約 52×52 CSS px（≥48）
    const pauseBg = this.scene.add.rectangle(1190, 70, 96, 96, 0xffffff, 0.35)
      .setDepth(21).setStrokeStyle(2, 0xffffff, 0.6);
    this.pauseBtn = this.scene.add.text(1190, 70, '⏸', { fontSize: '52px', color: '#1b4965' })
      .setOrigin(0.5).setDepth(22).setInteractive({ useHandCursor: true });
    this.pauseBg = pauseBg;
    pauseBg.setInteractive({ useHandCursor: true });
    pauseBg.on('pointerdown', (e: Phaser.Input.Pointer) => {
      e.event.stopPropagation();
      this.state.pauseRequested = true;
    });
    this.pauseBtn.on('pointerdown', (e: Phaser.Input.Pointer) => {
      e.event.stopPropagation();
      this.state.pauseRequested = true;
    });
    // 以實際 bounds 定義排除區（暫停鈕含底盤）
    this.pauseBounds = new Phaser.Geom.Rectangle(1190 - 48, 70 - 48, 96, 96);

    const down = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 1280;
      const y = ((e.clientY - rect.top) / rect.height) * 720;
      const inPause = this.pauseBounds?.contains(x, y) ?? false;
      if (inPause) { this.state.pauseRequested = true; return; }
      if (x > 900 && y > 360) {
        this.firePointers.add(e.pointerId);
      } else if (x < 640 && this.origin === null) {
        // 浮動搖桿：以首次按下的位置作為中心
        this.origin = { id: e.pointerId, x, y };
        this.movePointers.set(e.pointerId, { x, y });
        this.stick?.setPosition(x, y).setVisible(true);
        this.knob?.setPosition(x, y).setVisible(true);
        canvas.setPointerCapture?.(e.pointerId);
      }
    };
    const move = (e: PointerEvent) => {
      if (!this.movePointers.has(e.pointerId)) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 1280;
      const y = ((e.clientY - rect.top) / rect.height) * 720;
      this.movePointers.set(e.pointerId, { x, y });
      this.updateKnob();
    };
    const up = (e: PointerEvent) => {
      this.movePointers.delete(e.pointerId);
      this.firePointers.delete(e.pointerId);
      if (this.origin && this.origin.id === e.pointerId) {
        this.origin = null;
        this.stick?.setVisible(false);
        this.knob?.setVisible(false);
      }
    };
    const cancel = (e: PointerEvent) => {
      this.movePointers.delete(e.pointerId);
      this.firePointers.delete(e.pointerId);
      this.clearAll();
      this.onInterrupt?.();
    };
    const blur = () => { this.clearAll(); this.onInterrupt?.(); };
    const vis = () => { if (document.hidden) { this.clearAll(); this.onInterrupt?.(); } };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', vis);
    this.cleanups.push(
      () => canvas.removeEventListener('pointerdown', down),
      () => canvas.removeEventListener('pointermove', move),
      () => canvas.removeEventListener('pointerup', up),
      () => canvas.removeEventListener('pointercancel', cancel),
      () => window.removeEventListener('blur', blur),
      () => document.removeEventListener('visibilitychange', vis),
    );
  }

  private updateKnob(): void {
    if (!this.knob || !this.origin) return;
    const p = [...this.movePointers.values()][0];
    if (!p) { this.knob.setPosition(this.origin.x, this.origin.y); return; }
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, this.radius / len);
    this.knob.setPosition(this.origin.x + dx * k, this.origin.y + dy * k);
  }

  read(): TouchState {
    let x = 0;
    let y = 0;
    if (this.origin && this.movePointers.size > 0) {
      const p = this.movePointers.get(this.origin.id) ?? [...this.movePointers.values()][0];
      let dx = p.x - this.origin.x;
      let dy = p.y - this.origin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > this.deadZone) {
        const scale = Math.min(1, (dist - this.deadZone) / (this.radius - this.deadZone));
        x = (dx / dist) * scale;
        y = (dy / dist) * scale;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.state.moveX = x;
    this.state.moveY = y;
    this.state.firing = this.firePointers.size > 0;
    return this.state;
  }

  consumePause(): boolean {
    const v = this.state.pauseRequested;
    this.state.pauseRequested = false;
    return v;
  }

  clearAll(): void {
    this.origin = null;
    this.stick?.setVisible(false);
    this.knob?.setVisible(false);
    this.movePointers.clear();
    this.firePointers.clear();
    this.state.moveX = 0;
    this.state.moveY = 0;
    this.state.firing = false;
    this.state.pauseRequested = false;
    this.updateKnob();
  }

  destroy(): void {
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    this.stick?.destroy();
    this.knob?.destroy();
    this.fireZone?.destroy();
    this.pauseBtn?.destroy();
    this.pauseBg?.destroy();
    this.onInterrupt = null;
  }
}
