/**
 * 預警名額：同屏最多 3 個預警。
 * 超出時延後整個行為（不省略預警、不累積爆發），取得名額後再完整 0.6s 預警。
 * 每個名額必須有明確持有者，且釋放路徑只有：行為完成、敵人死亡、敵人逃脫、場景清理。
 */
const MAX_CONCURRENT_WARNS = 3;

export interface WarnRecord {
  t: number;
  action: 'acquire' | 'release' | 'deny' | 'release-orphan';
  owner: string;
  inUse: number;
}

export class WarnQuota {
  private holders = new Map<string, number>();
  private readonly max: number;
  private log: WarnRecord[] = [];
  private readonly tracing: boolean;

  constructor(max = MAX_CONCURRENT_WARNS, tracing = false) {
    this.max = max;
    this.tracing = tracing;
  }

  get inUse(): number { return this.holders.size; }
  get capacity(): number { return this.max; }
  holdersList(): string[] { return [...this.holders.keys()]; }
  drainLog(): WarnRecord[] { const l = this.log; this.log = []; return l; }

  private record(action: WarnRecord['action'], owner: string): void {
    if (!this.tracing) return;
    if (this.log.length > 2000) return;
    this.log.push({ t: Date.now(), action, owner, inUse: this.holders.size });
  }

  tryAcquire(owner: string): boolean {
    if (this.holders.has(owner)) return true;
    if (this.holders.size >= this.max) { this.record('deny', owner); return false; }
    this.holders.set(owner, Date.now());
    this.record('acquire', owner);
    return true;
  }

  release(owner: string): void {
    if (this.holders.delete(owner)) this.record('release', owner);
    else this.record('release-orphan', owner);
  }

  reset(): void {
    for (const owner of [...this.holders.keys()]) this.record('release', owner);
    this.holders.clear();
    this.log = [];
  }
}
