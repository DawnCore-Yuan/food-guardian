import type { HazardKind } from '../types';

export interface EnemyDefinition {
  id: 'germ' | 'cloud' | 'shard';
  displayName: string;
  knowledgeName: string;
  hazard: HazardKind;
  hp: number;
  score: number;
  spawnX: number;
  exitX: number;
  speed: number;
  size: { w: number; h: number };
  body: { w: number; h: number };
  tint: number;
  attack: null | { type: 'projectile' | 'dash'; warnMs: number };
  hover?: { atX: number; durationMs: number; amplitude: number; periodMs: number };
  dash?: { speed: number };
}

/** B 階段只實作 germ；cloud / shard 留給 C 階段（資料已定，程式未接）。 */
export const ENEMIES: Record<string, EnemyDefinition> = {
  germ: {
    id: 'germ',
    displayName: '菌團怪',
    knowledgeName: '微生物污染風險',
    hazard: 'biological',
    hp: 2,
    score: 100,
    spawnX: 1280,
    exitX: 60,
    speed: 90,
    size: { w: 64, h: 64 },
    body: { w: 52, h: 52 },
    tint: 0x8fd694,
    attack: null,
  },
  cloud: {
    id: 'cloud',
    displayName: '污染雲怪',
    knowledgeName: '化學物質殘留風險',
    hazard: 'chemical',
    hp: 3,
    score: 150,
    spawnX: 1280,
    exitX: 60,
    speed: 60,
    size: { w: 96, h: 64 },
    body: { w: 76, h: 52 },
    tint: 0xb7a6e8,
    attack: { type: 'projectile', warnMs: 600 },
    hover: { atX: 900, durationMs: 2000, amplitude: 24, periodMs: 2400 },
  },
  shard: {
    id: 'shard',
    displayName: '異物尖兵',
    knowledgeName: '異物污染風險',
    hazard: 'physical',
    hp: 1,
    score: 120,
    spawnX: 1380,
    exitX: 60,
    speed: 150,
    size: { w: 56, h: 56 },
    body: { w: 44, h: 44 },
    tint: 0xf2a65a,
    attack: { type: 'dash', warnMs: 600 },
    dash: { speed: 420 },
  },
};
