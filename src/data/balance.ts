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
    bulletW: 20,
    bulletH: 8,
  },
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
