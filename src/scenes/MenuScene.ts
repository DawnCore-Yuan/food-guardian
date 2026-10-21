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

    // ── 按鈕列：開始遊戲（主）＋ 排行榜（次），左右並排、等高、整組水平置中 ──
    // 位於最高分（0.46）下方、操作提示（0.805）上方；兩鈕間距 28 邏輯 px，命中區不重疊。
    const rowY = Math.round(height * 0.64);
    const gap = 28;
    const cssScale = (this.game.canvas.getBoundingClientRect().width / this.scale.width) || 1;

    const paintButton = (
      g: Phaser.GameObjects.Graphics,
      label: Phaser.GameObjects.Text,
      hue: number,
      w: number,
    ): void => {
      g.clear();
      g.fillStyle(hue, 1).fillRoundedRect(-w / 2, -rowHitH / 2, w, rowHitH, 10);
      label.setPosition(0, 0);
    };

    const startLabel = this.add.text(0, 0, '開始遊戲', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '40px', color: '#ffffff',
    }).setOrigin(0.5).setName('menu-start-label');
    const lbLabel = this.add.text(0, 0, '排行榜', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '40px', color: '#ffffff',
    }).setOrigin(0.5).setName('menu-leaderboard-label');

    const startW = Math.max(320, Math.ceil(startLabel.width + 96));
    const lbW = Math.max(220, Math.ceil(lbLabel.width + 88));

    // 可用寬度：兩鈕＋間距，且不超出畫布左右安全邊距（各 24）
    const safe = Math.max(0, width - 48);
    let scaleRow = 1;
    if (startW + gap + lbW > safe) scaleRow = safe / (startW + gap + lbW);
    const w1 = Math.floor(startW * scaleRow);
    const w2 = Math.floor(lbW * scaleRow);
    const g2 = Math.max(16, Math.round(gap * scaleRow));
    const totalW = w1 + g2 + w2;
    const leftX = (width - totalW) / 2;

    // 命中高度以「最終 CSS 尺寸」為準：FIT 模式下畫布等比縮放，
    // 整列縮放（scaleRow）不影響 canvas→CSS 的比例，但明確以 ratio 回推，
    // 避免只憑縮放前的邏輯高度或上限宣稱 48 CSS px。
    const fitRatio = Math.min(
      this.scale.displaySize.width / this.scale.width,
      this.scale.displaySize.height / this.scale.height,
    ) || cssScale;
    const minLogicalH = Math.ceil(48 / Math.max(0.01, fitRatio));
    // 桌面 96；窄畫面以 ≥48 CSS px 回推並留 8px 餘裕；上限 140（放得進版面時不壓縮可讀高度）
    const btnH = Math.min(140, Math.max(96, minLogicalH + 8));
    // 上下可用空間：按鈕列不得壓到最高分（0.46）或操作提示（0.805）
    const rowTopLimit = Math.round(height * 0.50);
    const rowBottomLimit = Math.round(height * 0.78);
    const maxBtnH = Math.max(56, rowBottomLimit - rowTopLimit);
    const rowHitH = Math.min(btnH, maxBtnH);

    const startG = this.add.graphics().setName('menu-start-plate');
    const lbG = this.add.graphics().setName('menu-leaderboard-plate');
    const startBtn = this.add.container(leftX + w1 / 2, rowY, [startG, startLabel]).setName('menu-start');
    const lbBtn = this.add.container(leftX + w1 + g2 + w2 / 2, rowY, [lbG, lbLabel]).setName('menu-leaderboard');

    paintButton(startG, startLabel, 0x2a9d8f, w1);
    paintButton(lbG, lbLabel, 0x24425c, w2);
    if (scaleRow < 1) {
      // 極窄畫面才縮字，仍保持可讀（最小 26px）
      const fs = Math.max(26, Math.round(40 * scaleRow));
      startLabel.setFontSize(fs);
      lbLabel.setFontSize(fs);
    }

    // 命中區與可見底板同尺寸，互不重疊
    const startHit = this.add.zone(startBtn.x, rowY, w1, rowHitH).setOrigin(0.5).setInteractive({ useHandCursor: true }).setName('menu-start-hit');
    const lbHit = this.add.zone(lbBtn.x, rowY, w2, rowHitH).setOrigin(0.5).setInteractive({ useHandCursor: true }).setName('menu-leaderboard-hit');
    startHit.on('pointerup', () => this.startGame());
    lbHit.on('pointerup', () => this.openLeaderboard());
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());

    // 依輸入能力顯示操作說明（觸控與鍵盤皆已實作）
    const touch = typeof window !== 'undefined' && 'ontouchstart' in window;
    this.add.text(width / 2, height * 0.805, touch ? '手機請橫向遊玩：左側移動、右側按住射擊' : '鍵盤：WASD／方向鍵移動　Space／J 射擊', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '22px', color: '#5a8aa8',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.885, 'Esc／P 暫停　·　點右上角可暫停', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '18px', color: '#7c9cb3',
    }).setOrigin(0.5);

    // 音效開關（首頁）：與「開始遊戲」同字級（40px），白色粗體置中
    // 命中區需求 ≥48 CSS px：以 canvas 實際顯示比例回推邏輯尺寸
    const sndCssScale = (this.game.canvas.getBoundingClientRect().width / this.scale.width) || 1;
    const hitH = Math.min(150, Math.max(80, Math.ceil(48 / Math.max(0.01, sndCssScale)) + 10));
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
    const footer = this.add.text(width / 2, 0, '正式關卡｜180 秒｜四種敵人', {
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

