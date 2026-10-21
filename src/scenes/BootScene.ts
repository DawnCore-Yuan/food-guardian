import Phaser from 'phaser';
import { buildPlaceholders } from '../data/placeholder';
import { HAZARD_KINDS } from '../data/hazard-kinds';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void {
    // 執行期素材（等比整理後的遊戲尺寸）；缺檔時退回幾何佔位
    this.load.image('art-player', 'assets/sprites/player.png');
    this.load.image('art-aflatoxin', 'assets/sprites/enemies/aflatoxin.png');
    this.load.image('art-sulfur_dioxide_excess', 'assets/sprites/enemies/sulfur-dioxide-excess.png');
    this.load.image('art-salmonella', 'assets/sprites/enemies/salmonella.png');
    this.load.image('art-s_aureus', 'assets/sprites/enemies/s-aureus.png');
  }

  create(): void {
    // 幾何佔位僅在缺少美術檔時使用
    void HAZARD_KINDS;
    buildPlaceholders(this, []);
    this.scene.start('Menu');
  }
}
