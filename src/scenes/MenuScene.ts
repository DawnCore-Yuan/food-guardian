import Phaser from 'phaser';
import { loadSettings } from '../systems/storage';
import { audio } from '../systems/audio';

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

    // 音效開關（首頁）：符合深藍／青綠風格的小膠囊鈕
    const paintSnd = (): void => {
      const on = audio.isEnabled();
      sndLabel.setText(on ? '音效 開' : '音效 關');
      sndPlate.clear();
      sndPlate.fillStyle(0x16334a, on ? 0.92 : 0.6).fillRoundedRect(-66, -20, 132, 40, 20);
      sndPlate.lineStyle(2, 0x7fdffc, on ? 0.9 : 0.4).strokeRoundedRect(-66, -20, 132, 40, 20);
      if (!on) { sndPlate.lineStyle(3, 0xd9534f, 1).beginPath(); sndPlate.moveTo(-40, -12); sndPlate.lineTo(40, 12); sndPlate.strokePath(); }
    };
    const sndPlate = this.add.graphics().setName('menu-snd');
    const sndLabel = this.add.text(0, 0, '', {
      fontFamily: '"Noto Sans TC", sans-serif', fontStyle: 'bold',
      fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.container(width - 90, height - 100, [sndPlate, sndLabel]).setName('menu-snd-box');
    // 命中區至少 48 CSS px：以 canvas 邏輯座標換算實際 CSS 比例
    const hitBox = this.add.zone(width - 90, height - 100, 132, 56).setOrigin(0.5).setInteractive({ useHandCursor: true });
    hitBox.on('pointerup', () => {
      void audio.unlock();
      const on = !audio.isEnabled();
      audio.setEnabled(on);
      audio.play('ui');
      paintSnd();
    });
    paintSnd();

    // 版本說明：頁尾小字（原位置已移除，不重複顯示）
    // 以「底部安全邊距 + 自身高度」定位，而非固定百分比，避免手機橫向被裁切或與上一行重疊
    const footerSize = height < 480 ? 15 : 16;
    const footer = this.add.text(width / 2, 0, 'C 階段｜180 秒｜四種敵人', {
      fontFamily: '"Noto Sans TC", sans-serif',
      fontSize: `${footerSize}px`,
      color: '#8aa9bd',
    }).setOrigin(0.5, 1);
    const bottomSafe = Math.max(12, Math.round(height * 0.035));
    footer.setY(height - bottomSafe);
  }

  private startGame(): void {
    // 必須在實際點擊中解鎖 AudioContext（iPhone Safari）
    void audio.unlock();
    audio.setSuspended(false);
    audio.play('ui');
    this.scene.start('Game');
  }
}
