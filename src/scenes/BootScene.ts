import Phaser from 'phaser';
import splashUrl from '../assets/splash.webp';
import { PixelArtGenerator } from '../assets/PixelArtGenerator';
import { registerPixelFont } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { inputSystem } from '../systems/InputSystem';
import { JournalSystem } from '../systems/JournalSystem';
import { settingsSystem } from '../systems/SettingsSystem';
import { steamSystem } from '../systems/SteamSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.image('menu_splash', splashUrl);
  }

  create(): void {
    const gen = new PixelArtGenerator(this);
    gen.generateAll();
    registerPixelFont(this);
    SoundSystem.startMusic();
    void steamSystem.refreshPlayerName();
    void steamSystem.refreshSteamId();
    void steamSystem.refreshDlcStatus();

    const syncPromise = steamSystem.syncFromCloud(() => {
      settingsSystem.reloadFromStorage();
      JournalSystem.reloadFromStorage();
      inputSystem.reloadFromStorage();
    });
    const timeoutPromise = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1500);
    });
    void Promise.race([syncPromise, timeoutPromise]).finally(() => {
      if (this.scene.isActive('BootScene')) {
        this.scene.start('MenuScene');
      }
    });
  }
}
