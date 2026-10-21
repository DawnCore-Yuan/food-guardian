/**
 * 預警名額：同屏最多 3 個預警。
 * 超出時延後整個行為（不省略預警、不累積爆發），取得名額後再完整 0.6s 預警。
 */
const MAX_CONCURRENT_WARNS = 3;

export type WarnState = 'idle' | 'waiting-quota' | 'warning' | 'done';

export class WarnQuota {
  private active = 0;
  private readonly max: number;

  constructor(max = MAX_CONCURRENT_WARNS) {
    this.max = max;
  }

  get inUse(): number { return this.active; }
  get capacity(): number { return this.max; }

  /** 嘗試取得名額；成功才進入完整預警 */
  tryAcquire(): boolean {
    if (this.active >= this.max) return false;
    this.active += 1;
    return true;
  }

  release(): void {
    if (this.active > 0) this.active -= 1;
  }

  reset(): void {
    this.active = 0;
  }
}
