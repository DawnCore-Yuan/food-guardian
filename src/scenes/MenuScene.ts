import Phaser from 'phaser';
import { loadSettings } from '../systems/storage';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#eaf4fb');

    this.add.text(width / 2, height * 0.22, '食安防衛隊', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '72px', color: '#1b4965',
    }).setOrigin(0.5);

    // B 階段測試版標示：避免與正式三段關卡文案混淆
    this.add.text(width / 2, height * 0.32, 'B 階段測試版｜18 秒｜目前僅菌團怪', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '26px', color: '#e76f51',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.39, '正式版為 3 分鐘、三類危害', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '20px', color: '#5a8aa8',
    }).setOrigin(0.5);

    const best = loadSettings().highScore;
    this.add.text(width / 2, height * 0.46, `最高分：${best}`, {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '24px', color: '#5a8aa8',
    }).setOrigin(0.5);

    const start = this.add.text(width / 2, height * 0.62, '開始遊戲', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '40px', color: '#ffffff',
      backgroundColor: '#2a9d8f', padding: { x: 48, y: 18 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    start.on('pointerup', () => this.startGame());
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());

    // 依輸入能力顯示：觸控尚未實作，明確標示
    const touch = typeof window !== 'undefined' && 'ontouchstart' in window;
    this.add.text(width / 2, height * 0.78, '目前請使用鍵盤遊玩（觸控控制尚未實作）', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '22px', color: touch ? '#e76f51' : '#7c9cb3',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.90, 'WASD／方向鍵移動　Space／J 射擊　Esc／P 暫停', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '18px', color: '#7c9cb3',
    }).setOrigin(0.5);
  }

  private startGame(): void {
    this.scene.start('Game');
  }
}
