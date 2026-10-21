import Phaser from 'phaser';
import { BALANCE } from '../data/balance';
import { ENEMIES } from '../data/enemies';
import { InputController } from '../systems/input';
import { RunState } from '../systems/runstate';
import { TEST_FINISH_MS, TEST_LEVEL_DURATION_MS, TEST_WAVES } from '../systems/waves';

interface EnemySprite extends Phaser.Physics.Arcade.Sprite {
  defId: string;
  hp: number;
  settled: boolean;
  enteredAt: number;
}

export class GameScene extends Phaser.Scene {
  private input2!: InputController;
  private run!: RunState;
  private player!: Phaser.Physics.Arcade.Sprite;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private nextSpawnAt = 0;
  private pending: Array<{ at: number; enemyId: string; y: number }> = [];
  private cooldownMs = 0;
  private invulnMs = 0;
  private hudText!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Rectangle;

  constructor() { super('Game'); }

  create(): void {
    this.run = new RunState(1);
    this.pending = [];
    this.cooldownMs = 0;
    this.invulnMs = 0;

    this.cameras.main.setBackgroundColor('#dcecf7');

    // 背景捲動條
    for (let i = 0; i < 6; i++) {
      this.add.rectangle(120 + i * 220, 360, 8, 540, 0xffffff, 0.35);
    }

    this.player = this.physics.add.sprite(180, 360, '__white');
    this.player.setDisplaySize(64, 40).setTint(0x2a9d8f);
    this.player.body!.setSize(BALANCE.player.bodyW, BALANCE.player.bodyH);
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(60, 90, 1160, 540);

    this.bullets = this.physics.add.group({ maxSize: BALANCE.caps.playerBullets });
    this.enemies = this.physics.add.group();

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
      this.onBulletHit(b as Phaser.Physics.Arcade.Image, e as EnemySprite);
    });
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => {
      this.onPlayerHitEnemy(e as EnemySprite);
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

    this.events.once('shutdown', () => this.cleanup());
  }

  private requestPause(): void {
    this.scene.pause();
    this.scene.get('Hud').events.emit('show-pause');
  }

  private scheduleWaves(): void {
    this.pending = [];
    for (const g of TEST_WAVES) {
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
    this.nextSpawnAt = this.pending.length ? this.pending[0].at : Number.POSITIVE_INFINITY;
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);

    if (this.input2.consumePause()) { this.requestPause(); return; }

    this.run.tick(dt);
    const inp = this.input2.read();

    // 玩家移動（唯一由這裡設定速度；物理負責位移）
    this.player.setVelocity(inp.moveX * BALANCE.player.speed, inp.moveY * BALANCE.player.speed);

    // 射擊冷卻
    if (this.invulnMs > 0) this.invulnMs -= dt;
    if (this.cooldownMs > 0) this.cooldownMs -= dt;
    if (inp.firing && this.cooldownMs <= 0 && this.bullets.countActive(true) < BALANCE.caps.playerBullets) {
      this.fireBullet();
      this.cooldownMs = BALANCE.player.fireCooldownMs;
    }

    // 波次
    if (this.pending.length === 0 && this.nextSpawnAt !== Number.POSITIVE_INFINITY) {
      this.scheduleWaves();
    }
    while (this.pending.length && this.run.elapsedMs >= this.pending[0].at) {
      const s = this.pending.shift()!;
      this.spawnEnemy(s.enemyId, s.y);
    }

    // 敵人自然離場
    for (const obj of this.enemies.getChildren()) {
      const e = obj as EnemySprite;
      if (e.active && e.x < ENEMIES[e.defId].exitX) {
        if (!e.settled) { e.settled = true; this.run.addEscape(); }
        e.destroy();
      }
    }

    // 子彈離場
    for (const obj of this.bullets.getChildren()) {
      const b = obj as Phaser.Physics.Arcade.Image;
      if (b.active && b.x > 1280) b.destroy();
    }

    this.checkOutcome();
    this.updateHud();
  }

  private fireBullet(): void {
    const b = this.bullets.get(this.player.x + 36, this.player.y) as Phaser.Physics.Arcade.Image | null;
    if (!b) return;
    b.setActive(true).setVisible(true);
    b.setDisplaySize(BALANCE.player.bulletW, BALANCE.player.bulletH).setTint(0xffd166);
    (b.body as Phaser.Physics.Arcade.Body).enable = true;
    b.body!.setSize(BALANCE.player.bulletW, BALANCE.player.bulletH);
    b.setVelocityX(BALANCE.player.bulletSpeed);
  }

  private spawnEnemy(defId: string, y: number): void {
    if (this.enemies.countActive(true) >= BALANCE.caps.enemies) return;
    const def = ENEMIES[defId];
    const e = this.physics.add.sprite(def.spawnX, y, '__white') as EnemySprite;
    e.setDisplaySize(def.size.w, def.size.h).setTint(def.tint);
    e.body!.setSize(def.body.w, def.body.h);
    (e.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    e.setVelocityX(-def.speed);
    e.defId = defId;
    e.hp = def.hp;
    e.settled = false;
    e.enteredAt = this.run.elapsedMs;
    this.enemies.add(e);
  }

  /** 非致命命中不改 settled；只有死亡才結算一次（規格 §6.2） */
  private onBulletHit(bullet: Phaser.Physics.Arcade.Image, enemy: EnemySprite): void {
    if (!bullet.active || !enemy.active || enemy.settled) return;
    bullet.destroy();
    if (this.run.elapsedMs - enemy.enteredAt < 1) return;
    enemy.hp -= 1;
    if (enemy.hp <= 0) {
      enemy.settled = true;
      const def = ENEMIES[enemy.defId];
      this.run.addKill(def.score);
      enemy.destroy();
    } else {
      enemy.setTint(0xffffff);
      this.time.delayedCall(80, () => { if (enemy.active) enemy.setTint(ENEMIES[enemy.defId].tint); });
    }
  }

  private onPlayerHitEnemy(enemy: EnemySprite): void {
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
    if (this.run.phase === 'won' || this.run.phase === 'lost') return;

    if (this.run.hp <= 0) {
      this.run.phase = 'lost';
      this.finish('lost');
      return;
    }

    if (this.run.phase === 'playing' && this.run.elapsedMs >= TEST_LEVEL_DURATION_MS) {
      this.run.phase = 'finishing';
    }

    if (this.run.phase === 'finishing') {
      const enemiesLeft = this.enemies.countActive(true);
      const bulletsLeft = this.countEnemyBullets();
      const timeUp = this.run.elapsedMs >= TEST_LEVEL_DURATION_MS + TEST_FINISH_MS;
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
    return 0; // B 階段沒有敵方投射物（雲怪在 C 階段）
  }

  private finish(outcome: 'won' | 'lost'): void {
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
    const p = Phaser.Math.Clamp(s.elapsedMs / TEST_LEVEL_DURATION_MS, 0, 1);
    this.progress.width = 400 * p;
  }

  private cleanup(): void {
    this.input2?.destroy();
    this.pending = [];
  }
}
