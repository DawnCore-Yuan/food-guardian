import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';

if (new URLSearchParams(location.search).get('probe') === '1') {
  void import('./probe').then((m) => m.runProbe());
}

const app = document.getElementById('app');
if (!app) throw new Error('missing #app');

// 單一 Phaser.Game 實例；不建立第二個 rAF（規格 §10.3）
new Phaser.Game({
  type: Phaser.AUTO,
  parent: app,
  width: 1280,
  height: 720,
  backgroundColor: '#eaf4fb',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, GameScene, HudScene],
});
