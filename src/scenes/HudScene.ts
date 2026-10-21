import Phaser from 'phaser';
import { loadSettings, saveSettings } from '../systems/storage';
import type { RunResult } from '../types';

/**
 * HudScene：永遠不被暫停的 UI 層（規格 §11.1）。
 * 暫停、結算都放在這裡，確保 GameScene 暫停後按鈕仍可點。
 */
export class HudScene extends Phaser.Scene {
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() { super({ key: 'Hud', active: false }); }

  create(): void {
    this.events.on('show-pause', () => this.showPause());
    this.events.on('finished', (r: RunResult) => this.showResult(r));
    this.events.once('shutdown', () => this.clearOverlay());
    this.events.emit('hud-ready');
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
    const c = this.add.container(0, 0, [shade, box, label]).setDepth(100);
    this.overlay = c;
    return c;
  }

  private button(c: Phaser.GameObjects.Container, y: number, text: string, onClick: () => void): void {
    const { width } = this.scale;
    const b = this.add.text(width / 2, y, text, {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '30px', color: '#ffffff',
      backgroundColor: '#2a9d8f', padding: { x: 40, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    b.on('pointerup', onClick);
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
