import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { net } from '../systems/MultiplayerSystem';
import { getDailySeed } from '../utils/SeededGenerator';

export class LobbyScene extends Phaser.Scene {
  private playerRows: Phaser.GameObjects.Container[] = [];
  private isReady = false;
  private statusText!: Phaser.GameObjects.BitmapText;
  private startBtn!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    this.isReady = net.mode === 'host';
    this.add.rectangle(180, 135, 360, 270, 0x0e0c21);

    addPixelText(this, 180, 24, 'CO-OP LOBBY', 16, 0xf49ac1, 0.5, 0.5);

    this.add.image(180, 52, 'ui_panel').setDisplaySize(220, 28);
    addPixelText(this, 130, 52, `CODE: ${net.inviteCode}`, 8, 0xffe066, 0.5, 0.5);

    const copyBtn = addPixelText(this, 235, 52, '[COPY]', 8, 0x66ffd9, 0.5, 0.5).setInteractive({ useHandCursor: true });

    copyBtn.on('pointerdown', () => {
      navigator.clipboard?.writeText(net.inviteCode).catch(() => {});
      copyBtn.setText('[COPIED]');
      SoundSystem.playPickup();
      this.time.delayedCall(1200, () => {
        if (copyBtn.active) copyBtn.setText('[COPY]');
      });
    });

    this.add.image(180, 142, 'ui_panel').setDisplaySize(308, 130);

    this.statusText = addPixelText(this, 180, 218, '', 8, 0xb8a1ff, 0.5, 0.5, 320);

    if (net.mode === 'host') {
      this.startBtn = this.add.image(245, 244, 'ui_btn').setDisplaySize(116, 22).setInteractive({ useHandCursor: true });
      addPixelText(this, 245, 244, 'START RUN', 8, 0xffffff, 0.5, 0.5);
      this.startBtn.on('pointerdown', () => {
        const allReady = Array.from(net.players.values()).every((p) => p.ready);
        if (!allReady) return;
        SoundSystem.playUnlock();
        const seed = getDailySeed(0);
        net.broadcastStart(seed, 0);
        this.scene.start('GameScene', { levelIndex: 0, floorSeed: seed, resetRun: true });
      });
    } else {
      const readyBtn = this.add.image(245, 244, 'ui_btn').setDisplaySize(116, 22).setInteractive({ useHandCursor: true });
      const readyTxt = addPixelText(this, 245, 244, 'READY', 8, 0xffffff, 0.5, 0.5);
      readyBtn.on('pointerdown', () => {
        this.isReady = !this.isReady;
        readyTxt.setText(this.isReady ? 'UNREADY' : 'READY');
        net.broadcastLobbySelf(this.isReady);
        SoundSystem.playPickup();
      });
    }

    const backBtn = this.add.image(115, 244, 'ui_btn').setDisplaySize(100, 22).setInteractive({ useHandCursor: true });
    addPixelText(this, 115, 244, 'BACK', 8, 0xffffff, 0.5, 0.5);
    backBtn.on('pointerdown', () => {
      net.disconnect();
      this.scene.start('MenuScene');
    });

    net.onLobbyUpdate = () => this.refreshPlayers();
    net.onGameStart = (seed, levelIndex) => {
      this.scene.start('GameScene', { levelIndex, floorSeed: seed, resetRun: true });
    };

    this.refreshPlayers();
  }

  private refreshPlayers(): void {
    for (const r of this.playerRows) r.destroy();
    this.playerRows = [];

    const list = Array.from(net.players.values());
    list.forEach((p, idx) => {
      const y = 98 + idx * 28;
      const row = this.add.container(0, 0);
      const sp = this.add.sprite(50, y, `player_${p.paletteId}`, 0);
      const tag = p.isHost ? ' [HOST]' : '';
      const nm = addPixelText(this, 72, y - 4, `${p.name}${tag}`, 8, 0xffffff, 0, 0);
      const rdy = addPixelText(this, 318, y - 4, p.ready ? 'READY' : 'WAIT...', 8, p.ready ? 0x66ffd9 : 0xf49ac1, 1, 0);
      row.add([sp, nm, rdy]);
      this.playerRows.push(row);
    });

    const allReady = list.length > 0 && list.every((p) => p.ready);
    if (net.mode === 'host') {
      this.statusText.setText(
        allReady ? `${list.length}/4 Adventurers Ready` : 'Waiting for all players to ready up...'
      );
      if (this.startBtn) {
        this.startBtn.setAlpha(allReady ? 1 : 0.45);
      }
    } else {
      this.statusText.setText(`Connected (${list.length}/4) - Waiting for host...`);
    }
  }
}
