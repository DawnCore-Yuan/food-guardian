import Phaser from 'phaser';

/**
 * 原創佔位材質：以 Graphics 產生的純色圓角矩形，scale 保持 1，
 * 讓 body.setSize 的世界尺寸等於規格值（規格 §7.8）。
 */
export const TEX = {
  player: 'tex-player',
  germ: 'tex-germ',
  cloud: 'tex-cloud',
  shard: 'tex-shard',
  playerBullet: 'tex-pbullet',
  enemyBullet: 'tex-ebullet',
} as const;

export interface PlaceholderSpec {
  key: string;
  w: number;
  h: number;
  color: number;
  shape: 'rect' | 'round' | 'cloud' | 'shard';
}

export const PLACEHOLDERS: PlaceholderSpec[] = [
  { key: TEX.player, w: 64, h: 40, color: 0x2a9d8f, shape: 'round' },
  { key: TEX.germ, w: 64, h: 64, color: 0x8fd694, shape: 'round' },
  { key: TEX.cloud, w: 96, h: 64, color: 0xb7a6e8, shape: 'cloud' },
  { key: TEX.shard, w: 56, h: 56, color: 0xf2a65a, shape: 'shard' },
  { key: TEX.playerBullet, w: 20, h: 8, color: 0xffd166, shape: 'rect' },
  { key: TEX.enemyBullet, w: 12, h: 12, color: 0xe76f51, shape: 'round' },
];

export function buildPlaceholders(scene: Phaser.Scene): void {
  for (const p of PLACEHOLDERS) {
    if (scene.textures.exists(p.key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(p.color, 1);
    if (p.shape === 'round') {
      g.fillRoundedRect(0, 0, p.w, p.h, Math.min(p.w, p.h) * 0.28);
    } else if (p.shape === 'shard') {
      g.fillTriangle(p.w / 2, 0, p.w, p.h, 0, p.h);
    } else if (p.shape === 'cloud') {
      g.fillRoundedRect(0, p.h * 0.2, p.w, p.h * 0.8, p.h * 0.4);
      g.fillCircle(p.w * 0.3, p.h * 0.35, p.h * 0.32);
      g.fillCircle(p.w * 0.62, p.h * 0.28, p.h * 0.3);
    } else {
      g.fillRect(0, 0, p.w, p.h);
    }
    g.generateTexture(p.key, p.w, p.h);
    g.destroy();
  }
}
