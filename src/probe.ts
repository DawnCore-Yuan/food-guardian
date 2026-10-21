import Phaser from 'phaser';

/**
 * A 階段最小驗證：量測 World.update 在不同設定下的位移，
 * 以及 postUpdate 是否被 Scene 自動呼叫。只在 ?probe=1 時載入。
 */
declare global {
  interface Window { __PROBE_RESULT__?: unknown[] }
}

export function runProbe(): void {
  const results: unknown[] = [];
  const cases: Array<{ name: string; fixedStep: boolean; deltas: number[] }> = [
    { name: 'fixedStep=true 3x16ms', fixedStep: true, deltas: [16, 16, 16] },
    { name: 'fixedStep=false 3x16ms', fixedStep: false, deltas: [16, 16, 16] },
    { name: 'fixedStep=true 2x120ms (slow)', fixedStep: true, deltas: [120, 120] },
    { name: 'fixedStep=false 2x120ms (slow)', fixedStep: false, deltas: [120, 120] },
  ];

  for (const c of cases) {
    const game = new Phaser.Game({
      type: Phaser.HEADLESS,
      width: 320, height: 180,
      parent: document.getElementById('app') ?? undefined,
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, fixedStep: c.fixedStep } },
      audio: { noAudio: true },
      scene: [],
    });

    class ProbeScene extends Phaser.Scene {
      create(): void {
        const s = this.physics.add.sprite(0, 90, '__white');
        s.setDisplaySize(10, 10);
        const body = s.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        body.enable = true;
        s.setVelocityX(100);
        this.physics.disableUpdate();
        const startX = s.x;
        for (const d of c.deltas) {
          this.physics.world.update(0, d);
        }
        results.push({
          case: c.name,
          expectedPx: +(c.deltas.reduce((a, b) => a + b, 0) * 0.1).toFixed(2),
          actualPx: +(s.x - startX).toFixed(2),
        });
        window.setTimeout(() => game.destroy(true), 0);
      }
    }
    game.scene.add('probe', new ProbeScene({ key: 'probe' }), true);
  }

  // postUpdate 是否由 Scene 自動呼叫（即使 disableUpdate）
  let postUpdateCalls = 0;
  const game2 = new Phaser.Game({
    type: Phaser.HEADLESS, width: 320, height: 180,
    parent: document.getElementById('app') ?? undefined,
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
    audio: { noAudio: true }, scene: [],
  });

  class Probe2 extends Phaser.Scene {
    create(): void {
      this.physics.add.sprite(5, 5, '__white');
      this.physics.disableUpdate();
      const world = this.physics.world;
      const orig = world.postUpdate.bind(world);
      (world as unknown as { postUpdate: () => void }).postUpdate = () => { postUpdateCalls++; orig(); };
      window.setTimeout(() => {
        results.push({ case: 'postUpdate auto-called with disableUpdate()', calls: postUpdateCalls });
        window.__PROBE_RESULT__ = results;
        game2.destroy(true);
      }, 300);
    }
  }
  game2.scene.add('probe2', new Probe2({ key: 'probe2' }), true);
}
