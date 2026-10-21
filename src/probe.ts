import Phaser from 'phaser';

/**
 * A 階段最小驗證（僅 ?probe=1 / dev）。
 * 每個案例使用獨立 Scene，等 create 完成後才步進；
 * 主值採 body.position 前後差，deltaX 僅輔助。
 */
declare global {
  interface Window { __PROBE_RESULT__?: unknown[] }
}

interface CaseResult {
  case: string;
  sceneCreated: boolean;
  worldPaused: boolean;
  bodyInWorld: boolean;
  bodyEnabled: boolean;
  velocityX: number;
  fixedStep: boolean;
  stepsRequested: number;
  stepCalls: number;
  bodyStartX: number;
  bodyEndX: number;
  bodyMovedPx: number;
  spriteStartX: number;
  spriteEndX: number;
  expectedPx: number;
  fps: number;
  frameTimeMS: number;
}

const SPEED = 100;

export function runProbe(): void {
  const results: CaseResult[] = [];
  const cases: Array<{ name: string; fixedStep: boolean; deltas: number[] }> = [
    { name: 'A fixedStep=true, 3x16ms', fixedStep: true, deltas: [16, 16, 16] },
    { name: 'B fixedStep=false, 3x16ms', fixedStep: false, deltas: [16, 16, 16] },
    { name: 'C fixedStep=true, 2x120ms', fixedStep: true, deltas: [120, 120] },
    { name: 'D fixedStep=false, 2x120ms', fixedStep: false, deltas: [120, 120] },
  ];

  let index = 0;
  const runNext = () => {
    if (index >= cases.length) {
      window.__PROBE_RESULT__ = results;
      return;
    }
    const c = cases[index++];
    runCase(c, (r) => { results.push(r); runNext(); });
  };
  runNext();
}

function runCase(
  c: { name: string; fixedStep: boolean; deltas: number[] },
  done: (r: CaseResult) => void,
): void {
  const game = new Phaser.Game({
    type: Phaser.HEADLESS,
    width: 640,
    height: 360,
    parent: document.getElementById('app') ?? undefined,
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, fixedStep: c.fixedStep } },
    audio: { noAudio: true },
    scene: [],
  });

  let stepCalls = 0;

  class ProbeCase extends Phaser.Scene {
    create(): void {
      const sprite = this.physics.add.sprite(100, 180, '__white');
      sprite.setDisplaySize(10, 10);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.enable = true;
      body.setVelocity(SPEED, 0);

      this.physics.disableUpdate();

      const world = this.physics.world;
      const origStep = world.step.bind(world);
      (world as unknown as { step: (d: number) => void }).step = (d: number) => { stepCalls++; origStep(d); };

      const bodyStartX = body.position.x;
      const spriteStartX = sprite.x;

      // 等一個真實 frame，讓 body 進入 world 並完成 preUpdate 註冊
      this.sys.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {
        const bodyInWorld = (world.bodies as unknown as Set<Phaser.Physics.Arcade.Body>).has(body);
        for (const d of c.deltas) world.update(0, d);

        const bodyEndX = body.position.x;
        const moved = bodyEndX - bodyStartX;
        const dtTotal = c.deltas.reduce((a, b) => a + b, 0);
        const expected = c.fixedStep
          ? (1000 / world.fps) * 0.001 * SPEED * (Math.floor(dtTotal / (1000 / world.fps)))
          : dtTotal * 0.001 * SPEED;

        done({
          case: c.name,
          sceneCreated: true,
          worldPaused: world.isPaused,
          bodyInWorld,
          bodyEnabled: body.enable,
          velocityX: body.velocity.x,
          fixedStep: c.fixedStep,
          stepsRequested: c.deltas.length,
          stepCalls,
          bodyStartX: +bodyStartX.toFixed(2),
          bodyEndX: +bodyEndX.toFixed(2),
          bodyMovedPx: +moved.toFixed(2),
          spriteStartX: +spriteStartX.toFixed(2),
          spriteEndX: +sprite.x.toFixed(2),
          expectedPx: +expected.toFixed(2),
          fps: world.fps,
          frameTimeMS: +(1000 / world.fps).toFixed(2),
        });
      });
    }
  }

  game.scene.add('probe', new ProbeCase({ key: 'probe-' + c.name }), true);
}
