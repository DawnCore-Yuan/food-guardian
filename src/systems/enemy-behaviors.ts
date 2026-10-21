import type Phaser from 'phaser';
import type { EnemyDefinition } from '../data/enemies';
import type { WarnQuota } from './warn-quota';

export interface EnemyBody extends Phaser.Physics.Arcade.Sprite {
  uid: string;
  def: EnemyDefinition;
  hp: number;
  settled: boolean;
  enteredAt: number;
  // 行為狀態
  phase: 'enter' | 'cruise' | 'waiting' | 'warning' | 'acting' | 'dead';
  phaseT: number;         // 目前階段已持續 ms
  cooldownMs: number;     // 距離下次可攻擊
  baseY: number;          // 波浪基準線
  elapsedMs: number;      // 進場後累計
  laneDone: number;       // 已完成的換線段數
  hasWarnSign: boolean;
  warnStartMs: number;   // 預警開始的遊戲時間
  actStartMs: number;    // 行為開始的遊戲時間
}

export interface BehaviorHost {
  spawnEnemyProjectile(x: number, y: number, speed: number): void;
  setWarnSign(enemy: EnemyBody, visible: boolean): void;
}

/** 每幀更新單一敵人；dt 為有效遊戲時間（ms，已含 50ms 上限） */
export function updateEnemy(
  e: EnemyBody,
  dt: number,
  quota: WarnQuota,
  host: BehaviorHost,
): void {
  e.elapsedMs += dt;
  e.phaseT += dt;
  if (e.cooldownMs > 0) e.cooldownMs = Math.max(0, e.cooldownMs - dt);

  switch (e.def.behavior) {
    case 'wave-accel': return updateWaveAccel(e, dt, quota, host);
    case 'slow-shooter': return updateSlowShooter(e, dt, quota, host);
    case 'straight-tank': return updateStraightTank(e);
    case 'lane-shift': return updateLaneShift(e, dt, quota, host);
  }
}

/** aflatoxin：正弦波浪 + 預警後短時加速（水平速度提升，軌跡不變） */
function updateWaveAccel(e: EnemyBody, _dt: number, quota: WarnQuota, host: BehaviorHost): void {
  const p = e.def.params!;
  const period = p.wavePeriodMs ?? 2200;
  const amp = p.waveAmplitude ?? 40;

  if (e.phase === 'warning') {
    if (e.phaseT >= e.def.warnMs) {
      e.phase = 'acting';
      e.phaseT = 0;
      e.actStartMs = e.elapsedMs;
      host.setWarnSign(e, false);
      e.hasWarnSign = false;
    }
    return;
  }

  if (e.phase === 'acting') {
    e.setVelocityX(-(p.accelSpeed ?? 220));
    if (e.phaseT >= (p.accelMs ?? 1200)) {
      e.phase = 'cruise';
      e.phaseT = 0;
      e.cooldownMs = e.def.cooldownMs;
    }
    return;
  }

  // cruise / enter
  e.setVelocityX(-e.def.speed);
  const t = e.elapsedMs / period * Math.PI * 2;
  const y = e.baseY + Math.sin(t) * amp;
  e.body!.position.y = y - e.body!.halfHeight;
  e.y = y;

  if (e.phase === 'cruise' && e.cooldownMs <= 0) {
    if (quota.tryAcquire(e.uid)) {
      e.phase = 'warning';
      e.phaseT = 0;
      e.warnStartMs = e.elapsedMs;
      host.setWarnSign(e, true);
      e.hasWarnSign = true;
    } else {
      e.phase = 'waiting';
    }
  }
  if (e.phase === 'waiting') {
    // 延後特殊行為，但維持正常巡航（安全移動）
    e.setVelocityX(-e.def.speed);
    const tw = e.elapsedMs / period * Math.PI * 2;
    const yw = e.baseY + Math.sin(tw) * amp;
    e.body!.position.y = yw - e.body!.halfHeight;
    e.y = yw;
    if (quota.tryAcquire(e.uid)) {
      e.phase = 'warning';
      e.phaseT = 0;
      e.warnStartMs = e.elapsedMs;
      host.setWarnSign(e, true);
      e.hasWarnSign = true;
    }
  }
  if (e.phase === 'enter') e.phase = 'cruise';
}

/** sulfur_dioxide_excess：慢速直線 + 完整預警後發射 1 發直線彈 */
function updateSlowShooter(e: EnemyBody, _dt: number, quota: WarnQuota, host: BehaviorHost): void {
  e.setVelocityX(-e.def.speed);

  if (e.phase === 'warning') {
    if (e.phaseT >= e.def.warnMs) {
      e.actStartMs = e.elapsedMs;
      host.spawnEnemyProjectile(e.x - 30, e.y, e.def.params?.projectileSpeed ?? 260);
      host.setWarnSign(e, false);
      e.hasWarnSign = false;
      e.phase = 'cruise';
      e.phaseT = 0;
      e.cooldownMs = e.def.cooldownMs;
      quota.release(e.uid);
    }
    return;
  }

  if (e.phase === 'enter') e.phase = 'cruise';
  if (e.phase === 'cruise' && e.cooldownMs <= 0) {
    if (quota.tryAcquire(e.uid)) {
      e.phase = 'warning';
      e.phaseT = 0;
      e.warnStartMs = e.elapsedMs;
      host.setWarnSign(e, true);
      e.hasWarnSign = true;
    } else {
      e.phase = 'waiting';
    }
  }
  if (e.phase === 'waiting') {
    // 延後特殊行為，但維持慢速巡航（安全移動）
    e.setVelocityX(-e.def.speed);
    if (quota.tryAcquire(e.uid)) {
      e.phase = 'warning';
      e.phaseT = 0;
      e.warnStartMs = e.elapsedMs;
      host.setWarnSign(e, true);
      e.hasWarnSign = true;
    }
  }
}

/** salmonella：直線推進，無預警無攻擊，高耐久 */
function updateStraightTank(e: EnemyBody): void {
  e.setVelocityX(-e.def.speed);
}

/** s_aureus：預警後階梯換線（垂直移動、水平暫停），3 段後恢復直線 */
function updateLaneShift(e: EnemyBody, _dt: number, quota: WarnQuota, host: BehaviorHost): void {
  const p = e.def.params!;
  const segs = p.laneSegments ?? 3;
  const stepPx = p.laneStepPx ?? 100;
  const pauseMs = p.lanePauseMs ?? 400;

  if (e.laneDone >= segs) {
    // 換線結束：恢復向左推進（不再等 x<=1000）
    e.phase = 'cruise';
    e.phaseT = 0;
    e.setVelocity(0, 0);
    e.setVelocityX(-e.def.speed);
    return;
  }
  if (e.x > 1000) {
    e.setVelocityX(-e.def.speed);
    return;
  }

  if (e.phase === 'warning') {
    e.setVelocity(0, 0);
    if (e.phaseT >= e.def.warnMs) {
      e.phase = 'acting';
      e.phaseT = 0;
      e.actStartMs = e.elapsedMs;
      host.setWarnSign(e, false);
      e.hasWarnSign = false;
      // 交錯上下換線
      const dir = e.laneDone % 2 === 0 ? 1 : -1;
      const targetY = e.baseY + dir * stepPx;
      const half = e.def.body.h / 2;
      const clamped = Math.min(630 - half, Math.max(90 + half, targetY));
      const sign = Math.sign(clamped - e.y) || 1;
      e.setVelocity(0, sign * 150);
      e.baseY = clamped;
    }
    return;
  }

  if (e.phase === 'acting') {
    // 抵達目標高度後停止垂直移動，再停留 pauseMs
    const remaining = e.baseY - e.y;
    if (Math.abs(remaining) <= 6) {
      e.setVelocity(0, 0);
      e.y = e.baseY;
      e.body!.position.y = e.baseY - e.body!.halfHeight;
    } else {
      e.setVelocity(0, Math.sign(remaining) * 150);
    }
    if (e.phaseT >= (stepPx / 150) * 1000 + pauseMs) {
      e.phase = 'cruise';
      e.phaseT = 0;
      e.laneDone += 1;
      e.setVelocity(0, 0);
      quota.release(e.uid);
      e.cooldownMs = e.def.cooldownMs;
    }
    return;
  }

  // cruise：等待冷卻後取預警名額（保持水平巡航，不強制歸零）
  e.setVelocityX(-e.def.speed);
  e.setVelocityY(0);
  if (e.cooldownMs <= 0) {
    if (quota.tryAcquire(e.uid)) {
      e.phase = 'warning';
      e.phaseT = 0;
      e.warnStartMs = e.elapsedMs;
      host.setWarnSign(e, true);
      e.hasWarnSign = true;
    } else {
      e.phase = 'waiting';
    }
  }
  if (e.phase === 'waiting') {
    // 延後換線行為，維持水平巡航（不停死）
    e.setVelocityX(-e.def.speed);
    e.setVelocity(0, 0);
    e.setVelocityX(-e.def.speed);
    if (quota.tryAcquire(e.uid)) {
      e.phase = 'warning';
      e.phaseT = 0;
      e.warnStartMs = e.elapsedMs;
      host.setWarnSign(e, true);
      e.hasWarnSign = true;
    }
  }
}
