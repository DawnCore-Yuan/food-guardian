/** 初始調校值（規格 §7.8）；此檔為唯一數值來源。 */
export const BALANCE = {
  player: {
    speed: 300,
    bodyW: 48,
    bodyH: 28,
    hp: 5,
    invulnMs: 1200,
    fireCooldownMs: 180,
    bulletSpeed: 700,
    bulletW: 40,
    bulletH: 16,
  },
  /** 角色視覺顯示尺寸（只影響外觀；碰撞體仍為 bodyW/bodyH 等原值） */
  visual: {
    playerW: 128, playerH: 80,
    aflatoxinW: 144, aflatoxinH: 144,
    sulfurW: 176, sulfurH: 128,
    salmonellaW: 192, salmonellaH: 96,
    sAureusW: 160, sAureusH: 160,
  },
  /** 敵彈視覺與碰撞體尺寸（同步放大） */
  enemyBullet: { w: 24, h: 24 },
  caps: {
    enemies: 16,
    playerBullets: 32,
    enemyBullets: 16,
  },
  score: {
    hpBonusPerLife: 200,
  },
  playfield: { left: 60, right: 1220, top: 90, bottom: 630 },
} as const;

export const GAME_STATE_KEYS = [
  'BOOT', 'LOADING', 'MENU', 'TUTORIAL', 'PLAYING', 'PAUSED', 'WON', 'LOST', 'LOAD_ERROR',
] as const;

export type GameStateKey = (typeof GAME_STATE_KEYS)[number];
