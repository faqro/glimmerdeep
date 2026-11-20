import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { net } from '../systems/MultiplayerSystem';

export interface GameOverData {
  victory: boolean;
  levelReached: number;
  shardsCollected: number;
  enemiesDefeated: number;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: GameOverData): void {
    this.add.rectangle(180, 135, 360, 270, 0x0b0917);
    const glow = this.add
      .image(180, 90, 'glow_soft')
      .setScale(3.5)
      .setTint(data.victory ? 0x66ffd9 : 0xff47b6)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.55, duration: 1800, yoyo: true, repeat: -1 });

    this.add.image(180, 135, 'ui_panel').setDisplaySize(270, 160);

    addPixelText(
      this,
      180,
      82,
      data.victory ? 'EVERHEART RESTORED!' : 'THE LIGHT FADED...',
      16,
      data.victory ? 0x66ffd9 : 0xf49ac1,
      0.5,
      0.5,
      250
    );

    addPixelText(this, 180, 114, `Floor Reached: ${data.levelReached} / 6`, 8, 0xffffff, 0.5, 0.5);
    addPixelText(this, 180, 132, `Shards Gathered: ${data.shardsCollected}`, 8, 0x6ef3ff, 0.5, 0.5);
    addPixelText(this, 180, 150, `Foes Banished: ${data.enemiesDefeated}`, 8, 0xffe066, 0.5, 0.5);

    const btn = this.add.image(180, 186, 'ui_btn').setDisplaySize(130, 22).setInteractive({ useHandCursor: true });
    addPixelText(this, 180, 186, 'MAIN MENU', 8, 0xffffff, 0.5, 0.5);

    btn.on('pointerover', () => btn.setTexture('ui_btn_hover'));
    btn.on('pointerout', () => btn.setTexture('ui_btn'));
    btn.on('pointerdown', () => {
      SoundSystem.playPickup();
      net.disconnect();
      this.scene.start('MenuScene');
    });
  }
}
