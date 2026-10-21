export type HazardKind = 'biological' | 'chemical' | 'physical';

export interface InputState {
  moveX: number;
  moveY: number;
  firing: boolean;
  pauseRequested: boolean;
}

export interface SpawnBatch {
  enemyId: string;
  count: number;
  y: number[];
  gapMs: number;
}

export interface WaveGroup {
  atMs: number;
  batches: SpawnBatch[];
  gapBetweenBatchesMs: number;
}

export interface RunSnapshot {
  hp: number;
  maxHp: number;
  score: number;
  elapsedMs: number;
  kills: number;
  escapes: number;
  phase: 'playing' | 'finishing' | 'won' | 'lost';
}

export interface RunResult {
  outcome: 'won' | 'lost';
  score: number;
  breakdown: { kills: number; hpBonus: number };
  elapsedMs: number;
  kills: number;
  escapes: number;
  isNewHighScore: boolean;
}
