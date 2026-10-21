import Phaser from 'phaser';
import { buildPlaceholders } from '../data/placeholder';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create(): void {
    // 原創佔位材質：scale = 1，body.setSize 的世界尺寸等於規格值
    buildPlaceholders(this);
    this.scene.start('Menu');
  }
}
