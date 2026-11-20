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
    net.onRemotePlayerState = undefined;
    net.onWorldSync = undefined;
    net.onRoomSync = undefined;
    net.onRemoteAttack = undefined;
    net.onRemoteInteract = undefined;
    net.onPeerJoined = undefined;
    net.onPeerLeft = undefined;

    this.add.rectangle(180, 135, 360, 270, 0x0b0917);
    const glow = this.add
      .image(180, 90, 'glow_soft')
      .setScale(3.5)
      .setTint(data.victory ? 0x66ffd9 : 0xff47b6)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.55, duration: 1800, yoyo: true, repeat: -1 });

    this.add.image(180, 135, 'ui_panel').setDisplaySize(270, 168);

    addPixelText(
      this,
      180,
      78,
      data.victory ? 'EVERHEART RESTORED!' : 'THE LIGHT FADED...',
      16,
      data.victory ? 0x66ffd9 : 0xf49ac1,
      0.5,
      0.5,
      250
    );

    addPixelText(this, 180, 108, `Floor Reached: ${data.levelReached} / 6`, 8, 0xffffff, 0.5, 0.5);
    addPixelText(this, 180, 124, `Shards Gathered: ${data.shardsCollected}`, 8, 0x6ef3ff, 0.5, 0.5);
    addPixelText(this, 180, 140, `Foes Banished: ${data.enemiesDefeated}`, 8, 0xffe066, 0.5, 0.5);

    if (net.mode === 'solo') {
      const btn = this.add.image(180, 186, 'ui_btn').setDisplaySize(130, 22).setInteractive({ useHandCursor: true });
      addPixelText(this, 180, 186, 'MAIN MENU', 8, 0xffffff, 0.5, 0.5);

      btn.on('pointerover', () => btn.setTexture('ui_btn_hover'));
      btn.on('pointerout', () => btn.setTexture('ui_btn'));
      btn.on('pointerdown', () => {
        SoundSystem.playPickup();
        net.disconnect();
        this.scene.start('MenuScene');
      });
      return;
    }

    const statusHint = addPixelText(
      this,
      180,
      160,
      net.mode === 'host' ? '' : 'Waiting for host to Play Again...',
      8,
      0xb8a1ff,
      0.5,
      0.5,
      250
    );

    const menuBtn = this.add.image(115, 188, 'ui_btn').setDisplaySize(106, 22).setInteractive({ useHandCursor: true });
    addPixelText(this, 115, 188, 'MAIN MENU', 8, 0xffffff, 0.5, 0.5);
    menuBtn.on('pointerover', () => menuBtn.setTexture('ui_btn_hover'));
    menuBtn.on('pointerout', () => menuBtn.setTexture('ui_btn'));
    menuBtn.on('pointerdown', () => {
      SoundSystem.playPickup();
      net.disconnect();
      this.scene.start('MenuScene');
    });

    let playAgainReady = net.mode === 'host';
    const playAgainBtn = this.add
      .image(245, 188, 'ui_btn')
      .setDisplaySize(116, 22)
      .setAlpha(playAgainReady ? 1 : 0.4)
      .setInteractive({ useHandCursor: playAgainReady });
    const playAgainTxt = addPixelText(this, 245, 188, 'PLAY AGAIN', 8, playAgainReady ? 0xffffff : 0x9d8ce0, 0.5, 0.5);

    playAgainBtn.on('pointerover', () => {
      if (playAgainReady) playAgainBtn.setTexture('ui_btn_hover');
    });
    playAgainBtn.on('pointerout', () => playAgainBtn.setTexture('ui_btn'));
    playAgainBtn.on('pointerdown', () => {
      if (!playAgainReady) return;
      SoundSystem.playUnlock();
      if (net.mode === 'host') {
        net.broadcastPlayAgain();
        net.broadcastLobbySelf(true);
      } else {
        net.broadcastLobbySelf(false);
      }
      net.onPlayAgain = undefined;
      net.onHostMigrated = undefined;
      this.scene.start('LobbyScene');
    });

    net.onPlayAgain = () => {
      playAgainReady = true;
      playAgainBtn.setAlpha(1);
      playAgainBtn.setInteractive({ useHandCursor: true });
      playAgainTxt.setText('REJOIN PARTY').setTint(0xffffff);
      statusHint.setText('Host opened the party!').setTint(0x66ffd9);
      SoundSystem.playPickup();
    };

    net.onHostMigrated = (_newHostPeerId, isLocalNewHost) => {
      if (isLocalNewHost) {
        playAgainReady = true;
        playAgainBtn.setAlpha(1);
        playAgainBtn.setInteractive({ useHandCursor: true });
        playAgainTxt.setText('PLAY AGAIN').setTint(0xffffff);
        statusHint.setText('You are now Host!').setTint(0xffe066);
      }
    };
  }
}
