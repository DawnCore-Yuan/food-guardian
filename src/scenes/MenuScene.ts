import Phaser from 'phaser';
import { loadSettings } from '../systems/storage';
import { audio } from '../systems/audio';
import { leaderboard } from '../leaderboard/hub';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#eaf4fb');

    // 標誌：使用高解析原稿（2097×750，含透明背景）。
    // 等比縮放至可讀寬度；手機（canvas 較窄）會依空間再縮。
    // 標誌本身是透明 PNG，直接疊在淺色背景上即可，不另加底板。
    // 中臺科技大學校名（AI 重製版）：置於主 LOGO 正上方，寬度約主 LOGO 的 55–65%
    // 先量主 LOGO 實際顯示寬度，再縮校名並等比保持長寬比；不加底板、陰影或外光暈
    if (this.textures.exists('art-logo-ctust')) {
      const ct = this.textures.get('art-logo-ctust').getSourceImage() as HTMLImageElement;
      const mainTex = this.textures.get('art-logo').getSourceImage() as HTMLImageElement;
      const mainMaxW = Math.min(width * 0.62, 620);
      const mainRatioW = Math.min(mainMaxW / mainTex.width, (height * 0.26) / mainTex.height);
      const mainW = mainTex.width * mainRatioW;
      const mainH = mainTex.height * mainRatioW;
      const targetW = Math.min(mainW * 0.60, width * 0.56);
      const ctScale = targetW / ct.width;
      const ctH = ct.height * ctScale;
      const gap = Math.max(6, Math.round(height * 0.012));
      const mainTop = height * 0.24 - mainH / 2;
      const ctY = mainTop - gap - ctH / 2;
      // 垂直空間不足時縮小校名，優先保住與主標題的間距
      const topSafe = Math.max(8, height * 0.02);
      let s2 = ctScale;
      if (ctY - ctH / 2 < topSafe) {
        const availH = (mainTop - gap - topSafe);
        s2 = Math.min(ctScale, availH / ct.height);
      }
      this.add.image(width / 2, mainTop - gap - (ct.height * s2) / 2, 'art-logo-ctust')
        .setScale(s2).setOrigin(0.5);
    }

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

    // 排行榜入口：與開始遊戲同寬度語彙、深藍底，維持首頁只剩一個主 CTA（綠色）
    const lbLabel = this.add.text(width / 2, height * 0.705, '排行榜', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '30px', color: '#ffffff',
      backgroundColor: '#24425c', padding: { x: 36, y: 14 },
    }).setOrigin(0.5).setName('menu-leaderboard');
    // 新增按鈕同樣維持 ≥48 CSS px 命中高度
    const lbBox = lbLabel.getBounds();
    const lbHitH = Math.max(lbBox.height, Math.ceil(48 / Math.max(0.01, cssScaleGuarded(this))));
    const lbHit = this.add.zone(lbLabel.x, lbLabel.y, lbBox.width + 24, lbHitH)
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).setName('menu-leaderboard-hit');
    lbHit.on('pointerup', () => this.openLeaderboard());

    // 依輸入能力顯示：觸控尚未實作，明確標示
    const touch = typeof window !== 'undefined' && 'ontouchstart' in window;
    this.add.text(width / 2, height * 0.805, touch ? '手機請橫向遊玩：左側移動、右側按住射擊' : '鍵盤：WASD／方向鍵移動　Space／J 射擊', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '22px', color: '#5a8aa8',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.885, 'Esc／P 暫停　·　點右上角可暫停', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '18px', color: '#7c9cb3',
    }).setOrigin(0.5);

    // 音效開關（首頁）：與「開始遊戲」同字級（40px），白色粗體置中
    // 命中區需求 ≥48 CSS px：以 canvas 實際顯示比例回推邏輯尺寸
    const cssScale = (this.game.canvas.getBoundingClientRect().width / this.scale.width) || 1;
    const hitH = Math.min(150, Math.max(80, Math.ceil(48 / Math.max(0.01, cssScale)) + 10));
    const boxW = Math.round(hitH * 2.4);

    const sndPlate = this.add.graphics().setName('menu-snd');
    const sndLabel = this.add.text(0, 0, '音效 開', {
      fontFamily: '"Noto Sans TC", sans-serif', fontStyle: 'bold',
      fontSize: '40px', color: '#ffffff',
    }).setOrigin(0.5).setName('menu-snd-label');

    const paintSnd = (): void => {
      const on = audio.isEnabled();
      sndLabel.setText(on ? '音效 開' : '音效 關');
      sndPlate.clear();
      const hw = boxW / 2, hh = hitH / 2;
      sndPlate.fillStyle(0x16334a, on ? 0.92 : 0.6).fillRoundedRect(-hw, -hh, boxW, hitH, hitH / 2);
      sndPlate.lineStyle(2, 0x7fdffc, on ? 0.9 : 0.4).strokeRoundedRect(-hw, -hh, boxW, hitH, hitH / 2);
      if (!on) {
        sndPlate.lineStyle(3, 0xd9534f, 1).beginPath();
        sndPlate.moveTo(-hw * 0.62, -hh * 0.6);
        sndPlate.lineTo(hw * 0.62, hh * 0.6);
        sndPlate.strokePath();
      }
    };

    const boxX = width - boxW / 2 - 20;
    const boxY = height - hitH / 2 - 40;
    this.add.container(boxX, boxY, [sndPlate, sndLabel]).setName('menu-snd-box');

    // 初始化即完整繪製一次（只讀目前偏好，不切換）
    paintSnd();

    // 命中區（與可見底板同尺寸，手機 ≥48 CSS px）
    const hitBox = this.add.zone(boxX, boxY, boxW, hitH).setOrigin(0.5).setInteractive({ useHandCursor: true });
    hitBox.on('pointerup', () => {
      void audio.unlock();
      audio.setEnabled(!audio.isEnabled());
      audio.play('ui');
      paintSnd();
    });


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

  private openLeaderboard(): void {
    audio.play('ui');
    try {
      leaderboard().openBoard(() => {
        // 關閉後焦點交還畫布，鍵盤 Enter 才能繼續開始遊戲
        this.game.canvas.focus?.();
      });
    } catch {
      // 排行榜 UI 失敗不得阻擋首頁
    }
  }

  private startGame(): void {
    // 順序很重要：解鎖 → 等 resume 真正完成 → 才切換場景並播第一個音。
    // 若先切換場景，GameScene.create 會再次呼叫 setSuspended(false)／stopAll，
    // 可能把剛恢復的 Context 或剛開始的聲音打斷。
    audio.unlock();
    // 新的一局：換發新的單局識別（失敗不阻擋遊戲）
    try { leaderboard().newRun(); } catch { /* 排行榜故障不影響遊戲 */ }
    audio.whenReady().then(() => {
      audio.setSuspended(false);
      audio.play('ui');
      this.scene.start('Game');
    });
  }
}

/** 由 canvas 實際顯示寬度回推 CSS／邏輯像素比例（命中區尺寸計算用） */
function cssScaleGuarded(scene: Phaser.Scene): number {
  const rect = scene.game.canvas.getBoundingClientRect();
  const s = rect.width / scene.scale.width;
  return Number.isFinite(s) && s > 0 ? s : 1;
}
