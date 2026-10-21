import Phaser from 'phaser';
import { buildPlaceholders } from '../data/placeholder';
import { HAZARD_KINDS } from '../data/hazard-kinds';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create(): void {
    // 原創佔位材質：scale = 1，body.setSize 的世界尺寸等於規格值
    // 種類材質在 GameScene 依實際視覺尺寸建立（尺寸來自敵人配置）
    void HAZARD_KINDS;
    buildPlaceholders(this, []);
    this.scene.start('Menu');
  }
}
