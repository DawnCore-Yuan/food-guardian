import { BALANCE } from '../data/balance';
import type { RunSnapshot } from '../types';

/**
 * RunState：hp / score / elapsedMs / 統計 的唯一權威（規格 §11）。
 * 其他模組只能透過這些方法修改。
 */
export class RunState {
  readonly seed: number;
  hp: number = BALANCE.player.hp;
  score = 0;
  elapsedMs = 0;
  kills = 0;
  escapes = 0;
  phase: 'playing' | 'finishing' | 'won' | 'lost' = 'playing';

  constructor(seed = 1) {
    this.seed = seed;
  }

  tick(dtMs: number): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.elapsedMs += dtMs;
  }

  damage(amount = 1): boolean {
    if (this.phase !== 'playing' && this.phase !== 'finishing') return false;
    if (this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    return true;
  }

  addKill(points: number): void {
    this.kills += 1;
    this.score += points;
  }

  addEscape(): void {
    this.escapes += 1;
  }

  snapshot(): Readonly<RunSnapshot> {
    return {
      hp: this.hp,
      maxHp: BALANCE.player.hp,
      score: this.score,
      elapsedMs: this.elapsedMs,
      kills: this.kills,
      escapes: this.escapes,
      phase: this.phase,
    };
  }
}
