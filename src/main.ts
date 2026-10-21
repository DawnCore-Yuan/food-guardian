import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';

declare const __DEV_HOOK__: boolean;

// 測試入口與探測模組共用同一個編譯期旗標（僅 dev server 為 true，build 一律 false）
if (__DEV_HOOK__ && new URLSearchParams(location.search).get('probe') === '1') {
  void import('./probe').then((m) => m.runProbe());
}

const app = document.getElementById('app');
if (!app) throw new Error('missing #app');

// 單一 Phaser.Game 實例；不建立第二個 rAF（規格 §10.3）
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: app,
  width: 1280,
  height: 720,
  backgroundColor: '#eaf4fb',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  // 本專案音效由自建 AudioManager（src/systems/audio.ts）負責，
  // Phaser 內建 SoundManager 若啟用會另外建立一個 AudioContext（實測計數 1→2），
  // 因此明確關閉；不使用任何 Phaser sound API。
  audio: { noAudio: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, GameScene, HudScene],
});

if (__DEV_HOOK__) {
  (window as unknown as { __FG_GAME__?: Phaser.Game }).__FG_GAME__ = game;
}
