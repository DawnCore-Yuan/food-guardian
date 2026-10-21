import Phaser from 'phaser';
import { BALANCE } from '../data/balance';
import { ENEMIES, type EnemyDefinition } from '../data/enemies';
import { HAZARD_KINDS } from '../data/hazard-kinds';
import { isReducedMotion } from '../systems/storage';
import { audio } from '../systems/audio';
import { TouchController } from '../ui/touch';
import { updateEnemy, type EnemyBody, type BehaviorHost } from '../systems/enemy-behaviors';
import { WarnQuota } from '../systems/warn-quota';
import { InputController } from '../systems/input';
import { RunState } from '../systems/runstate';
import { DEFAULT_LEVEL, LEVELS, type LevelConfig, type LevelId } from '../systems/waves';
import { TEX, VISUAL, texFor, buildPlaceholders } from '../data/placeholder';

type EnemySprite = EnemyBody;

const GAME_W = 1280;
const GAME_H = 720;

export class GameScene extends Phaser.Scene {
  private input2!: InputController;
  private run!: RunState;
  private player!: Phaser.Physics.Arcade.Sprite;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private warnQuota = new WarnQuota();
  private warnIcons = new Map<Phaser.GameObjects.Image, EnemySprite>();
  /** 敵人名稱牌（深藍膠囊＋白字＋下指三角），資料取自 HAZARD_KINDS */
  private nameTags = new Map<EnemySprite, Phaser.GameObjects.Container>();
  private warnIconOf = new Map<EnemySprite, Phaser.GameObjects.Image>();
  private reducedMotion = false;
  private effects = new Set<Phaser.GameObjects.Image>();
  private touch: TouchController | null = null;
  private orientationCleanup: (() => void) | null = null;
  private readonly behaviorHost: BehaviorHost = {
    spawnEnemyProjectileFrom: (enemy, speed) => this.spawnEnemyProjectileFrom(enemy, speed),
    setWarnSign: (e, visible) => this.setWarnSign(e, visible),
  };
  private wavesInitialized = false;
  private pending: Array<{ at: number; enemyId: string; y: number }> = [];
  private cooldownMs = 0;
  private invulnMs = 0;
  private hudReady = false;
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

    // 背景：靜態鋪底（未驗證無縫拼接，不做循環）
    // z 由 add 順序決定：背景 < 遊戲物件 < 特效 < HUD(獨立 scene)
    if (this.textures.exists('art-bg')) {
      this.add.image(GAME_W / 2, GAME_H / 2, 'art-bg').setDepth(-10);
    } else {
      for (let i = 0; i < 6; i++) {
        this.add.rectangle(120 + i * 220, 360, 8, 540, 0xffffff, 0.35);
      }
    }

    const playerTex = this.textures.exists('art-player') ? 'art-player' : TEX.player;
    this.player = this.physics.add.sprite(180, 360, playerTex);
    this.applyCenteredBody(this.player, BALANCE.player.bodyW, BALANCE.player.bodyH);
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(60, 90, 1160, 540);

    buildPlaceholders(this, [
      { kindId: 'aflatoxin', w: VISUAL.aflatoxin.w, h: VISUAL.aflatoxin.h },
      { kindId: 'sulfur_dioxide_excess', w: VISUAL.sulfur_dioxide_excess.w, h: VISUAL.sulfur_dioxide_excess.h },
      { kindId: 'salmonella', w: VISUAL.salmonella.w, h: VISUAL.salmonella.h },
      { kindId: 's_aureus', w: VISUAL.s_aureus.w, h: VISUAL.s_aureus.h },
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

    // 頂部 HUD 已移入獨立 HudScene（批次 8）：GameScene 不再建立任何 HUD 物件，
    // 只負責把狀態推給 Hud，避免兩套 HUD 重複顯示。
    this.add.graphics().fillStyle(0xffffff, 0.001); // reserve

    // 桌面鍵盤提示（左下）：只在非觸控環境顯示，不遮主要戰鬥區
    const isTouchEnv = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouchEnv) {
      this.add.text(24, GAME_H - 24, 'WASD 移動｜Space 射擊', {
        fontFamily: '"Noto Sans TC", sans-serif', fontSize: '18px',
        color: '#1b4965', backgroundColor: '#eaf4fbcc', padding: { x: 12, y: 6 },
      }).setOrigin(0, 1).setDepth(9).setName('kbd-hint');
    }

    // 在任何使用者手勢中嘗試解鎖音訊（iOS Safari 需要）
    const unlock = () => { void audio.unlock(); };
    this.input.once('pointerdown', unlock);

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
    this.events.on('hud-request-pause', this.requestPause, this);
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
      if (portrait) audio.setSuspended(true);   // 轉直向：停止戰鬥聲
      if (portrait && this.isFighting && !this.scene.isPaused()) {
        this.touch?.clearAll();
        this.input2.clearAll();
        this.player.setVelocity(0, 0);
        this.requestPause();
      }
    };
    const onHide = (): void => { if (document.hidden) audio.setSuspended(true); else audio.setSuspended(false); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', () => audio.setSuspended(true));
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    apply();
    this.orientationCleanup = () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      document.removeEventListener('visibilitychange', onHide);
      hint.remove();
    };
  }

  private requestPause(): void {
    if (!this.hudReady) return;
    if (!this.isFighting) return;
    audio.play('ui');            // 按鈕回饋（暫停）
    audio.setSuspended(true);    // 暫停時停止戰鬥聲
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
    audio.setSuspended(false);
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
    this.updateNameTags();
    this.updateHud();
  }

  /**
   * 設定碰撞體並「置中對齊」顯示框。
   * 角色外觀放大時，紋理尺寸變大但碰撞體維持原世界尺寸，
   * 因此 offset = (顯示寬 - 碰撞寬) / 2，避免碰撞框偏向一角。
   */
  private applyCenteredBody(
    obj: Phaser.Physics.Arcade.Sprite,
    bodyW: number,
    bodyH: number,
  ): void {
    const body = obj.body as Phaser.Physics.Arcade.Body;
    body.setSize(bodyW, bodyH);
    // 注意：Arcade Body 的 offset 以「紋理原始像素」為單位，會再乘上 sprite scale。
    // 角色紋理已是目標尺寸且 scale=1，因此直接用 width/height 置中，
    // 不用 displayWidth（那等於 width×scale，換算後會偏掉）。
    body.setOffset((obj.width - bodyW) / 2, (obj.height - bodyH) / 2);
  }

  /** 彈體：材質已裁去透明留白，collision 與顯示同尺寸；置中對齊後 offset = 0 */
  private applyImageCenteredBody(
    obj: Phaser.Physics.Arcade.Image,
    bodyW: number,
    bodyH: number,
  ): void {
    const body = obj.body as Phaser.Physics.Arcade.Body;
    body.setSize(bodyW, bodyH);
    body.setOffset((obj.width - bodyW) / 2, (obj.height - bodyH) / 2);
  }

  private fireBullet(): void {
    // 以「彈體左緣」貼齊機首右緣 + 4px 間隙。
    // 注意 displayWidth 是寬度的兩倍（sprite 的 width/height 存半值、scaleX=2 抵銷），
    // 直接用會把生成點推到機身內側，因此改用左緣 + 半寬換算。
    const playerRight = this.player.getBounds().right;
    const b = this.bullets.get(playerRight + 4 + BALANCE.player.bulletW / 2, this.player.y) as Phaser.Physics.Arcade.Image | null;
    if (!b) return;
    b.setActive(true).setVisible(true);
    this.applyBulletTexture(b, 'art-player-bullet', TEX.playerBullet);
    (b.body as Phaser.Physics.Arcade.Body).enable = true;
    this.applyImageCenteredBody(b, BALANCE.player.bulletW, BALANCE.player.bulletH);
    b.setVelocityX(BALANCE.player.bulletSpeed);
    audio.play('shoot');
  }

  private spawnEnemy(defId: string, y: number): void {
    if (this.enemies.countActive(true) >= BALANCE.caps.enemies) return;
    const def: EnemyDefinition = ENEMIES[defId];
    if (!def) return;
    const e = this.physics.add.sprite(def.spawnX, y, texFor(def.kindId, this)) as EnemySprite;
    // 先加入群組（群組會套用 defaults 覆寫 velocity / allowGravity），再設定個別屬性
    this.enemies.add(e);
    this.applyCenteredBody(e, def.body.w, def.body.h);
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
    this.createNameTag(e);
  }

  /**
   * 敵人名稱牌：深藍圓角膠囊 + 淺青細框 + 白色粗體 + 下方指示三角。
   * 名稱來源為 HAZARD_KINDS[kindId].displayName（不在場景內另寫一套）。
   * 與預警三角分開繪製，名稱牌在上、預警三角在中間，避免互相遮蓋。
   */
  private createNameTag(e: EnemySprite): void {
    const name = HAZARD_KINDS[e.def.kindId].displayName;
    const label = this.add.text(0, 0, name, {
      fontFamily: '"Noto Sans TC", sans-serif', fontStyle: 'bold',
      fontSize: '20px', color: '#FFFFFF', stroke: '#0d2334', strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    const w = label.width + 26;
    const h = label.height + 12;
    const g = this.add.graphics();
    g.fillStyle(0x1d3b56, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(2, 0x7fdffc, 0.7).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    // 指示三角獨立物件：放在上方時朝下、放下方時朝上
    const tri = this.add.graphics().setName('tag-tri');
    tri.fillStyle(0x1d3b56, 0.9).fillTriangle(-7, h / 2 - 1, 7, h / 2 - 1, 0, h / 2 + 9);
    const c = this.add.container(0, 0, [g, label, tri]).setDepth(6);
    c.setData('tagH', h);
    c.setData('tagW', w);
    this.nameTags.set(e, c);
  }

  /** 每幀更新名稱牌位置：跟隨敵人、避開預警與邊界、同屏重疊時上下錯開 */
  /**
   * 名稱牌顯示（批次 8 修訂）。
   * 優先目標是「能清楚對應自己的敵人」，不是硬把所有牌子都塞進畫面。
   * 規則：
   *   1. 名稱牌固定貼在對應角色上緣外側；有預警三角時，再加入三角淨空帶。
   *   2. 若該位置會壓到「其他敵人」或「其他名稱牌」，或超出畫布：
   *      收斂為不顯示，而不是把牌子推去撞別人或推離本體。
   *   3. 同屏密度高時，優先保留離玩家較近者（較有威脅），其餘隱藏。
   *   4. 不移動敵人、不改行為、不改波次。
   */
  /**
   * 名稱牌顯示（批次 8 修訂 2）。
   * 核心要求：名稱牌必須能清楚對應自己的敵人。
   * 規則：
   *   1. 預設貼在對應角色上緣外側（有預警三角時再往上讓出三角）。
   *   2. 若該位置壓到「其他敵人」：先水平微調（最多 ±40px，仍在本體附近）再試一次。
   *   3. 仍衝突、或會超出畫面（例如貼近頂部 HUD 下方）→ 不顯示。
   *      寧可不顯示，也不把牌子推去撞別人或推離本體。
   *   4. 同屏密集時，兩個名稱牌互撞則只保留離玩家較近者。
   *   5. 不移動敵人、不改行為、不改波次。
   */
  /**
   * 名稱牌（批次 8 定案規則）
   *   1. 優先貼在敵人上緣外側；上方被頂部 HUD 或畫面邊界擋住時，改放下方並把指示三角轉向上。
   *   2. 不覆蓋其他敵人、不覆蓋預警三角、不與其他名稱牌重疊。
   *   3. 上方與下方都不行 → 只在水平方向小幅讓位（≤40px，仍貼近本體）再試。
   *   4. 仍不行 → 該張隱藏（密集處收斂），不新增替代圖示、不移動敵人。
   */
  /**
   * 名稱牌（固定優先序，不再擴增候選）
   *   1. 上方：貼在敵人上緣外，不得越過頂部 HUD 安全區
   *   2. 下方：上方放不下時放下方，指示三角朝上
   *   3. 兩個都不行 → 隱藏（密集時允許只顯示部分）
   * 只以「完整矩形」判斷：不超出畫布、不與已放置的名稱牌重疊。
   * 不與敵人框做部分重疊判斷（避免把標籤算成覆蓋角色而全部隱藏）。
   */
  private updateNameTags(): void {
    if (this.nameTags.size === 0) return;
    const CLEAR = 8;
    const TOP_LIMIT = 96;

    type Rect = { l: number; r: number; t: number; b: number };
    const rectOf = (x: number, y: number, w: number, h: number): Rect =>
      ({ l: x - w / 2, r: x + w / 2, t: y - h / 2, b: y + h / 2 });
    const overlap = (p: Rect, q: Rect): boolean =>
      p.l < q.r && p.r > q.l && p.t < q.b && p.b > q.t;

    const items = [...this.nameTags.entries()]
      .filter(([e]) => e.active)
      .map(([e, c]) => ({
        e, c,
        w: (c.getData('tagW') as number) ?? 120,
        h: (c.getData('tagH') as number) ?? 32,
        dist: Math.hypot(e.x - this.player.x, e.y - this.player.y),
      }))
      .sort((x, y) => x.dist - y.dist);

    // 回收已失效
    for (const [e, c] of [...this.nameTags.entries()]) {
      if (!e.active) { c.destroy(); this.nameTags.delete(e); }
    }

    const placed: Rect[] = [];
    for (const it of items) {
      const bb = it.e.getBounds();
      const x = Phaser.Math.Clamp(it.e.x, 12 + it.w / 2, GAME_W - 12 - it.w / 2);
      const aboveY = bb.top - it.h / 2 - CLEAR;
      const belowY = bb.bottom + it.h / 2 + CLEAR;

      let chosen: { y: number; up: boolean } | null = null;
      for (const cand of [{ y: aboveY, up: true }, { y: belowY, up: false }]) {
        const r = rectOf(x, cand.y, it.w, it.h);
        if (r.t < TOP_LIMIT) continue;            // 會撞頂部 HUD
        if (r.b > GAME_H - 4) continue;           // 超出畫面下緣
        if (r.l < 4 || r.r > GAME_W - 4) continue;
        if (placed.some((p) => overlap(r, p))) continue;
        chosen = cand;
        placed.push(r);
        break;
      }

      if (!chosen) { it.c.setVisible(false); continue; }

      const tri = it.c.getByName('tag-tri') as Phaser.GameObjects.Graphics | null;
      if (tri) {
        tri.clear();
        tri.fillStyle(0x1d3b56, 0.9);
        if (chosen.up) tri.fillTriangle(-7, it.h / 2 - 1, 7, it.h / 2 - 1, 0, it.h / 2 + 9);
        else tri.fillTriangle(-7, -it.h / 2 + 1, 7, -it.h / 2 + 1, 0, -it.h / 2 - 9);
      }
      it.c.setVisible(true).setPosition(x, chosen.y);
    }
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
    // 只在「正式開始預警」時播一次；waiting 階段不會建立三角，因此不會重複
    audio.play('warn');
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
  /**
   * 警告三角位置：以敵人「實際顯示高度」為準（視覺放大後 def.size 已不等於顯示尺寸）。
   * displayHeight 會反映紋理實際高度 × scale，因此不需另外維護一張尺寸表。
   */
  private warnY(e: EnemySprite): number { return e.y - e.displayHeight / 2 - 19; }

  /**
   * 由敵人「依實際發射方向」從顯示邊界外側發射。
   * 敵人一律向左射擊，因此以 getBounds().left 為基準，
   * 往左留 4px 間隙後，用「彈體半寬」回推中心點，讓 24×24 完整落在身體外。
   */
  private spawnEnemyProjectileFrom(enemy: EnemySprite, speed: number): void {
    const halfW = BALANCE.enemyBullet.w / 2;
    const x = enemy.getBounds().left - 4 - halfW;
    this.spawnEnemyProjectile(x, enemy.y, speed);
  }

  private spawnEnemyProjectile(x: number, y: number, speed: number): void {
    if (this.enemyBullets.countActive(true) >= BALANCE.caps.enemyBullets) return;
    const b = this.enemyBullets.get(x, y) as Phaser.Physics.Arcade.Image | null;
    if (!b) return;
    b.setActive(true).setVisible(true);
    this.applyBulletTexture(b, 'art-enemy-bullet', TEX.enemyBullet);
    (b.body as Phaser.Physics.Arcade.Body).enable = true;
    this.applyImageCenteredBody(b, BALANCE.enemyBullet.w, BALANCE.enemyBullet.h);
    (b.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    b.setVelocityX(-speed);
  }

  /** 彈體材質：scale 固定 1（執行期素材已整理為目標尺寸），碰撞體另由呼叫端設定 */
  private applyBulletTexture(b: Phaser.Physics.Arcade.Image, artKey: string, fallbackKey: string): void {
    b.setTexture(this.textures.exists(artKey) ? artKey : fallbackKey);
    b.setScale(1);
  }

  /**
   * 無碰撞視覺特效：只做「不遮擋」的呈現。
   * 重要限制：GameScene 本身的更新可能被暫停，但 tweens 若沒有一起暫停，
   * 特效會在玩家看不到時跑完；因此以場景 tween manager 綁定，暫停即凍結。
   * 尺寸固定不放大（放大會遮住敵彈與角色），只做淡出與極小幅縮，降低動態時完全不建。
   */
  private spawnEffect(key: string, x: number, y: number, size: number, kind: 'hit' | 'burst'): void {
    if (this.reducedMotion || !this.textures.exists(key)) return;
    const img = this.add.image(x, y, key).setDepth(kind === 'burst' ? 6 : 7);
    const from = size / img.width;
    img.setScale(from);
    img.setAlpha(kind === 'burst' ? 0.95 : 1);
    img.setBlendMode(Phaser.BlendModes.NORMAL);
    this.effects.add(img);
    this.tweens.add({
      targets: img,
      scale: from * (kind === 'burst' ? 1.08 : 1.04),
      alpha: 0,
      duration: kind === 'burst' ? 300 : 160,
      ease: 'Quad.easeOut',
      onComplete: () => { this.effects.delete(img); img.destroy(); },
    });
  }

  private spawnHitSpark(x: number, y: number): void {
    this.spawnEffect('art-hit-spark', x, y, 32, 'hit');
  }

  private spawnEnemyBurst(x: number, y: number): void {
    this.spawnEffect('art-enemy-burst', x, y, 64, 'burst');
  }

  private clearNameTags(): void {
    for (const c of this.nameTags.values()) c.destroy();
    this.nameTags.clear();
  }

  private cleanupEffects(): void {
    for (const obj of [...this.effects]) {
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.effects.clear();
  }

  private onEnemyBulletHitPlayer(b: Phaser.Physics.Arcade.Image): void {
    if (!this.isFighting) return;
    if (!b.active) return;
    b.destroy();
    if (this.invulnMs > 0) return;
    const hpBefore = this.run.hp;
    this.run.damage(1);
    if (this.run.hp < hpBefore) audio.play('hurt');   // 只在實際扣血成功時播
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
    const hitX = bullet.x;
    const hitY = bullet.y;
    bullet.destroy();
    if (this.run.elapsedMs - enemy.enteredAt < 1) return;
    enemy.hp -= 1;
    // 致命命中只播擊破聲，避免與命中聲疊在一起
    if (enemy.hp > 0) audio.play('hit');
    const ex = enemy.x;
    const ey = enemy.y;
    if (enemy.hp <= 0) {
      enemy.settled = true;
      this.run.addKill(enemy.def.score);
      audio.play('kill');
      if (enemy.hasWarnSign) { this.setWarnSign(enemy, false); }
      this.warnQuota.release(enemy.uid);
      enemy.destroy();
      this.spawnEnemyBurst(ex, ey);
    } else {
      this.spawnHitSpark(hitX, hitY);
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
    const hpBefore2 = this.run.hp;
    this.run.damage(1);
    if (this.run.hp < hpBefore2) audio.play('hurt');
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
    this.cleanupEffects();
    for (const icon of [...this.warnIcons.keys()]) icon.destroy();
    this.warnIcons.clear();
    this.warnIconOf.clear();
    this.clearNameTags();
    this.warnQuota.reset();
    this.physics.world.pause();
    const hpBonus = outcome === 'won' ? this.run.hp * BALANCE.score.hpBonusPerLife : 0;
    audio.stopAll();
    audio.play(outcome === 'won' ? 'win' : 'lose');
    this.scene.get('Hud').events.emit('finished', {
      outcome,
      score: this.run.score + hpBonus,
      breakdown: { kills: this.run.score, hpBonus },
      elapsedMs: this.run.elapsedMs,
      kills: this.run.kills,
      escapes: this.run.escapes,
    });
  }

  /** HUD 狀態推給 HudScene（HUD 在獨立 scene，永不被暫停，也不受背景影響） */
  private updateHud(): void {
    if (!this.hudReady) return;
    const s = this.run.snapshot();
    this.scene.get('Hud').events.emit('hud-update', {
      hp: s.hp,
      maxHp: s.maxHp,
      score: s.score,
      elapsedMs: s.elapsedMs,
      durationMs: this.level.durationMs,
      phase: this.run.phase,
    });
  }

  private cleanup(): void {
    this.events.off('hud-request-pause', this.requestPause, this);
    this.clearNameTags();
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
    audio.stopAll();
    audio.setSuspended(false);
    this.physics.world.resume();
    this.scene.stop('Hud');
    this.scene.stop();
    this.scene.start('Game');
  }

  /** 供 Hud 呼叫：真正結束本局並回到選單 */
  stopForMenu(): void {
    audio.stopAll();
    audio.setSuspended(false);
    this.physics.world.resume();
    this.scene.stop('Hud');
    this.scene.stop();
    this.scene.start('Menu');
  }
}
