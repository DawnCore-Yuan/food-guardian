import Phaser from 'phaser';
import { HAZARD_KINDS, type HazardKindId } from './hazard-kinds';

/**
 * 原創佔位材質（C 階段）：以 Graphics 產生的可辨識幾何圖形，scale 固定 1，
 * 讓 body.setSize 的世界尺寸等於規格值。
 * 造型依 docs/PHASE1-v1.2-FOUR-ENEMIES.md §10 的概念圖方向，但不使用概念圖本身。
 */
export const TEX = {
  player: 'tex-player',
  playerBullet: 'tex-pbullet',
  enemyBullet: 'tex-ebullet',
  warnSign: 'tex-warn',
} as const;

export function texFor(kindId: HazardKindId): string {
  return 'tex-' + kindId;
}

/** 尺寸取自敵人配置（視覺尺寸），由呼叫端傳入 */
export interface KindVisual {
  kindId: HazardKindId;
  w: number;
  h: number;
}

export function buildPlaceholders(scene: Phaser.Scene, kinds: KindVisual[]): void {
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };

  // 玩家：巡檢飛行載具（圓角矩形＋機身條紋＋機首）
  make(TEX.player, 64, 40, (g) => {
    g.fillStyle(0xe8f5f2, 1).fillRoundedRect(0, 4, 56, 32, 10);
    g.fillStyle(0x3fb8b0, 1).fillRoundedRect(8, 12, 30, 14, 6);
    g.fillStyle(0x2a9d8f, 1).fillTriangle(50, 4, 64, 20, 50, 36);
  });

  make(TEX.playerBullet, 20, 8, (g) => {
    g.fillStyle(0x7fe3d4, 1).fillRoundedRect(0, 0, 20, 8, 4);
    g.fillStyle(0xffffff, 0.85).fillRoundedRect(12, 2, 8, 4, 2);
  });

  make(TEX.enemyBullet, 12, 12, (g) => {
    g.fillStyle(0xc9b8ea, 1).fillCircle(6, 6, 6);
    g.fillStyle(0x8b6fc4, 1).fillCircle(6, 6, 3);
  });

  // 預警：可獨立顯示的警告三角（非角色素材）
  make(TEX.warnSign, 28, 26, (g) => {
    g.fillStyle(0xf4a340, 1).fillTriangle(14, 0, 28, 26, 0, 26);
    g.fillStyle(0xffffff, 1).fillRect(12, 8, 4, 10);
    g.fillStyle(0xffffff, 1).fillRect(12, 20, 4, 4);
  });

  for (const k of kinds) {
    const pal = HAZARD_KINDS[k.kindId].palette;
    make(texFor(k.kindId), k.w, k.h, (g) => {
      switch (k.kindId) {
        case 'aflatoxin': {
          // 晶核＋不規則霧環（不是孢子）
          g.fillStyle(pal.accent, 0.5).fillCircle(k.w / 2, k.h / 2, k.w * 0.48);
          g.fillStyle(pal.base, 0.85).fillCircle(k.w / 2, k.h / 2, k.w * 0.34);
          g.fillStyle(0xffffff, 0.9).fillCircle(k.w * 0.42, k.h * 0.42, k.w * 0.12);
          g.fillStyle(pal.accent, 1).fillCircle(k.w * 0.62, k.h * 0.6, k.w * 0.1);
          break;
        }
        case 'sulfur_dioxide_excess': {
          // 雲團＋結晶塊（稜角只是造型）
          g.fillStyle(pal.base, 0.9).fillRoundedRect(0, k.h * 0.3, k.w, k.h * 0.6, k.h * 0.3);
          g.fillStyle(pal.base, 1).fillCircle(k.w * 0.3, k.h * 0.35, k.h * 0.3);
          g.fillStyle(pal.base, 1).fillCircle(k.w * 0.68, k.h * 0.32, k.h * 0.28);
          g.fillStyle(pal.accent, 1).fillTriangle(k.w * 0.8, k.h * 0.2, k.w * 0.95, k.h * 0.6, k.w * 0.65, k.h * 0.6);
          break;
        }
        case 'salmonella': {
          // 長桿＋鞭毛
          g.fillStyle(pal.base, 1).fillRoundedRect(0, k.h * 0.25, k.w * 0.7, k.h * 0.5, k.h * 0.25);
          g.fillStyle(pal.accent, 1);
          for (let i = 0; i < 3; i++) {
            g.fillRect(k.w * 0.7, k.h * (0.3 + i * 0.15), k.w * 0.25, k.h * 0.06);
          }
          break;
        }
        case 's_aureus': {
          // 葡萄串狀球群
          g.fillStyle(pal.base, 1);
          g.fillCircle(k.w * 0.35, k.h * 0.35, k.w * 0.2);
          g.fillCircle(k.w * 0.66, k.h * 0.32, k.w * 0.19);
          g.fillCircle(k.w * 0.5, k.h * 0.62, k.w * 0.21);
          g.fillCircle(k.w * 0.22, k.h * 0.6, k.w * 0.16);
          g.fillStyle(pal.accent, 1);
          g.fillCircle(k.w * 0.35, k.h * 0.3, k.w * 0.07);
          break;
        }
      }
    });
  }
}
