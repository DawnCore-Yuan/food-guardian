import Phaser from 'phaser';
import { loadSettings } from '../systems/storage';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#eaf4fb');

    // 標誌：使用高解析原稿（2097×750，含透明背景）。
    // 等比縮放至可讀寬度；手機（canvas 較窄）會依空間再縮。
    // 標誌本身是透明 PNG，直接疊在淺色背景上即可，不另加底板。
    if (this.textures.exists('art-logo')) {
      const tex = this.textures.get('art-logo').getSourceImage() as HTMLImageElement;
      const maxW = Math.min(width * 0.62, 620);
      const ratio = Math.min(maxW / tex.width, (height * 0.26) / tex.height);
      this.add.image(width / 2, height * 0.24, 'art-logo')
        .setScale(ratio)
        .setOrigin(0.5);
    } else {
      this.add.text(width / 2, height * 0.22, '食安防衛隊', {
        fontFamily: '"Noto Sans TC", sans-serif', fontSize: '72px', color: '#1b4965',
      }).setOrigin(0.5);
    }

    // B 階段測試版標示：避免與正式三段關卡文案混淆
    this.add.text(width / 2, height * 0.32, 'C 階段｜180 秒｜四種敵人', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '26px', color: '#e76f51',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.39, '黃麴毒素・二氧化硫超標・沙門氏菌・金黃色葡萄球菌', {
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
    this.add.text(width / 2, height * 0.78, touch ? '手機請橫向遊玩：左側移動、右側按住射擊' : '鍵盤：WASD／方向鍵移動　Space／J 射擊', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '22px', color: '#5a8aa8',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.90, 'Esc／P 暫停　·　點右上角可暫停', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '18px', color: '#7c9cb3',
    }).setOrigin(0.5);
  }

  private startGame(): void {
    this.scene.start('Game');
  }
}
