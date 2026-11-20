import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { pickRandomPaletteId } from '../data/palettes';
import { net } from '../systems/MultiplayerSystem';
import { getDailySeed } from '../utils/SeededGenerator';

const USERNAME_STORAGE_KEY = 'glimmerdeep_username';

export class MenuScene extends Phaser.Scene {
  private playerName = 'Wanderer';
  private joinCode = '';
  private activeField: 'none' | 'name' | 'code' = 'none';

  private previewSprite!: Phaser.GameObjects.Sprite;
  private nameBoxBg!: Phaser.GameObjects.Rectangle;
  private nameText!: Phaser.GameObjects.BitmapText;

  private joinModal!: Phaser.GameObjects.Container;
  private codeBoxBg!: Phaser.GameObjects.Rectangle;
  private codeText!: Phaser.GameObjects.BitmapText;

  private cursorBlink = true;
  private fireflies: Array<{ sprite: Phaser.GameObjects.Image; vx: number; vy: number; phase: number }> = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    net.disconnect();
    this.fireflies = [];
    this.activeField = 'none';
    this.joinCode = '';
    try {
      const saved = localStorage.getItem(USERNAME_STORAGE_KEY);
      if (saved && saved.trim().length > 0) {
        this.playerName = saved.trim().slice(0, 12);
      }
    } catch {
      // ignore storage access errors
    }

    this.add.rectangle(180, 135, 360, 270, 0x0e0c21);

    const glow = this.add
      .image(180, 72, 'glow_soft')
      .setScale(3.5)
      .setTint(0x9d7ce8)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.55, duration: 2200, yoyo: true, repeat: -1 });

    for (let i = 0; i < 18; i++) {
      const fx = Phaser.Math.Between(16, 344);
      const fy = Phaser.Math.Between(16, 254);
      const sp = this.add
        .image(fx, fy, 'particle_spark')
        .setTint(i % 2 === 0 ? 0xf49ac1 : 0x66ffd9)
        .setAlpha(0.7);
      this.fireflies.push({
        sprite: sp,
        vx: Phaser.Math.FloatBetween(-8, 8),
        vy: Phaser.Math.FloatBetween(-6, 6),
        phase: Math.random() * Math.PI * 2,
      });
    }

    addPixelText(this, 180, 22, 'GLIMMERDEEP', 24, 0xf49ac1, 0.5, 0);
    addPixelText(this, 180, 52, 'A 16-bit Cozy Dungeon Roguelike', 8, 0xb8a1ff, 0.5, 0);

    this.add.image(96, 148, 'ui_panel').setDisplaySize(124, 126);

    const previewPalId = pickRandomPaletteId();
    this.previewSprite = this.add.sprite(96, 126, `player_${previewPalId}`, 0).setScale(2);
    this.time.addEvent({
      delay: 350,
      loop: true,
      callback: () => {
        if (this.previewSprite?.active) {
          this.previewSprite.setFrame(this.previewSprite.frame.name === '0' ? 1 : 0);
        }
      },
    });

    addPixelText(this, 96, 166, 'NAME:', 8, 0x9d8ce0, 0.5, 0);
    this.nameBoxBg = this.add
      .rectangle(96, 186, 106, 18, 0x100d24)
      .setStrokeStyle(1, 0x6c5bb3)
      .setInteractive({ useHandCursor: true });
    this.nameText = addPixelText(this, 96, 186, this.playerName, 8, 0xffffff, 0.5, 0.5);

    this.nameBoxBg.on('pointerdown', () => {
      if (this.joinModal.visible) return;
      this.activeField = 'name';
      SoundSystem.playSwing();
      this.refreshTextboxes();
    });

    this.createPixelButton(256, 108, 'PLAY SOLO', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      net.startSolo(this.playerName.trim() || 'Wanderer', pickRandomPaletteId());
      const seed = getDailySeed(0);
      this.scene.start('GameScene', { levelIndex: 0, floorSeed: seed, resetRun: true });
    });

    this.createPixelButton(256, 140, 'CREATE CO-OP', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      net.hostGame(this.playerName.trim() || 'Host', pickRandomPaletteId());
      this.scene.start('LobbyScene');
    });

    this.createPixelButton(256, 172, 'JOIN CO-OP', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      this.openJoinModal();
    });

    addPixelText(
      this,
      180,
      248,
      'WASD Move | Mouse Aim/Attack | Space Dodge | E Interact | Tab Map',
      8,
      0x7e71b8,
      0.5,
      0.5,
      336
    );

    this.buildJoinModal();

    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        this.cursorBlink = !this.cursorBlink;
        this.refreshTextboxes();
      },
    });

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (this.activeField === 'none') return;

      if (ev.key === 'Escape') {
        if (this.activeField === 'code') {
          this.closeJoinModal();
        } else {
          this.activeField = 'none';
          this.refreshTextboxes();
        }
        return;
      }

      if (ev.key === 'Enter') {
        if (this.activeField === 'code') {
          this.submitJoinCode();
        } else {
          this.activeField = 'none';
          this.refreshTextboxes();
        }
        return;
      }

      if (ev.key === 'Backspace') {
        if (this.activeField === 'name') {
          this.playerName = this.playerName.slice(0, -1);
          this.saveUsername();
        } else if (this.activeField === 'code') {
          this.joinCode = this.joinCode.slice(0, -1);
        }
        this.refreshTextboxes();
        return;
      }

      if (ev.key.length === 1) {
        if (this.activeField === 'name') {
          if (this.playerName.length < 12 && /^[a-zA-Z0-9 _-]$/.test(ev.key)) {
            this.playerName += ev.key;
            this.saveUsername();
            this.refreshTextboxes();
          }
        } else if (this.activeField === 'code') {
          const ch = ev.key.toUpperCase();
          if (this.joinCode.length < 6 && /^[A-Z0-9]$/.test(ch)) {
            this.joinCode += ch;
            this.refreshTextboxes();
          }
        }
      }
    });
  }

  private buildJoinModal(): void {
    this.joinModal = this.add.container(0, 0).setVisible(false).setDepth(30);
    const dim = this.add.rectangle(180, 135, 360, 270, 0x0b0917, 0.78).setInteractive();
    const panel = this.add.image(180, 135, 'ui_panel').setDisplaySize(210, 114);
    const title = addPixelText(this, 180, 96, 'ENTER INVITE CODE', 8, 0xf49ac1, 0.5, 0.5);

    this.codeBoxBg = this.add
      .rectangle(180, 126, 120, 22, 0x100d24)
      .setStrokeStyle(1, 0xffe066)
      .setInteractive({ useHandCursor: true });
    this.codeText = addPixelText(this, 180, 126, '', 16, 0xffe066, 0.5, 0.5);

    this.codeBoxBg.on('pointerdown', () => {
      this.activeField = 'code';
      this.refreshTextboxes();
    });

    const joinBtn = this.add.image(132, 164, 'ui_btn').setDisplaySize(82, 20).setInteractive({ useHandCursor: true });
    const joinTxt = addPixelText(this, 132, 164, 'JOIN', 8, 0xffffff, 0.5, 0.5);
    joinBtn.on('pointerover', () => joinBtn.setTexture('ui_btn_hover'));
    joinBtn.on('pointerout', () => joinBtn.setTexture('ui_btn'));
    joinBtn.on('pointerdown', () => this.submitJoinCode());

    const cancelBtn = this.add.image(228, 164, 'ui_btn').setDisplaySize(82, 20).setInteractive({ useHandCursor: true });
    const cancelTxt = addPixelText(this, 228, 164, 'CANCEL', 8, 0xffffff, 0.5, 0.5);
    cancelBtn.on('pointerover', () => cancelBtn.setTexture('ui_btn_hover'));
    cancelBtn.on('pointerout', () => cancelBtn.setTexture('ui_btn'));
    cancelBtn.on('pointerdown', () => this.closeJoinModal());

    this.joinModal.add([dim, panel, title, this.codeBoxBg, this.codeText, joinBtn, joinTxt, cancelBtn, cancelTxt]);
  }

  private openJoinModal(): void {
    this.joinCode = '';
    this.activeField = 'code';
    this.joinModal.setVisible(true);
    this.refreshTextboxes();
  }

  private closeJoinModal(): void {
    this.joinModal.setVisible(false);
    this.activeField = 'none';
    this.refreshTextboxes();
  }

  private submitJoinCode(): void {
    const code = this.joinCode.trim().toUpperCase();
    if (code.length < 4) {
      SoundSystem.playHit();
      return;
    }
    SoundSystem.playPickup();
    net.joinGame(code, this.playerName.trim() || 'Guest', pickRandomPaletteId());
    this.scene.start('LobbyScene');
  }

  private saveUsername(): void {
    try {
      const trimmed = this.playerName.trim();
      if (trimmed.length > 0) {
        localStorage.setItem(USERNAME_STORAGE_KEY, trimmed);
      } else {
        localStorage.removeItem(USERNAME_STORAGE_KEY);
      }
    } catch {
      // ignore storage access errors
    }
  }

  private refreshTextboxes(): void {
    const showCursor = this.cursorBlink ? '_' : ' ';
    if (this.activeField === 'name') {
      this.nameBoxBg.setStrokeStyle(1, 0xffe066);
      this.nameText.setText(`${this.playerName}${showCursor}`).setTint(0xffe066);
    } else {
      this.nameBoxBg.setStrokeStyle(1, 0x6c5bb3);
      this.nameText.setText(this.playerName || 'Wanderer').setTint(0xffffff);
    }

    if (this.activeField === 'code') {
      this.codeBoxBg.setStrokeStyle(1, 0xffe066);
      this.codeText.setText(`${this.joinCode}${showCursor}`);
    } else {
      this.codeBoxBg.setStrokeStyle(1, 0x6c5bb3);
      this.codeText.setText(this.joinCode);
    }
  }

  private createPixelButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.image(x, y, 'ui_btn').setDisplaySize(136, 24).setInteractive({ useHandCursor: true });
    const txt = addPixelText(this, x, y, label, 8, 0xffffff, 0.5, 0.5);

    bg.on('pointerover', () => {
      bg.setTexture('ui_btn_hover');
      txt.setTint(0xffe066);
    });
    bg.on('pointerout', () => {
      bg.setTexture('ui_btn');
      txt.setTint(0xffffff);
    });
    bg.on('pointerdown', onClick);
  }

  private cyclePalette(_dir: number): void {
    // Removed manual skin selector; skins are randomized per run.
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    for (const f of this.fireflies) {
      f.phase += dt * 3;
      f.sprite.x += f.vx * dt;
      f.sprite.y += f.vy * dt;
      f.sprite.setAlpha(0.35 + 0.45 * Math.abs(Math.sin(f.phase)));
      if (f.sprite.x < 8) f.sprite.x = 352;
      if (f.sprite.x > 352) f.sprite.x = 8;
      if (f.sprite.y < 8) f.sprite.y = 262;
      if (f.sprite.y > 262) f.sprite.y = 8;
    }
  }
}
