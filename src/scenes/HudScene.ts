import Phaser from 'phaser';
import { loadSettings, saveSettings } from '../systems/storage';
import { audio } from '../systems/audio';
import type { RunResult } from '../types';

interface HudState {
  hp: number;
  maxHp: number;
  score: number;
  elapsedMs: number;
  durationMs: number;
  phase: 'playing' | 'finishing' | 'won' | 'lost';
}

/**
 * 頂部資訊列配色（依 docs/art-direction/gameplay-concept-v1.jpg 取樣）
 * 深藍底 + 青藍細框 + 綠色進度 + 淺金分數
 */
const C = {
  plate: 0x1d3b56,
  plateAlpha: 0.88,
  frame: 0x7fdffc,
  trackNavy: 0x0e2b42,
  fillGreen: 0x46d17a,
  fillGreenHi: 0x8ff0b0,
  gold: '#FFE6A3',
  goldStroke: '#3a2a10',
  white: '#FFFFFF',
  navyStroke: '#0d2334',
};

/**
 * HudScene：永遠不被暫停的 UI 層（規格 §11.1）。
 * 暫停、結算都放在這裡，確保 GameScene 暫停後按鈕仍可點。
 */
export class HudScene extends Phaser.Scene {
  private overlay: Phaser.GameObjects.Container | null = null;

  // 頂部資訊列
  private bar!: Phaser.GameObjects.Container;
  private hearts: Phaser.GameObjects.Text[] = [];
  private heartEmpty: Phaser.GameObjects.Text[] = [];
  private scoreLabel!: Phaser.GameObjects.Text;
  private scoreValue!: Phaser.GameObjects.Text;
  private logo!: Phaser.GameObjects.Image;
  private track!: Phaser.GameObjects.Graphics;
  private fill!: Phaser.GameObjects.Graphics;
  private fillHi!: Phaser.GameObjects.Graphics;
  private timeText!: Phaser.GameObjects.Text;
  private pauseHit!: Phaser.GameObjects.Zone;
  private pauseG!: Phaser.GameObjects.Graphics;
  private sndG!: Phaser.GameObjects.Graphics;
  private sndHit!: Phaser.GameObjects.Zone;
  private sndLabel!: Phaser.GameObjects.Text;
  private finishNote!: Phaser.GameObjects.Text;

  // 版面幾何（由 layoutBar 計算，供各元素定位）
  private geo = {
    barY: 26, barH: 64,
    heartsX: 20, heartsY: 26,
    heartGap: 30, heartSize: 26,
    divX: 0,
    scoreX: 0, scoreY: 26,
    logoX: 0, logoW: 0,
    progX: 0, progW: 0, progY: 26, progH: 16,
    timeX: 0,
    pauseX: 0,
  };

  private lastState: HudState | null = null;

  constructor() { super({ key: 'Hud', active: false }); }

  create(): void {
    this.lastState = null;
    this.hearts = [];
    this.heartEmpty = [];
    this.buildBar();
    this.layoutBar();

    this.events.on('show-pause', this.showPause, this);
    this.events.on('finished', this.showResult, this);
    this.events.on('hud-update', this.onHudUpdate, this);
    this.events.once('shutdown', this.onShutdown, this);
    this.scale.on('resize', this.onResize, this);
    this.events.emit('hud-ready');
  }

  private onResize(): void {
    if (this.bar) this.layoutBar();
  }

  private onShutdown(): void {
    this.clearOverlay();
    this.events.off('show-pause', this.showPause, this);
    this.events.off('finished', this.showResult, this);
    this.events.off('hud-update', this.onHudUpdate, this);
    this.scale.off('resize', this.onResize, this);
    this.bar?.destroy(true);
    this.bar = undefined as unknown as Phaser.GameObjects.Container;
    this.hearts = [];
    this.heartEmpty = [];
  }

  /** 由 GameScene 推送的即時狀態（HUD 不自己猜時間，也不新增計時器） */
  private onHudUpdate(s: HudState): void {
    this.lastState = s;
    const p = Phaser.Math.Clamp(
      s.phase === 'finishing' || s.phase === 'won' || s.phase === 'lost'
        ? 1
        : s.elapsedMs / Math.max(1, s.durationMs),
      0, 1,
    );
    this.paintProgress(p);
    this.paintHearts(s.hp, s.maxHp);
    this.paintScore(s.score);
    this.paintTime(s);
  }

  /** 建立頂部資訊列（獨立 HudScene；不受戰鬥背景與暫停影響） */
  private buildBar(): void {
    // depth 50：高於 GameScene 全部內容；面板另用 1000 以上確保在最上層
    const bar = this.add.container(0, 0).setDepth(50);
    this.bar = bar;

    // 膠囊底板 + 淺青細框
    const plate = this.add.graphics();
    plate.setName('bar-plate');
    bar.add(plate);

    // 五顆愛心：固定五格，實心/空心分開，避免扣血後位置跳動
    for (let i = 0; i < 5; i++) {
      const solid = this.add.text(0, 0, '♥', {
        fontFamily: 'system-ui, "Segoe UI Symbol", sans-serif',
        fontSize: '34px', color: '#FF0000',
      }).setOrigin(0, 0.5).setVisible(false);
      const hollow = this.add.text(0, 0, '♡', {
        fontFamily: 'system-ui, "Segoe UI Symbol", sans-serif',
        fontSize: '34px', color: '#9fc3d6',
      }).setOrigin(0, 0.5).setVisible(false);
      bar.add(solid); bar.add(hollow);
      this.hearts.push(solid); this.heartEmpty.push(hollow);
    }

    // 分隔線
    const div = this.add.graphics().setName('bar-div');
    bar.add(div);

    // 分數
    this.scoreLabel = this.add.text(0, 0, '分數', {
      fontFamily: '"Noto Sans TC", sans-serif', fontStyle: 'bold',
      fontSize: '24px', color: C.white, stroke: C.navyStroke, strokeThickness: 4,
    }).setOrigin(0, 0.5);
    this.scoreValue = this.add.text(0, 0, '0', {
      fontFamily: '"Noto Sans TC", monospace', fontStyle: 'bold',
      fontSize: '30px', color: C.gold, stroke: C.goldStroke, strokeThickness: 4,
    }).setOrigin(0, 0.5);
    bar.add(this.scoreLabel); bar.add(this.scoreValue);

    // LOGO（透明 PNG，不加底板、不攔截觸控）
    if (this.textures.exists('art-logo')) {
      this.logo = this.add.image(0, 0, 'art-logo').setOrigin(0.5);
      bar.add(this.logo);
    } else {
      this.logo = this.add.image(0, 0, '__DEFAULT').setOrigin(0.5).setVisible(false);
    }

    // 進度條：軌道 / 填充 / 亮面
    this.track = this.add.graphics().setName('bar-track');
    this.fill = this.add.graphics().setName('bar-fill');
    this.fillHi = this.add.graphics().setName('bar-fill-hi');
    bar.add(this.track); bar.add(this.fill); bar.add(this.fillHi);

    // 時間（等寬，避免跳動）
    this.timeText = this.add.text(0, 0, '00:00 / 03:00', {
      fontFamily: '"DejaVu Sans Mono", ui-monospace, monospace', fontStyle: 'bold',
      fontSize: '24px', color: C.white, stroke: C.navyStroke, strokeThickness: 4,
    }).setOrigin(0.5, 0.5);
    bar.add(this.timeText);

    // 暫停鈕（圓形 + 白色雙直線）；命中區見 layoutBar
    const pauseG = this.add.graphics().setName('bar-pause');
    bar.add(pauseG);
    this.pauseG = pauseG;
    this.pauseHit = this.add.zone(0, 0, 48, 48).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.pauseHit.on('pointerup', () => {
      // 只送暫停，不觸發搖桿或射擊
      const gs = this.scene.get('Game');
      gs.events.emit('hud-request-pause');
    });
    bar.add(this.pauseHit);

    // 音效開／關：與暫停鈕同風格的小圓鈕，放在暫停鈕左側
    this.sndG = this.add.graphics().setName('bar-sound');
    bar.add(this.sndG);
    this.sndLabel = this.add.text(0, 0, '音效', {
      fontFamily: '"Noto Sans TC", sans-serif', fontStyle: 'bold',
      fontSize: '16px', color: C.white,
    }).setOrigin(0.5);
    bar.add(this.sndLabel);
    this.sndHit = this.add.zone(0, 0, 48, 48).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.sndHit.on('pointerup', () => {
      const on = !audio.isEnabled();
      audio.unlock();
      audio.setEnabled(on);
      audio.play('ui');
      this.paintSound();
    });
    bar.add(this.sndHit);

    // 收尾中提示（小字，避免 03:05 / 03:00）
    this.finishNote = this.add.text(0, 0, '收尾中', {
      fontFamily: '"Noto Sans TC", sans-serif', fontStyle: 'bold',
      fontSize: '18px', color: C.gold, stroke: C.navyStroke, strokeThickness: 3,
    }).setOrigin(0.5, 0).setVisible(false);
    bar.add(this.finishNote);
  }

  // ── 版面與繪製 ───────────────────────────────────────────
  /** 依畫布寬度安排一整條資訊列；寬度不足時依序縮進度條、縮 LOGO、減留白 */
  private layoutBar(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const m = Math.round(W * 0.018);         // 左右安全邊距
    const barTop = Math.round(H * 0.018);
    const barH = Math.max(52, Math.round(H * 0.086));
    const barW = W - m * 2;
    const cy = barTop + barH / 2;

    // 命中區需求：≥48 CSS px。以 canvas 實際顯示比例回推所需邏輯半徑，
    // 確保手機（canvas 約 693 寬）時仍足夠，且兩個按鈕不重疊。
    const cssScale = (this.scale.canvas ? this.game.canvas.getBoundingClientRect().width / this.scale.width : 1) || 1;
    const hitNeeded = 48 / Math.max(0.01, cssScale);      // 需要的邏輯直徑
    const minR = Math.ceil(hitNeeded / 2);
    const pauseR = Math.max(Math.round(Math.min(barH * 0.46, 26)), minR);
    const pauseX = m + barW - pauseR - 8;

    // 時間（等寬）
    this.timeText.setFontSize(Math.round(barH * 0.36));
    // 時間欄位：以「最寬可能字串」量測，避免數字變動時寬度不足被裁切
    const sample = this.timeText.text;
    this.timeText.setText('00:00 / 03:00');
    const timeW = Math.ceil(this.timeText.width) + 8;
    this.timeText.setText(sample);
    // 右側預留（由右往左）：暫停鈕 → gap → 音效鈕 → gap → 時間欄位 → gap → 進度條
    const btnGap = 12;                       // 兩顆圓鈕之間
    const sndR = pauseR;                     // 音效鈕與暫停鈕同尺寸
    const sndX = pauseX - pauseR - btnGap - sndR;
    const timeGap = 12;
    // 時間右緣必須在「音效鈕左緣」再往左一個 gap
    const timeRight = sndX - sndR - timeGap;
    const timeX = timeRight - timeW / 2;

    // 愛心：固定五格
    const heartSize = Math.round(barH * 0.5);
    this.hearts.forEach((h) => h.setFontSize(heartSize));
    this.heartEmpty.forEach((h) => h.setFontSize(heartSize));
    const heartStep = Math.round(heartSize * 0.92);

    // 分數
    this.scoreLabel.setFontSize(Math.round(barH * 0.36));
    this.scoreValue.setFontSize(Math.round(barH * 0.44));

    const heartsW = heartStep * 5;
    const divPad = Math.round(barH * 0.3);
    // 分數字寬以「版面保留 7 格」固定，避免位數變動推擠後面的 LOGO
    // 固定保留「分數 + 6 位數字」寬度：位數增加時不會推擠 LOFO/進度條
    this.scoreValue.setText('999999');
    const scoreReserve = this.scoreLabel.width + 10 + this.scoreValue.width;
    if (this.lastState) this.scoreValue.setText(String(this.lastState.score));
    else this.scoreValue.setText('0');

    // LOGO 與進度條的可用空間
    const fixedLeft = m + heartSize * 0.2 + heartsW + divPad * 2 + scoreReserve + divPad;
    // 右側預留：時間欄位左緣 → 再留 10px → 進度條
    const rightLimit = timeX - timeW / 2 - timeGap;
    let avail = Math.max(120, rightLimit - fixedLeft);

    // LOGO 高度約 barH * 0.86，等比
    let logoH = Math.round(barH * 0.86);
    if (this.logo.texture.key === 'art-logo') {
      const src = this.textures.get('art-logo').getSourceImage() as HTMLImageElement;
      const ratio = logoH / src.height;
      let logoW = src.width * ratio;
      const logoMaxW = avail * 0.38;
      if (logoW > logoMaxW) { logoW = logoMaxW; logoH = logoW * (src.height / src.width); }
      this.logo.setDisplaySize(logoW, logoH);
      this.geo.logoW = logoW;
    } else {
      this.geo.logoW = 0;
    }

    // 以 LOGO「實際顯示右緣」為基準，避免與進度條重疊
    const logoRight = this.geo.logoW > 0
      ? fixedLeft + this.geo.logoW
      : fixedLeft - Math.round(barH * 0.18);
    const progX = logoRight + Math.round(barH * 0.22);
    const progW = Math.max(60, rightLimit - progX - Math.round(barH * 0.18));
    const progH = Math.max(10, Math.round(barH * 0.24));
    this.geo.progX = progX;
    this.geo.progW = progW;
    this.geo.progH = progH;

    // 底板
    const plate = this.bar.getByName('bar-plate') as Phaser.GameObjects.Graphics;
    plate.clear();
    plate.fillStyle(C.plate, C.plateAlpha);
    plate.fillRoundedRect(m, barTop, barW, barH, barH / 2);
    plate.lineStyle(2, C.frame, 0.65);
    plate.strokeRoundedRect(m, barTop, barW, barH, barH / 2);

    // 愛心
    const heartsStart = m + heartSize * 0.2;
    this.hearts.forEach((h, i) => {
      const x = heartsStart + i * heartStep + heartStep / 2;
      h.setPosition(x, cy);
      this.heartEmpty[i].setPosition(x, cy);
    });

    // 分隔線
    const divX = heartsStart + heartsW + divPad;
    const div = this.bar.getByName('bar-div') as Phaser.GameObjects.Graphics;
    div.clear();
    div.lineStyle(2, C.frame, 0.45);
    div.beginPath(); div.moveTo(divX, barTop + barH * 0.24); div.lineTo(divX, barTop + barH * 0.76); div.strokePath();

    // 分數
    const scoreX = divX + divPad;
    this.scoreLabel.setPosition(scoreX, cy);
    this.scoreValue.setPosition(scoreX + this.scoreLabel.width + 10, cy);

    // LOGO
    if (this.geo.logoW > 0) this.logo.setPosition(fixedLeft + this.geo.logoW / 2, cy);
    else this.logo.setPosition(fixedLeft, cy);

    // 進度條
    this.timeText.setPosition(timeX, cy);
    this.geo.progY = cy;

    // 音效鈕（暫停鈕左側）
    this.sndG.clear();
    this.sndG.fillStyle(0x16334a, audio.isEnabled() ? 1 : 0.45).fillCircle(sndX, cy, sndR);
    this.sndG.lineStyle(2, C.frame, audio.isEnabled() ? 0.95 : 0.4).strokeCircle(sndX, cy, sndR);
    if (!audio.isEnabled()) {
      // 關閉時畫斜線（不只靠顏色）
      this.sndG.lineStyle(3, 0xd9534f, 1).beginPath();
      this.sndG.moveTo(sndX - sndR * 0.55, cy - sndR * 0.55);
      this.sndG.lineTo(sndX + sndR * 0.55, cy + sndR * 0.55);
      this.sndG.strokePath();
    }
    this.sndLabel.setPosition(sndX, cy).setAlpha(audio.isEnabled() ? 1 : 0.5);
    const sHit = Math.max(48, sndR * 2);
    this.sndHit.setSize(sHit, sHit);
    this.sndHit.setPosition(sndX, cy);

    // 暫停鈕
    this.pauseG.clear();
    this.pauseG.fillStyle(0x16334a, 1).fillCircle(pauseX, cy, pauseR);
    this.pauseG.lineStyle(2.5, C.frame, 0.95).strokeCircle(pauseX, cy, pauseR);
    const bw = Math.max(4, pauseR * 0.26), bh2 = Math.max(12, pauseR * 0.95);
    this.pauseG.fillStyle(0xffffff, 1);
    this.pauseG.fillRoundedRect(pauseX - pauseR * 0.34, cy - bh2 / 2, bw, bh2, 2);
    this.pauseG.fillRoundedRect(pauseX + pauseR * 0.34 - bw, cy - bh2 / 2, bw, bh2, 2);
    // 命中區：視覺半徑 26，但命中區至少 48×48
    const hit = Math.max(48, pauseR * 2);
    this.pauseHit.setSize(hit, hit);
    this.pauseHit.setPosition(pauseX, cy);

    // 收尾中提示
    this.finishNote.setPosition(progX + progW / 2, barTop + barH + 4);

    // 重新繪製當前進度
    if (this.lastState) this.onHudUpdate(this.lastState);
  }

  /** 音效鈕狀態（開：亮框＋實線；關：淡框＋半透明） */
  private paintSound(): void {
    const g = this.sndG;
    if (!g) return;
    // 由 layoutBar 重畫較繁；這裡只更新透明度與圓框
    const on = audio.isEnabled();
    this.sndLabel.setAlpha(on ? 1 : 0.5);
    g.clear();
    const r = 22;
    const x = this.sndHit.x, y = this.sndHit.y;
    g.fillStyle(0x16334a, on ? 1 : 0.45).fillCircle(x, y, r);
    g.lineStyle(2, C.frame, on ? 0.95 : 0.4).strokeCircle(x, y, r);
    if (!on) {
      // 關閉時畫一條斜線，不必靠顏色單獨辨識
      g.lineStyle(3, 0xd9534f, 1).beginPath();
      g.moveTo(x - 13, y - 13); g.lineTo(x + 13, y + 13); g.strokePath();
    }
  }

  private paintHearts(hp: number, maxHp: number): void {
    for (let i = 0; i < 5; i++) {
      const alive = i < Math.min(hp, maxHp);
      this.hearts[i].setVisible(alive);
      this.heartEmpty[i].setVisible(!alive);
    }
  }

  private paintScore(score: number): void {
    this.scoreValue.setText(String(score));
  }

  private paintTime(s: HudState): void {
    const capped = Math.min(s.elapsedMs, s.durationMs);
    this.timeText.setText(`${fmt(capped)} / ${fmt(s.durationMs)}`);
    this.finishNote.setVisible(s.phase === 'finishing');
  }

  private paintProgress(p: number): void {
    const { progX, progW, progH } = this.geo;
    const y = this.geo.progY;
    const x0 = progX, y0 = y - progH / 2;
    this.track.clear();
    this.track.fillStyle(C.trackNavy, 1).fillRoundedRect(x0, y0, progW, progH, progH / 2);
    this.track.lineStyle(2, C.frame, 0.9).strokeRoundedRect(x0, y0, progW, progH, progH / 2);
    const w = Math.max(0, Math.min(progW, progW * p));
    this.fill.clear();
    if (w > 0) {
      this.fill.fillStyle(C.fillGreen, 1).fillRoundedRect(x0, y0, w, progH, progH / 2);
      this.fillHi.clear();
      this.fillHi.fillStyle(C.fillGreenHi, 0.5).fillRoundedRect(
        x0 + 2, y0 + progH * 0.18, Math.max(0, w - 4), progH * 0.3, progH * 0.15,
      );
    } else {
      this.fillHi.clear();
    }
  }

  private clearOverlay(): void {
    this.overlay?.destroy(true);
    this.overlay = null;
  }

  private panel(title: string): Phaser.GameObjects.Container {
    this.clearOverlay();
    const { width, height } = this.scale;
    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x0b2b3c, 0.55);
    const box = this.add.rectangle(width / 2, height / 2, 620, 420, 0xffffff, 0.97).setStrokeStyle(4, 0x2a9d8f);
    const label = this.add.text(width / 2, height / 2 - 150, title, {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '44px', color: '#1b4965',
    }).setOrigin(0.5);
    // 面板必須蓋過頂部資訊列（depth 50）
    const c = this.add.container(0, 0, [shade, box, label]).setDepth(1000);
    this.overlay = c;
    return c;
  }

  private button(c: Phaser.GameObjects.Container, y: number, text: string, onClick: () => void): void {
    const { width } = this.scale;
    const b = this.add.text(width / 2, y, text, {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '30px', color: '#ffffff',
      backgroundColor: '#2a9d8f', padding: { x: 40, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    b.on('pointerup', () => { audio.play('ui'); onClick(); });
    c.add(b);
  }

  private showPause(): void {
    const { height } = this.scale;
    const c = this.panel('已暫停');
    this.button(c, height / 2 - 40, '繼續', () => {
      this.clearOverlay();
      this.scene.resume('Game');
    });
    this.button(c, height / 2 + 60, '重新開始', () => {
      this.clearOverlay();
      const gs = this.scene.get('Game') as unknown as { restartRun: () => void };
      this.scene.resume('Game');
      gs.restartRun();
    });
    this.button(c, height / 2 + 160, '回主選單', () => {
      this.clearOverlay();
      (this.scene.get('Game') as unknown as { stopForMenu: () => void }).stopForMenu();
    });
  }

  private showResult(r: RunResult): void {
    const { height } = this.scale;
    const settings = loadSettings();
    const isNew = r.score > settings.highScore;
    if (isNew) { settings.highScore = r.score; saveSettings(settings); }

    const title = r.outcome === 'won' ? '通關成功' : '本次失敗';
    const c = this.panel(title);
    const { width } = this.scale;
    c.add(this.add.text(width / 2, height / 2 - 80, `分數 ${r.score}`, {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '36px', color: '#2a6f77',
    }).setOrigin(0.5));
    c.add(this.add.text(width / 2, height / 2 - 30, `擊破 ${r.kills}　逃脫 ${r.escapes}　生命獎勵 ${r.breakdown.hpBonus}`, {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '22px', color: '#5a8aa8',
    }).setOrigin(0.5));
    c.add(this.add.text(width / 2, height / 2 + 10, isNew ? '新紀錄！' : `最高分 ${settings.highScore}`, {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '22px', color: isNew ? '#e76f51' : '#5a8aa8',
    }).setOrigin(0.5));

    this.button(c, height / 2 + 90, '再玩一次', () => {
      this.clearOverlay();
      const gs = this.scene.get('Game') as unknown as { restartRun: () => void };
      gs.restartRun();
    });
    this.button(c, height / 2 + 170, '回主選單', () => {
      this.clearOverlay();
      (this.scene.get('Game') as unknown as { stopForMenu: () => void }).stopForMenu();
    });
  }
}

/** MM:SS，分鐘與秒都補零（顯示用，不改遊戲規則） */
function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
