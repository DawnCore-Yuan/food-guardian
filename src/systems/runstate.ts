import { BALANCE } from '../data/balance';
import type { RunSnapshot } from '../types';

/**
 * RunState：hp / score / elapsedMs / 統計 的唯一權威（規格 §11）。
 * 其他模組只能透過這些方法修改。
 *
 * v2 結算順序（單一權威，避免勝敗依呼叫順序改變）：
 *   update 每幀只累加時間與血量；結算由 resolveTimeout() 在「同一處」判定：
 *     1) hp <= 0 且 elapsedMs >= duration  → 依「死亡優先」判 lost
 *     2) hp <= 0                            → lost
 *     3) elapsedMs >= duration              → won（整局嚴格 3 分鐘，立即結算）
 * 死亡由 damage() 記錄死亡時間（diedAtMs），不直接決定勝負。
 */
export class RunState {
  readonly seed: number;
  hp: number = BALANCE.player.hp;
  /** 擊破得分（不含通關生命獎勵） */
  score = 0;
  elapsedMs = 0;
  kills = 0;
  escapes = 0;
  /** 陣亡時的遊戲時間（ms）；null 表示仍存活 */
  diedAtMs: number | null = null;
  phase: 'playing' | 'won' | 'lost' = 'playing';

  constructor(seed = 1) {
    this.seed = seed;
  }

  /** 只在 playing 累加；達到 durationMs 就停在 durationMs（不產生 03:01） */
  tick(dtMs: number, durationMs = Number.POSITIVE_INFINITY): void {
    if (this.phase !== 'playing') return;
    this.elapsedMs = Math.min(durationMs, this.elapsedMs + Math.max(0, dtMs));
  }

  damage(amount = 1): boolean {
    if (this.phase !== 'playing') return false;
    if (this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0 && this.diedAtMs === null) this.diedAtMs = this.elapsedMs;
    return true;
  }

  addKill(points: number): void {
    if (this.phase !== 'playing') return;
    this.kills += 1;
    this.score += points;
  }

  addEscape(): void {
    if (this.phase !== 'playing') return;
    this.escapes += 1;
  }

  /**
   * 唯一結算判定點。回傳 null 表示繼續遊戲。
   * 同一幀內「血量歸零」與「時間到」同時成立時，一律視為失敗（死亡優先）。
   */
  resolveTimeout(durationMs: number): 'won' | 'lost' | null {
    if (this.phase !== 'playing') return null;
    const dead = this.hp <= 0 || this.diedAtMs !== null;
    const timeUp = this.elapsedMs >= durationMs;
    if (dead) { this.phase = 'lost'; return 'lost'; }
    if (timeUp) { this.phase = 'won'; return 'won'; }
    return null;
  }

  /** 通關生命獎勵：只在通關時計入，使用結算當下的血量 */
  hpBonus(outcome: 'won' | 'lost'): number {
    return outcome === 'won' ? this.hp * BALANCE.score.hpBonusPerLife : 0;
  }

  /** 最終分數（擊破分 + 通關生命獎勵） */
  finalScore(outcome: 'won' | 'lost'): number {
    return this.score + this.hpBonus(outcome);
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
