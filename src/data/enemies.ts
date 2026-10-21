import type { HazardKindId } from './hazard-kinds';

export type EnemyBehavior =
  | 'wave-accel'      // aflatoxin：波浪＋預警後短時加速
  | 'slow-shooter'    // sulfur_dioxide_excess：慢速＋預警後直線彈
  | 'straight-tank'   // salmonella：直線推進、高耐久
  | 'lane-shift';     // s_aureus：預警後階梯換線

export interface EnemyDefinition {
  enemyId: string;
  kindId: HazardKindId;
  tier: 'normal' | 'elite';
  displayName: string;
  behavior: EnemyBehavior;
  hp: number;
  score: number;
  spawnX: number;
  exitX: number;
  /** 基礎水平速度（px/s），換線或加速期間由行為覆寫 */
  speed: number;
  size: { w: number; h: number };
  /** 碰撞體：與視覺尺寸分開，scale 固定 1 */
  body: { w: number; h: number };
  /** 預警時長；無攻擊行為為 0 */
  warnMs: number;
  /** 攻擊冷卻（ms）；0 表示不重複 */
  cooldownMs: number;
  /** 額外行為參數 */
  params?: {
    waveAmplitude?: number;
    wavePeriodMs?: number;
    accelSpeed?: number;
    accelMs?: number;
    projectileSpeed?: number;
    laneSegments?: number;
    laneStepPx?: number;
    lanePauseMs?: number;
  };
}

export const ENEMIES: Record<string, EnemyDefinition> = {
  'aflatoxin-normal': {
    enemyId: 'aflatoxin-normal',
    kindId: 'aflatoxin',
    tier: 'normal',
    displayName: '黃麴毒素',
    behavior: 'wave-accel',
    hp: 3,
    score: 150,
    spawnX: 1300,
    exitX: 60,
    speed: 110,
    size: { w: 72, h: 72 },
    body: { w: 56, h: 56 },
    warnMs: 600,
    cooldownMs: 3500,
    params: { waveAmplitude: 40, wavePeriodMs: 2200, accelSpeed: 220, accelMs: 1200 },
  },
  'sulfur_dioxide_excess-normal': {
    enemyId: 'sulfur_dioxide_excess-normal',
    kindId: 'sulfur_dioxide_excess',
    tier: 'normal',
    displayName: '二氧化硫超標',
    behavior: 'slow-shooter',
    hp: 4,
    score: 180,
    spawnX: 1300,
    exitX: 60,
    speed: 55,
    size: { w: 88, h: 64 },
    body: { w: 68, h: 50 },
    warnMs: 600,
    cooldownMs: 3000,
    params: { projectileSpeed: 260 },
  },
  'salmonella-normal': {
    enemyId: 'salmonella-normal',
    kindId: 'salmonella',
    tier: 'normal',
    displayName: '沙門氏菌',
    behavior: 'straight-tank',
    hp: 5,
    score: 200,
    spawnX: 1300,
    exitX: 60,
    speed: 130,
    size: { w: 96, h: 48 },
    body: { w: 78, h: 38 },
    warnMs: 0,
    cooldownMs: 0,
  },
  's_aureus-normal': {
    enemyId: 's_aureus-normal',
    kindId: 's_aureus',
    tier: 'normal',
    displayName: '金黃色葡萄球菌',
    behavior: 'lane-shift',
    hp: 3,
    score: 150,
    spawnX: 1300,
    exitX: 60,
    speed: 95,
    size: { w: 80, h: 80 },
    body: { w: 64, h: 64 },
    warnMs: 600,
    cooldownMs: 3000,
    params: { laneSegments: 3, laneStepPx: 100, lanePauseMs: 400 },
  },
};

export const ENEMY_IDS = Object.keys(ENEMIES);
