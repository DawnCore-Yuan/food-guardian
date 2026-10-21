import Phaser from 'phaser';
import { BALANCE } from '../data/balance';
import { ENEMIES, type EnemyDefinition } from '../data/enemies';
import { HAZARD_KINDS } from '../data/hazard-kinds';
import { isReducedMotion } from '../systems/storage';
import { TouchController } from '../ui/touch';
import { updateEnemy, type EnemyBody, type BehaviorHost } from '../systems/enemy-behaviors';
import { WarnQuota } from '../systems/warn-quota';
import { InputController } from '../systems/input';
import { RunState } from '../systems/runstate';
import { DEFAULT_LEVEL, LEVELS, type LevelConfig, type LevelId } from '../systems/waves';
import { TEX, texFor, buildPlaceholders } from '../data/placeholder';

type EnemySprite = EnemyBody;

export class GameScene extends Phaser.Scene {
  private input2!: InputController;
  private run!: RunState;
  private player!: Phaser.Physics.Arcade.Sprite;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private warnQuota = new WarnQuota();
  private warnIcons = new Map<Phaser.GameObjects.Image, EnemySprite>();
  private warnIconOf = new Map<EnemySprite, Phaser.GameObjects.Image>();
  private reducedMotion = false;
  private touch: TouchController | null = null;
  private orientationCleanup: (() => void) | null = null;
  private readonly behaviorHost: BehaviorHost = {
    spawnEnemyProjectile: (x, y, speed) => this.spawnEnemyProjectile(x, y, speed),
    setWarnSign: (e, visible) => this.setWarnSign(e, visible),
  };
  private wavesInitialized = false;
  private pending: Array<{ at: number; enemyId: string; y: number }> = [];
  private cooldownMs = 0;
  private invulnMs = 0;
  private hudReady = false;
  private hudText!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Rectangle;
  private level!: LevelConfig;

  constructor() { super('Game'); }

  create(): void {
    const params = new URLSearchParams(location.search);
    const requested = params.get('level') as LevelId | null;
    const levelId: LevelId = __DEV_HOOK__ && requested && LEVELS[requested] ? requested : DEFAULT_LEVEL;
    this.level = LEVELS[levelId];
    this.reducedMotion = isReducedMotion();
    this.run = new RunState(1);
    this.wavesInitialized = false;
    this.pending = [];
    this.cooldownMs = 0;
    this.invulnMs = 0;

    this.cameras.main.setBackgroundColor('#dcecf7');

    // 背景捲動條
    for (let i = 0; i < 6; i++) {
      this.add.rectangle(120 + i * 220, 360, 8, 540, 0xffffff, 0.35);
    }

    this.player = this.physics.add.sprite(180, 360, TEX.player);
    this.player.body!.setSize(BALANCE.player.bodyW, BALANCE.player.bodyH);
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(60, 90, 1160, 540);

    buildPlaceholders(this, [
      { kindId: 'aflatoxin', w: 72, h: 72 },
      { kindId: 'sulfur_dioxide_excess', w: 88, h: 64 },
      { kindId: 'salmonella', w: 96, h: 48 },
      { kindId: 's_aureus', w: 80, h: 80 },
    ]);

    this.bullets = this.physics.add.group({ maxSize: BALANCE.caps.playerBullets });
    this.enemies = this.physics.add.group();
    this.enemyBullets = this.physics.add.group({ maxSize: BALANCE.caps.enemyBullets });
    this.warnQuota = new WarnQuota(3, __DEV_HOOK__);
    this.warnIcons.clear();

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
      this.onBulletHit(b as Phaser.Physics.Arcade.Image, e as EnemySprite);
    });
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => {
      this.onPlayerHitEnemy(e as EnemySprite);
    });
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => {
      this.onEnemyBulletHitPlayer(b as Phaser.Physics.Arcade.Image);
    });

    this.add.graphics().fillStyle(0xffffff, 0.001); // reserve

    this.hudText = this.add.text(24, 20, '', {
      fontFamily: '"Noto Sans TC", sans-serif', fontSize: '24px', color: '#1b4965',
    }).setDepth(10);

    this.add.rectangle(440, 32, 400, 14, 0xc7dced).setOrigin(0, 0.5).setDepth(10);
    this.progress = this.add.rectangle(440, 32, 0, 14, 0x2a9d8f).setOrigin(0, 0.5).setDepth(10);

    const pauseBtn = this.add.text(1180, 22, '⏸', { fontSize: '32px', color: '#1b4965' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    pauseBtn.on('pointerup', () => this.requestPause());

    this.input2 = new InputController();
    this.input2.attach(this.game.canvas, () => this.requestPause());

    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (isTouch) {
      this.touch = new TouchController(this, () => this.requestPause());
      this.touch.attach(this.game.canvas, true);
      this.setupOrientationGuard();
    }

    // HudScene 為獨立 scene，永不暫停；等它 create 完成（hud-ready）後才啟用事件
    this.hudReady = false;
    if (this.scene.isActive('Hud')) {
      this.scene.stop('Hud');
    }
    const hud = this.scene.get('Hud');
    hud.events.once('hud-ready', () => { this.hudReady = true; });
    this.scene.launch('Hud');

    if (__DEV_HOOK__) {
      this.sys.events.on(Phaser.Scenes.Events.POST_UPDATE, this.samplePostUpdate, this);
    }
    this.events.on('resume', () => this.onResume());
    this.events.once('shutdown', () => this.cleanup());
  }

  /** 直向時顯示旋轉提示；切回橫向需玩家手動按繼續 */
  private setupOrientationGuard(): void {
    const el = document.getElementById('ui-layer');
    if (!el) return;
    const hint = document.createElement('div');
    hint.id = 'rotate-hint';
    hint.textContent = '請將手機旋轉為橫向';
    Object.assign(hint.style, {
      position: 'fixed', inset: '0', display: 'none', zIndex: '9999',
      background: 'rgba(11,43,60,0.96)', color: '#fff', fontSize: '22px',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
    } as CSSStyleDeclaration);
    el.appendChild(hint);

    const apply = () => {
      const portrait = window.innerHeight > window.innerWidth;
      hint.style.display = portrait ? 'flex' : 'none';
      if (portrait && this.isFighting && !this.scene.isPaused()) {
        this.touch?.clearAll();
        this.input2.clearAll();
        this.player.setVelocity(0, 0);
        this.requestPause();
      }
    };
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    apply();
    this.orientationCleanup = () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      hint.remove();
    };
  }

  private requestPause(): void {
    if (!this.hudReady) return;
    if (!this.isFighting) return;
    this.input2.clearAll();
    this.touch?.clearAll();
    this.player.setVelocity(0, 0);
    this.scene.pause();
    this.scene.get('Hud').events.emit('show-pause');
  }

  /** dev-only：以場景 POST_UPDATE 為固定取樣點，與前一筆快照比較 */
  private samplePostUpdate(): void {
    if (!this.player?.body) return;
    const log = window as unknown as { __SAMPLES__?: unknown[]; __PREV_SAMPLE__?: unknown };
    log.__SAMPLES__ = log.__SAMPLES__ || [];
    if (log.__SAMPLES__.length >= 800) return;
    const cur = {
      t: this.time.now,
      x: this.player.body.position.x,
      vx: this.player.body.velocity.x,
      level: this.run.elapsedMs,
      inp: this.input2.read().moveX,
      steps: this.physics.world.stepsLastFrame,
    };
    const prev = log.__PREV_SAMPLE__ as typeof cur | undefined;
    if (prev) {
      log.__SAMPLES__.push({
        dLevel: +(cur.level - prev.level).toFixed(2),
        dSceneTime: +(cur.t - prev.t).toFixed(2),
        dx: +(cur.x - prev.x).toFixed(3),
        vx: cur.vx,
        inp: cur.inp,
        steps: cur.steps,
      });
    }
    log.__PREV_SAMPLE__ = cur;
  }

  private onResume(): void {
    // 恢復時再清一次，避免暫停期間殘留的按鍵/指標狀態
    this.input2.clearAll();
    this.cooldownMs = Math.max(0, this.cooldownMs);
  }

  private scheduleWaves(): void {
    if (__DEV_HOOK__) {
      const w = window as unknown as { __SW_CALLS__?: number };
      w.__SW_CALLS__ = (w.__SW_CALLS__ || 0) + 1;
    }
    this.pending = [];
    for (const g of this.level.waves) {
      let t = g.atMs;
      g.batches.forEach((b, bi) => {
        if (bi > 0) t += g.gapBetweenBatchesMs;
        for (let i = 0; i < b.count; i++) {
          this.pending.push({ at: t, enemyId: b.enemyId, y: b.y[i % b.y.length] });
          t += b.gapMs;
        }
      });
    }
    this.pending.sort((a, b) => a.at - b.at);
  }

  private get isFighting(): boolean {
    return this.run.phase === 'playing' || this.run.phase === 'finishing';
  }

  override update(_time: number, delta: number): void {
    if (!this.isFighting) return;
    const dt = Math.min(delta, 50);
    if (__DEV_HOOK__) {
      const rl = window as unknown as { __RAW_DELTAS__?: unknown[] };
      rl.__RAW_DELTAS__ = rl.__RAW_DELTAS__ || [];
      if (rl.__RAW_DELTAS__.length < 800) rl.__RAW_DELTAS__.push({ raw: +delta.toFixed(2), dt: +dt.toFixed(2) });
    }
    const __x0 = __DEV_HOOK__ ? this.player.body!.position.x : 0;
    const __inp = __DEV_HOOK__ ? this.input2.read().moveX : 0;

    if (this.input2.consumePause()) { this.requestPause(); return; }

    this.run.tick(dt);
    const kb = this.input2.read();
    const tc = this.touch?.read();
    // 混合輸入優先序：有鍵盤方向輸入時以鍵盤為準，否則用觸控；射擊為 OR
    const kbActive = kb.moveX !== 0 || kb.moveY !== 0;
    let mx = kbActive ? kb.moveX : (tc?.moveX ?? 0);
    let my = kbActive ? kb.moveY : (tc?.moveY ?? 0);
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const inp = {
      moveX: mx,
      moveY: my,
      firing: kb.firing || (tc?.firing ?? false),
      pauseRequested: false,
    };
    if (tc && this.touch?.consumePause()) { this.requestPause(); return; }

    // 玩家移動（唯一由這裡設定速度；物理負責位移）
    this.player.setVelocity(inp.moveX * BALANCE.player.speed, inp.moveY * BALANCE.player.speed);

    // 射擊冷卻
    if (this.invulnMs > 0) this.invulnMs = Math.max(0, this.invulnMs - dt);
    if (this.cooldownMs > 0) this.cooldownMs -= dt;
    if (inp.firing && this.cooldownMs <= 0 && this.bullets.countActive(true) < BALANCE.caps.playerBullets) {
      this.fireBullet();
      this.cooldownMs = BALANCE.player.fireCooldownMs;
    }

    // 波次：每局只展開一次；佇列用盡即代表本局排程結束，不得重新排程
    if (!this.wavesInitialized) {
      this.wavesInitialized = true;
      this.scheduleWaves();
    }
    while (this.pending.length && this.run.elapsedMs >= this.pending[0].at) {
      const s = this.pending.shift()!;
      this.spawnEnemy(s.enemyId, s.y);
    }

    // 敵人行為更新（資料驅動狀態機）
    for (const obj of this.enemies.getChildren()) {
      const e = obj as EnemySprite;
      if (e.active) updateEnemy(e, dt, this.warnQuota, this.behaviorHost);
    }
    for (const [owner, icon] of [...this.warnIconOf.entries()]) {
      if (!owner.active) {
        icon.destroy();
        this.warnIconOf.delete(owner);
        this.warnIcons.delete(icon as unknown as Phaser.GameObjects.Image);
        this.warnQuota.release(owner.uid);
      } else {
        icon.setPosition(this.warnX(owner), this.warnY(owner));
      }
    }

    // 敵彈離場
    for (const obj of this.enemyBullets.getChildren()) {
      const b = obj as Phaser.Physics.Arcade.Image;
      if (b.active && (b.x < 0 || b.x > 1280)) b.destroy();
    }

    // 敵人自然離場
    for (const obj of this.enemies.getChildren()) {
      const e = obj as EnemySprite;
      if (e.active && e.x < e.def.exitX) {
        if (!e.settled) { e.settled = true; this.run.addEscape(); }
        if (e.hasWarnSign) { this.setWarnSign(e, false); }
        this.warnQuota.release(e.uid);
        e.destroy();
      }
    }

    // 子彈離場
    for (const obj of this.bullets.getChildren()) {
      const b = obj as Phaser.Physics.Arcade.Image;
      if (b.active && b.x > 1280) b.destroy();
    }

    if (__DEV_HOOK__) {
      const w = window as unknown as { __SPEED_SAMPLES__?: unknown[] };
      w.__SPEED_SAMPLES__ = w.__SPEED_SAMPLES__ || [];
      if (w.__SPEED_SAMPLES__.length < 400) {
        w.__SPEED_SAMPLES__.push({
          d: +dt.toFixed(2),
          inp: +__inp.toFixed(2),
          vx: this.player.body!.velocity.x,
          dx: +(this.player.body!.position.x - __x0).toFixed(3),
          steps: this.physics.world.stepsLastFrame,
        });
      }
    }

    if (__DEV_HOOK__) {
      const w = window as unknown as { __WARN__?: unknown };
      w.__WARN__ = {
        inUse: this.warnQuota.inUse,
        holders: this.warnQuota.holdersList(),
        icons: this.warnIconOf.size,
        enemies: this.enemies.getChildren().filter((o) => (o as EnemySprite).active)
          .map((o) => { const e = o as EnemySprite; return { uid: e.uid, k: e.def.kindId, ph: e.phase, hasSign: e.hasWarnSign }; }),
      };
    }

    this.checkOutcome();
    this.updateHud();
  }

  private fireBullet(): void {
    const b = this.bullets.get(this.player.x + 36, this.player.y) as Phaser.Physics.Arcade.Image | null;
    if (!b) return;
    b.setActive(true).setVisible(true);
    b.setTexture(TEX.playerBullet);
    (b.body as Phaser.Physics.Arcade.Body).enable = true;
    b.body!.setSize(BALANCE.player.bulletW, BALANCE.player.bulletH);
    b.setVelocityX(BALANCE.player.bulletSpeed);
  }

  private spawnEnemy(defId: string, y: number): void {
    if (this.enemies.countActive(true) >= BALANCE.caps.enemies) return;
    const def: EnemyDefinition = ENEMIES[defId];
    if (!def) return;
    const e = this.physics.add.sprite(def.spawnX, y, texFor(def.kindId)) as EnemySprite;
    // 先加入群組（群組會套用 defaults 覆寫 velocity / allowGravity），再設定個別屬性
    this.enemies.add(e);
    e.body!.setSize(def.body.w, def.body.h);
    (e.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    e.setCollideWorldBounds(false);
    e.setVelocityX(-def.speed);
    e.uid = `${defId}#${this.run.elapsedMs.toFixed(0)}#${Math.random().toString(36).slice(2,7)}`;
    e.def = def;
    e.hp = def.hp;
    e.settled = false;
    e.enteredAt = this.run.elapsedMs;
    e.phase = 'enter';
    e.phaseT = 0;
    e.cooldownMs = 0;
    e.baseY = y;
    e.elapsedMs = 0;
    e.laneDone = 0;
    e.hasWarnSign = false;
  }

  /** 預警三角：獨立圖層，不烘焙進角色素材 */
  private setWarnSign(e: EnemySprite, visible: boolean): void {
    if (!visible) {
      const found = this.warnIconOf.get(e);
      if (found) { found.destroy(); this.warnIconOf.delete(e); this.warnIcons.delete(found as unknown as Phaser.GameObjects.Image); }
      return;
    }
    const existing = this.warnIconOf.get(e);
    if (existing) { existing.setPosition(this.warnX(e), this.warnY(e)); return; }
    const img = this.add.image(this.warnX(e), this.warnY(e), TEX.warnSign).setDepth(5);
    if (this.reducedMotion) {
      // 降低動態：固定不透明度，不做脈動或閃爍
      img.setAlpha(1);
    } else {
      img.setAlpha(1);
      this.tweens.add({ targets: img, alpha: 0.55, duration: 300, yoyo: true, repeat: -1 });
    }
    this.warnIconOf.set(e, img);
    this.warnIcons.set(img as unknown as Phaser.GameObjects.Image, e);
  }

  private warnX(e: EnemySprite): number { return e.x; }
  private warnY(e: EnemySprite): number { return e.y - e.def.size.h / 2 - 18; }

  private spawnEnemyProjectile(x: number, y: number, speed: number): void {
    if (this.enemyBullets.countActive(true) >= BALANCE.caps.enemyBullets) return;
    const b = this.enemyBullets.get(x, y) as Phaser.Physics.Arcade.Image | null;
    if (!b) return;
    b.setActive(true).setVisible(true);
    b.setTexture(TEX.enemyBullet);
    (b.body as Phaser.Physics.Arcade.Body).enable = true;
    b.body!.setSize(12, 12);
    (b.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    b.setVelocityX(-speed);
  }

  private onEnemyBulletHitPlayer(b: Phaser.Physics.Arcade.Image): void {
    if (!this.isFighting) return;
    if (!b.active) return;
    b.destroy();
    if (this.invulnMs > 0) return;
    this.run.damage(1);
    this.invulnMs = BALANCE.player.invulnMs;
    this.player.setTint(0xff8a8a);
    this.time.delayedCall(BALANCE.player.invulnMs, () => {
      if (this.player.active) this.player.setTint(0xffffff);
    });
  }

  /** 非致命命中不改 settled；只有死亡才結算一次（規格 §6.2） */
  private onBulletHit(bullet: Phaser.Physics.Arcade.Image, enemy: EnemySprite): void {
    if (!this.isFighting) return;
    if (!bullet.active || !enemy.active || enemy.settled) return;
    bullet.destroy();
    if (this.run.elapsedMs - enemy.enteredAt < 1) return;
    enemy.hp -= 1;
    if (enemy.hp <= 0) {
      enemy.settled = true;
      this.run.addKill(enemy.def.score);
      if (enemy.hasWarnSign) { this.setWarnSign(enemy, false); }
      this.warnQuota.release(enemy.uid);
      enemy.destroy();
    } else {
      enemy.setTint(0xffffff);
      const base = HAZARD_KINDS[enemy.def.kindId].palette.base;
      this.time.delayedCall(80, () => { if (enemy.active) enemy.setTint(base); });
    }
  }

  private onPlayerHitEnemy(enemy: EnemySprite): void {
    if (!this.isFighting) return;
    if (!enemy.active || enemy.settled) return;
    if (this.run.elapsedMs - enemy.enteredAt < 1) return;
    enemy.settled = true;
    enemy.destroy();
    if (this.invulnMs > 0) return;
    this.run.damage(1);
    this.invulnMs = BALANCE.player.invulnMs;
    this.player.setTint(0xff8a8a);
    this.time.delayedCall(BALANCE.player.invulnMs, () => {
      if (this.player.active) this.player.setTint(0x2a9d8f);
    });
  }

  private checkOutcome(): void {
    if (__DEV_HOOK__) {
      const w = window as unknown as { __CO_CALLS__?: number };
      w.__CO_CALLS__ = (w.__CO_CALLS__ || 0) + 1;
    }
    if (this.run.phase === 'won' || this.run.phase === 'lost') return;

    if (this.run.hp <= 0) {
      this.run.phase = 'lost';
      this.finish('lost');
      return;
    }

    if (this.run.phase === 'playing' && this.run.elapsedMs >= this.level.durationMs) {
      this.run.phase = 'finishing';
    }

    if (this.run.phase === 'finishing') {
      const enemiesLeft = this.enemies.countActive(true);
      const bulletsLeft = this.countEnemyBullets();
      const timeUp = this.run.elapsedMs >= this.level.durationMs + this.level.finishMs;
      if ((enemiesLeft === 0 && bulletsLeft === 0) || timeUp) {
        if (timeUp && enemiesLeft > 0) {
          for (const o of this.enemies.getChildren()) {
            const e = o as EnemySprite;
            if (e.active && !e.settled) { e.settled = true; this.run.addEscape(); }
          }
        }
        this.run.phase = 'won';
        this.finish('won');
      }
    }
  }

  private countEnemyBullets(): number {
    return this.enemyBullets.countActive(true);
  }

  private finish(outcome: 'won' | 'lost'): void {
    if (__DEV_HOOK__) {
      const w = window as unknown as { __FIN_CALLS__?: number };
      w.__FIN_CALLS__ = (w.__FIN_CALLS__ || 0) + 1;
    }
    if (!this.hudReady) return;
    if (this.run.phase !== 'won' && this.run.phase !== 'lost') return;
    // 終局：立即停止輸入與物理，避免結算後仍移動/加分
    this.input2?.clearAll();
    this.touch?.clearAll();
    this.player.setVelocity(0, 0);
    // 剩餘敵人：結算後只銷毀，不再增加逃脫數（逃脫僅在收尾期限由 checkOutcome 計入）
    for (const obj of [...this.enemies.getChildren()]) {
      const e = obj as EnemySprite;
      if (!e.active) continue;
      e.settled = true;
      e.destroy();
    }
    this.bullets.clear(true, true);
    this.enemyBullets.clear(true, true);
    for (const icon of [...this.warnIcons.keys()]) icon.destroy();
    this.warnIcons.clear();
    this.warnIconOf.clear();
    this.warnQuota.reset();
    this.physics.world.pause();
    const hpBonus = outcome === 'won' ? this.run.hp * BALANCE.score.hpBonusPerLife : 0;
    this.scene.get('Hud').events.emit('finished', {
      outcome,
      score: this.run.score + hpBonus,
      breakdown: { kills: this.run.score, hpBonus },
      elapsedMs: this.run.elapsedMs,
      kills: this.run.kills,
      escapes: this.run.escapes,
    });
  }

  private updateHud(): void {
    const s = this.run.snapshot();
    const hearts = '♥'.repeat(Math.max(0, s.hp)) + '♡'.repeat(Math.max(0, s.maxHp - s.hp));
    this.hudText.setText(`${hearts}   分數 ${s.score}`);
    const p = Phaser.Math.Clamp(s.elapsedMs / this.level.durationMs, 0, 1);
    this.progress.width = 400 * p;
  }

  private cleanup(): void {
    this.orientationCleanup?.();
    this.orientationCleanup = null;
    this.touch?.destroy();
    this.touch = null;
    this.sys.events.off(Phaser.Scenes.Events.POST_UPDATE, this.samplePostUpdate, this);
    this.input2?.destroy();
    this.pending = [];
  }

  /** 供 Hud 呼叫：重玩（全新 RunState，不重建 scene，避免重複監聽） */
  restartRun(): void {
    this.physics.world.resume();
    this.scene.stop('Hud');
    this.scene.stop();
    this.scene.start('Game');
  }

  /** 供 Hud 呼叫：真正結束本局並回到選單 */
  stopForMenu(): void {
    this.physics.world.resume();
    this.scene.stop('Hud');
    this.scene.stop();
    this.scene.start('Menu');
  }
}
