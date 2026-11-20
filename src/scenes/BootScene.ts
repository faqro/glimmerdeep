import Phaser from 'phaser';
import { PixelArtGenerator } from '../assets/PixelArtGenerator';
import { registerPixelFont } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const gen = new PixelArtGenerator(this);
    gen.generateAll();
    registerPixelFont(this);
    SoundSystem.startMusic();

    this.scene.start('MenuScene');
  }
}
