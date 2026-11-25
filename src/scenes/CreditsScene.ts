import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { net } from '../systems/MultiplayerSystem';

interface CreditLine {
  text: string;
  size: number;
  color: number;
  holdMs: number;
}

const CREDIT_LINES: CreditLine[] = [
  { text: 'Written by Faraaz Jan', size: 10, color: 0xffffff, holdMs: 2800 },
  { text: 'Developed by Faraaz Jan', size: 10, color: 0xffffff, holdMs: 2800 },
  { text: 'Created using Phaser', size: 10, color: 0xffffff, holdMs: 2800 },
  { text: 'Multiplayer by Trystero', size: 10, color: 0xffffff, holdMs: 2800 },
  {
    text: 'Music licensed from MOJI, NearTheAtmosphere, and David Renda',
    size: 8,
    color: 0xffffff,
    holdMs: 3000,
  },
  {
    text: 'Audio licensed from Vsessa, SolarPhasing, jeckkech, and Electrobuz',
    size: 8,
    color: 0xffffff,
    holdMs: 3000,
  },
  { text: 'GLIMMERDEEP', size: 24, color: 0xf49ac1, holdMs: 5600 },
];

export class CreditsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CreditsScene' });
  }

  create(): void {
    SoundSystem.stopBossEvilLaughLoop();
    SoundSystem.setMusicTrack('credits');

    net.onLobbyUpdate = undefined;
    net.onGameStart = undefined;
    net.onRemotePlayerState = undefined;
    net.onWorldSync = undefined;
    net.onRoomSync = undefined;
    net.onRemoteAttack = undefined;
    net.onRemoteInteract = undefined;
    net.onPeerJoined = undefined;
    net.onPeerLeft = undefined;

    this.add.rectangle(180, 135, 360, 270, 0x000000);

    this.showLine(0);
  }

  private showLine(index: number): void {
    if (index >= CREDIT_LINES.length) {
      this.time.delayedCall(500, () => {
        net.disconnect();
        SoundSystem.setMusicTrack('menu');
        this.scene.start('MenuScene');
      });
      return;
    }

    const line = CREDIT_LINES[index];
    const txt = addPixelText(
      this,
      180,
      135,
      line.text,
      line.size,
      line.color,
      0.5,
      0.5,
      300
    ).setAlpha(0);

    this.tweens.add({
      targets: txt,
      alpha: 1,
      duration: 800,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.time.delayedCall(line.holdMs, () => {
          this.tweens.add({
            targets: txt,
            alpha: 0,
            duration: 800,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              txt.destroy();
              this.time.delayedCall(350, () => {
                this.showLine(index + 1);
              });
            },
          });
        });
      },
    });
  }
}
