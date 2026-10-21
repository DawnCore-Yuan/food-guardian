import Phaser from 'phaser';
import { loadSettings } from '../systems/storage';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#eaf4fb');

    this.add.text(width / 2, height * 0.26, '食安防衛隊', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '72px', color: '#1b4965',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.36, '3 分鐘認識三類食安危害', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '28px', color: '#5a8aa8',
    }).setOrigin(0.5);

    const best = loadSettings().highScore;
    this.add.text(width / 2, height * 0.44, `最高分：${best}`, {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '24px', color: '#5a8aa8',
    }).setOrigin(0.5);

    const start = this.add.text(width / 2, height * 0.62, '開始遊戲', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '40px', color: '#ffffff',
      backgroundColor: '#2a9d8f', padding: { x: 48, y: 18 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    start.on('pointerup', () => this.startGame());
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());

    this.add.text(width / 2, height * 0.9, '鍵盤：WASD／方向鍵移動，Space／J 射擊，Esc／P 暫停', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '20px', color: '#7c9cb3',
    }).setOrigin(0.5);
  }

  private startGame(): void {
    this.scene.start('Game');
  }
}
