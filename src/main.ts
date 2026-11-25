import Phaser from 'phaser';
import { isMobileMode } from './mobile/MobileInput';
import { mountMobileShell } from './mobile/MobileShell';
import { BootScene } from './scenes/BootScene';
import { CreditsScene } from './scenes/CreditsScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';
import { JournalScene } from './scenes/JournalScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MenuScene } from './scenes/MenuScene';
import { UIScene } from './scenes/UIScene';

if (isMobileMode()) {
  mountMobileShell();
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 360,
  height: 270,
  backgroundColor: '#0b0917',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, JournalScene, LobbyScene, GameScene, UIScene, GameOverScene, CreditsScene],
};

new Phaser.Game(config);
