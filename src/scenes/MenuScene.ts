import Phaser from 'phaser';
import { version } from '../../package.json';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { ALL_SELECTABLE_AVATARS, pickRandomPaletteId } from '../data/palettes';
import { getPetById, getSavedPetId } from '../data/pets';
import { isMobileMode, NavDir, VirtualButton } from '../mobile/MobileInput';
import { VirtualKeyboard } from '../mobile/VirtualKeyboard';
import { inputSystem, localCoopSession } from '../systems/InputSystem';
import { JournalSystem } from '../systems/JournalSystem';
import { net } from '../systems/MultiplayerSystem';
import { settingsSystem } from '../systems/SettingsSystem';
import { isDesktopBuild, isSteamworksBuild, steamSystem } from '../systems/SteamSystem';
import { getDailySeed } from '../utils/SeededGenerator';

const USERNAME_STORAGE_KEY = 'glimmerdeep_username';
const AVATAR_STORAGE_KEY = 'glimmerdeep_selected_avatar';

export class MenuScene extends Phaser.Scene {
  private playerName = 'Wanderer';
  private joinCode = '';
  private activeField: 'none' | 'name' | 'code' = 'none';

  private previewSprite!: Phaser.GameObjects.Sprite;
  private previewPetSprite?: Phaser.GameObjects.Sprite;
  private skinsBtnBg?: Phaser.GameObjects.Image;
  private skinsBtnTxt?: Phaser.GameObjects.BitmapText;
  private petsBtnBg?: Phaser.GameObjects.Image;
  private petsBtnTxt?: Phaser.GameObjects.BitmapText;
  private selectedAvatarIndex = 0;
  private dlcUnlocked = false;
  private nameBoxBg!: Phaser.GameObjects.Rectangle;
  private nameText!: Phaser.GameObjects.BitmapText;

  private joinModal!: Phaser.GameObjects.Container;
  private codeBoxBg!: Phaser.GameObjects.Rectangle;
  private codeText!: Phaser.GameObjects.BitmapText;
  private joinBtnBg!: Phaser.GameObjects.Image;
  private joinBtnTxt!: Phaser.GameObjects.BitmapText;
  private cancelBtnBg!: Phaser.GameObjects.Image;
  private cancelBtnTxt!: Phaser.GameObjects.BitmapText;

  private menuButtons: Array<{ bg: Phaser.GameObjects.Image; txt: Phaser.GameObjects.BitmapText; onClick: () => void }> = [];
  private bottomHintTxt!: Phaser.GameObjects.BitmapText;
  private mobileFocusIndex = 0; // 0..N-1: menu buttons, N: NAME BOX
  private modalFocusIndex = 0; // 0: CODE BOX, 1: JOIN, 2: CANCEL
  private virtualKeyboard?: VirtualKeyboard;
  private unsubNav?: () => void;
  private unsubBtn?: () => void;
  private unsubCtrl?: () => void;
  private unsubSteamInvite?: () => void;

  private cursorBlink = true;
  private fireflies: Array<{ sprite: Phaser.GameObjects.Image; vx: number; vy: number; phase: number }> = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    SoundSystem.stopBossEvilLaughLoop();
    SoundSystem.setMusicTrack('menu');
    net.disconnect();
    localCoopSession.active = false;
    localCoopSession.players = [];
    this.fireflies = [];
    this.menuButtons = [];
    this.activeField = 'none';
    this.joinCode = '';
    this.mobileFocusIndex = 0;
    this.modalFocusIndex = 0;
    const isSteam = isSteamworksBuild();
    if (isSteam) {
      this.playerName = steamSystem.getCachedPlayerName() || 'Wanderer';
      void steamSystem.refreshPlayerName().then((sn) => {
        if (sn && this.scene.isActive('MenuScene')) {
          this.playerName = sn;
          this.refreshTextboxes();
        }
      });
    } else {
      try {
        const saved = localStorage.getItem(USERNAME_STORAGE_KEY);
        if (saved && saved.trim().length > 0) {
          this.playerName = saved.trim().slice(0, 12);
        }
      } catch {
        // ignore storage access errors
      }
    }

    this.add.rectangle(180, 135, 360, 270, 0x0b0917);

    // Subtle 16-bit cavern silhouette & glowing floor accents
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(0x110e26, 1);
    bgGfx.fillRect(0, 68, 360, 202);
    bgGfx.fillStyle(0x161230, 1);
    bgGfx.fillRect(0, 214, 360, 56);
    bgGfx.fillStyle(0x1e1840, 1);
    bgGfx.fillRect(0, 214, 360, 2);
    // Corner crystal accents
    bgGfx.fillStyle(0x66ffd9, 0.45);
    bgGfx.fillRect(14, 204, 4, 10);
    bgGfx.fillRect(19, 208, 3, 6);
    bgGfx.fillStyle(0xf49ac1, 0.45);
    bgGfx.fillRect(342, 202, 4, 12);
    bgGfx.fillRect(337, 207, 3, 7);

    const glow = this.add
      .image(180, 40, 'glow_soft')
      .setScale(4.2)
      .setTint(0x9d7ce8)
      .setAlpha(0.32)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.55, duration: 2200, yoyo: true, repeat: -1 });

    for (let i = 0; i < 20; i++) {
      const fx = Phaser.Math.Between(16, 344);
      const fy = Phaser.Math.Between(16, 232);
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

    // Title with crisp pixel shadow & divider
    addPixelText(this, 182, 20, 'GLIMMERDEEP', 24, 0x100d24, 0.5, 0);
    addPixelText(this, 180, 18, 'GLIMMERDEEP', 24, 0xf49ac1, 0.5, 0);
    addPixelText(this, 180, 47, 'A 16-bit Cozy Dungeon Roguelike', 8, 0xb8a1ff, 0.5, 0);
    bgGfx.fillStyle(0x5d4e9e, 0.55);
    bgGfx.fillRect(72, 60, 216, 1);

    // Polished Left Character Card
    this.add.rectangle(96, 146, 128, 138, 0x181430, 0.94).setStrokeStyle(2, 0x5d4e9e);
    this.add.ellipse(96, 132, 46, 14, 0x261f47, 1).setStrokeStyle(1, 0x6c5bb3);
    const charGlow = this.add
      .image(96, 114, 'glow_soft')
      .setScale(1.8)
      .setTint(0x66ffd9)
      .setAlpha(0.18)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: charGlow, alpha: 0.32, duration: 1800, yoyo: true, repeat: -1 });

    const previewPalId = pickRandomPaletteId();
    this.previewSprite = this.add.sprite(96, 114, `player_${previewPalId}`, 0).setScale(2);
    this.previewPetSprite = this.add.sprite(116, 122, 'pet_tabby_cat', 0).setScale(1.15).setVisible(false);
    this.time.addEvent({
      delay: 350,
      loop: true,
      callback: () => {
        if (this.previewSprite?.active) {
          this.previewSprite.setFrame(this.previewSprite.frame.name === '0' ? 1 : 0);
        }
        if (this.previewPetSprite?.active && this.previewPetSprite.visible) {
          const cur = Number(this.previewPetSprite.frame.name) || 0;
          this.previewPetSprite.setFrame((cur + 1) % 3);
        }
      },
    });

    this.dlcUnlocked = steamSystem.isAvatarDlcUnlocked();
    this.skinsBtnBg = this.add.image(66, 152, 'ui_btn').setDisplaySize(54, 16).setVisible(false);
    this.skinsBtnTxt = addPixelText(this, 66, 152, 'SKINS', 8, 0x66ffd9, 0.5, 0.5).setVisible(false);
    this.petsBtnBg = this.add.image(126, 152, 'ui_btn').setDisplaySize(54, 16).setVisible(false);
    this.petsBtnTxt = addPixelText(this, 126, 152, 'PETS', 8, 0x66ffd9, 0.5, 0.5).setVisible(false);

    const openSkinBrowser = () => {
      if (!this.dlcUnlocked || this.joinModal.visible) return;
      SoundSystem.playPickup();
      this.scene.start('SkinScene');
    };
    const openPetBrowser = () => {
      if (!this.dlcUnlocked || this.joinModal.visible) return;
      SoundSystem.playPickup();
      this.scene.start('PetScene');
    };
    if (!isMobileMode()) {
      this.skinsBtnBg.setInteractive({ useHandCursor: true }).on('pointerdown', openSkinBrowser);
      this.skinsBtnBg.on('pointerover', () => {
        this.skinsBtnBg?.setTexture('ui_btn_hover');
        this.skinsBtnTxt?.setTint(0xffe066);
      });
      this.skinsBtnBg.on('pointerout', () => {
        this.skinsBtnBg?.setTexture('ui_btn');
        this.skinsBtnTxt?.setTint(0x66ffd9);
      });
      this.petsBtnBg.setInteractive({ useHandCursor: true }).on('pointerdown', openPetBrowser);
      this.petsBtnBg.on('pointerover', () => {
        this.petsBtnBg?.setTexture('ui_btn_hover');
        this.petsBtnTxt?.setTint(0xffe066);
      });
      this.petsBtnBg.on('pointerout', () => {
        this.petsBtnBg?.setTexture('ui_btn');
        this.petsBtnTxt?.setTint(0x66ffd9);
      });
      this.previewSprite.setInteractive({ useHandCursor: true }).on('pointerdown', openSkinBrowser);
      this.previewPetSprite.setInteractive({ useHandCursor: true }).on('pointerdown', openPetBrowser);
    }

    try {
      const savedAvatar = localStorage.getItem(AVATAR_STORAGE_KEY);
      if (savedAvatar) {
        const idx = ALL_SELECTABLE_AVATARS.findIndex((a) => a.id === savedAvatar);
        if (idx >= 0) this.selectedAvatarIndex = idx;
      }
    } catch {
      // ignore storage errors
    }

    if (this.dlcUnlocked) {
      this.applyDlcAvatarSelection();
    } else {
      void steamSystem.refreshDlcStatus().then((unlocked) => {
        if (unlocked && this.scene.isActive('MenuScene')) {
          this.dlcUnlocked = true;
          this.applyDlcAvatarSelection();
        }
      });
    }

    addPixelText(this, 96, 171, 'NAME:', 8, 0x9d8ce0, 0.5, 0);
    this.nameBoxBg = this.add
      .rectangle(96, 191, 108, 18, 0x100d24)
      .setStrokeStyle(1, 0x6c5bb3)
      .setVisible(!isSteam);
    this.nameText = addPixelText(this, 96, 191, this.playerName, 8, isSteam ? 0x66ffd9 : 0xffffff, 0.5, 0.5);

    if (!isMobileMode() && !isSteam) {
      this.nameBoxBg.setInteractive({ useHandCursor: true });
      this.nameBoxBg.on('pointerdown', () => {
        if (this.joinModal.visible) return;
        this.activeField = 'name';
        SoundSystem.playSwing();
        this.refreshTextboxes();
      });
    }

    const showLocalCoop = isDesktopBuild();
    const showLeaderboard = isSteamworksBuild();
    const btnStep = showLeaderboard ? 21 : showLocalCoop ? 22 : 26;
    let btnY = showLeaderboard ? 80 : showLocalCoop ? 84 : 92;

    this.createPixelButton(256, btnY, 'PLAY SOLO', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      const chosenName = this.playerName.trim() || 'Wanderer';
      net.startSolo(chosenName, this.getChosenAvatarId(), this.getChosenPetId());
      if (chosenName !== 'TESTER' && !settingsSystem.hasCompletedTutorial()) {
        this.scene.start('GameScene', {
          isTutorial: true,
          tutorialReturnToMenu: false,
          resetRun: true,
        });
      } else {
        const seed = getDailySeed(0);
        this.scene.start('GameScene', { levelIndex: 0, floorSeed: seed, resetRun: true });
      }
    });
    btnY += btnStep;

    this.createPixelButton(256, btnY, 'CREATE CO-OP', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      net.hostGame(this.playerName.trim() || 'Host', this.getChosenAvatarId(), this.getChosenPetId());
      this.scene.start('LobbyScene');
    });
    btnY += btnStep;

    this.createPixelButton(256, btnY, 'JOIN CO-OP', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      this.openJoinModal();
    });
    btnY += btnStep;

    if (showLocalCoop) {
      this.createPixelButton(256, btnY, 'LOCAL CO-OP', () => {
        if (this.joinModal.visible) return;
        SoundSystem.playPickup();
        this.scene.start('LocalLobbyScene');
      });
      btnY += btnStep;
    }

    this.createPixelButton(256, btnY, 'JOURNAL', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      if (this.playerName === 'ADMIN') {
        JournalSystem.unlockAll();
      }
      this.scene.start('JournalScene');
    });
    btnY += btnStep;

    if (showLeaderboard) {
      this.createPixelButton(256, btnY, 'LEADERBOARD', () => {
        if (this.joinModal.visible) return;
        SoundSystem.playPickup();
        this.scene.start('LeaderboardScene');
      });
      btnY += btnStep;
    }

    this.createPixelButton(256, btnY, 'SETTINGS', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      this.scene.start('SettingsScene');
    });

    this.add.rectangle(180, 248, 360, 28, 0x0b0917, 0.72);
    this.bottomHintTxt = addPixelText(
      this,
      180,
      246,
      this.getBottomHintText(),
      8,
      0x7e71b8,
      0.5,
      0.5,
      336
    );

    addPixelText(this, 354, 265, `v${version}`, 8, 0x6c5bb3, 1, 1);

    this.buildJoinModal();

    if (isMobileMode()) {
      this.virtualKeyboard = new VirtualKeyboard(this);
    }
    this.refreshMobileFocus();
    this.unsubNav = inputSystem.onNav((dir) => this.handleMobileNav(dir));
    this.unsubBtn = inputSystem.onButton((btn) => this.handleMobileButton(btn));
    this.unsubCtrl = inputSystem.onControlTypeChange(() => {
      if (this.bottomHintTxt?.active) {
        this.bottomHintTxt.setText(this.getBottomHintText());
      }
      this.refreshMobileFocus();
    });
    const handleSteamInvite = (invite: { roomId: string; signaling?: string }) => {
      if (!invite?.roomId || !this.scene.isActive('MenuScene')) return;
      if (invite.signaling === 'nostr' || invite.signaling === 'mqtt') {
        net.setSignalingBackend(invite.signaling);
      }
      SoundSystem.playPickup();
      net.joinGame(invite.roomId, this.playerName.trim() || 'Guest', this.getChosenAvatarId(), this.getChosenPetId());
      this.scene.start('LobbyScene');
    };
    this.unsubSteamInvite = steamSystem.onLobbyJoinInvite(handleSteamInvite);
    void steamSystem.consumePendingInvite().then((pending) => {
      if (pending) handleSteamInvite(pending);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubNav?.();
      this.unsubBtn?.();
      this.unsubCtrl?.();
      this.unsubSteamInvite?.();
      this.virtualKeyboard?.destroy();
    });

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

      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      let typed = ev.key;
      if (typed === 'Unidentified' && ev.code) {
        if (ev.code.startsWith('Key')) typed = ev.code.slice(3);
        else if (ev.code.startsWith('Digit')) typed = ev.code.slice(5);
        else if (ev.code.startsWith('Numpad') && ev.code.length === 7) typed = ev.code.slice(6);
      }

      if (typed.length === 1) {
        if (this.activeField === 'name') {
          if (this.playerName.length < 12 && /^[a-zA-Z0-9 _-]$/.test(typed)) {
            this.playerName += typed;
            this.saveUsername();
            this.refreshTextboxes();
          }
        } else if (this.activeField === 'code') {
          const ch = typed.toUpperCase();
          if (this.joinCode.length < 4 && /^[A-Z0-9]$/.test(ch)) {
            this.joinCode += ch;
            this.refreshTextboxes();
          }
        }
      }
    });

    const onPaste = (ev: ClipboardEvent) => {
      if (this.activeField === 'none') return;
      const text = ev.clipboardData?.getData('text') ?? '';
      if (!text) return;
      ev.preventDefault();
      if (this.activeField === 'code') {
        const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (cleaned.length > 0) {
          this.joinCode = (this.joinCode + cleaned).slice(0, 4);
          this.refreshTextboxes();
        }
      } else if (this.activeField === 'name') {
        const cleaned = text.replace(/[^a-zA-Z0-9 _-]/g, '');
        if (cleaned.length > 0) {
          this.playerName = (this.playerName + cleaned).slice(0, 12);
          this.saveUsername();
          this.refreshTextboxes();
        }
      }
    };
    window.addEventListener('paste', onPaste);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('paste', onPaste);
    });
  }

  private buildJoinModal(): void {
    this.joinModal = this.add.container(0, 0).setVisible(false).setDepth(30);
    const dim = this.add.rectangle(180, 135, 360, 270, 0x0b0917, 0.78);
    if (!isMobileMode()) dim.setInteractive();
    const panel = this.add.image(180, 135, 'ui_panel').setDisplaySize(210, 114);
    const title = addPixelText(this, 180, 96, 'ENTER INVITE CODE', 8, 0xf49ac1, 0.5, 0.5);

    this.codeBoxBg = this.add.rectangle(180, 126, 120, 22, 0x100d24).setStrokeStyle(1, 0xffe066);
    this.codeText = addPixelText(this, 180, 126, '', 16, 0xffe066, 0.5, 0.5);

    this.joinBtnBg = this.add.image(132, 164, 'ui_btn').setDisplaySize(82, 20);
    this.joinBtnTxt = addPixelText(this, 132, 164, 'JOIN', 8, 0xffffff, 0.5, 0.5);

    this.cancelBtnBg = this.add.image(228, 164, 'ui_btn').setDisplaySize(82, 20);
    this.cancelBtnTxt = addPixelText(this, 228, 164, 'CANCEL', 8, 0xffffff, 0.5, 0.5);

    if (!isMobileMode()) {
      this.codeBoxBg.setInteractive({ useHandCursor: true });
      this.codeBoxBg.on('pointerdown', () => {
        this.activeField = 'code';
        this.refreshTextboxes();
      });

      this.joinBtnBg.setInteractive({ useHandCursor: true });
      this.joinBtnBg.on('pointerover', () => this.joinBtnBg.setTexture('ui_btn_hover'));
      this.joinBtnBg.on('pointerout', () => this.joinBtnBg.setTexture('ui_btn'));
      this.joinBtnBg.on('pointerdown', () => this.submitJoinCode());

      this.cancelBtnBg.setInteractive({ useHandCursor: true });
      this.cancelBtnBg.on('pointerover', () => this.cancelBtnBg.setTexture('ui_btn_hover'));
      this.cancelBtnBg.on('pointerout', () => this.cancelBtnBg.setTexture('ui_btn'));
      this.cancelBtnBg.on('pointerdown', () => this.closeJoinModal());
    }

    this.joinModal.add([
      dim,
      panel,
      title,
      this.codeBoxBg,
      this.codeText,
      this.joinBtnBg,
      this.joinBtnTxt,
      this.cancelBtnBg,
      this.cancelBtnTxt,
    ]);
  }

  private openJoinModal(): void {
    this.joinCode = '';
    this.activeField = isMobileMode() ? 'none' : 'code';
    this.modalFocusIndex = 0;
    this.joinModal.setVisible(true);
    this.refreshTextboxes();
    if (isMobileMode()) {
      this.refreshMobileFocus();
    }
  }

  private closeJoinModal(): void {
    this.joinModal.setVisible(false);
    this.activeField = 'none';
    this.refreshTextboxes();
    if (isMobileMode()) {
      this.refreshMobileFocus();
    }
  }

  private submitJoinCode(): void {
    const code = this.joinCode.trim().toUpperCase();
    if (code.length < 4) {
      SoundSystem.playHit();
      return;
    }
    SoundSystem.playPickup();
    net.joinGame(code, this.playerName.trim() || 'Guest', this.getChosenAvatarId(), this.getChosenPetId());
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
    const isSteam = isSteamworksBuild();
    if (isSteam) {
      this.nameBoxBg.setVisible(false);
      this.nameText.setText(this.playerName || 'Wanderer').setTint(0x66ffd9);
    } else if (this.activeField === 'name') {
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

    if (isMobileMode()) {
      this.refreshMobileFocus();
    }
  }

  private createPixelButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.image(x, y, 'ui_btn').setDisplaySize(142, 19);
    const txt = addPixelText(this, x, y, label, 8, 0xffffff, 0.5, 0.5);
    this.menuButtons.push({ bg, txt, onClick });

    if (!isMobileMode()) {
      bg.setInteractive({ useHandCursor: true });
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
  }

  private getBottomHintText(): string {
    if (inputSystem.controlType === 'gamepad') {
      if (inputSystem.gamepadBrand === 'playstation') {
        return 'Stick/D-Pad: Navigate | Cross: Select | Circle: Back';
      }
      return 'Stick/D-Pad: Navigate | A: Select | B: Back';
    }
    if (inputSystem.controlType === 'touch') {
      return 'Stick/D-Pad: Navigate | E/Space: Select';
    }
    return 'WASD Move | Mouse Aim/Attack | Space Dodge | E Interact | Tab Map';
  }

  private handleMobileNav(dir: NavDir): void {
    if (this.virtualKeyboard?.visible) {
      this.virtualKeyboard.handleNav(dir);
      return;
    }

    SoundSystem.playSwing();
    if (this.joinModal.visible) {
      if (dir === 'up') {
        this.modalFocusIndex = 0;
      } else if (dir === 'down') {
        if (this.modalFocusIndex === 0) this.modalFocusIndex = 1;
        else this.modalFocusIndex = 0;
      } else if (dir === 'left' || dir === 'right') {
        if (this.modalFocusIndex === 1) this.modalFocusIndex = 2;
        else if (this.modalFocusIndex === 2) this.modalFocusIndex = 1;
      }
      this.refreshMobileFocus();
      return;
    }

    const lastBtnIdx = this.menuButtons.length - 1;
    const nameIdx = this.menuButtons.length;

    if (dir === 'up') {
      if (this.mobileFocusIndex === nameIdx) this.mobileFocusIndex = lastBtnIdx;
      else if (this.mobileFocusIndex === 0) this.mobileFocusIndex = lastBtnIdx;
      else this.mobileFocusIndex = this.mobileFocusIndex - 1;
    } else if (dir === 'down') {
      if (this.mobileFocusIndex === nameIdx) this.mobileFocusIndex = 0;
      else if (this.mobileFocusIndex === lastBtnIdx) this.mobileFocusIndex = 0;
      else this.mobileFocusIndex = this.mobileFocusIndex + 1;
    } else if (dir === 'left') {
      if (isSteamworksBuild()) {
        if (this.dlcUnlocked) this.cyclePalette(-1);
      } else if (this.mobileFocusIndex === nameIdx && this.dlcUnlocked) {
        this.cyclePalette(-1);
      } else {
        this.mobileFocusIndex = nameIdx;
      }
    } else if (dir === 'right') {
      if (isSteamworksBuild()) {
        this.mobileFocusIndex = 0;
      } else if (this.mobileFocusIndex === nameIdx && this.dlcUnlocked) {
        this.cyclePalette(1);
      } else if (this.mobileFocusIndex === nameIdx) {
        this.mobileFocusIndex = 0;
      }
    }
    this.refreshMobileFocus();
  }

  private handleMobileButton(btn: VirtualButton): void {
    if (this.virtualKeyboard?.visible) {
      this.virtualKeyboard.handleButton(btn);
      return;
    }

    if (btn === 'esc') {
      if (this.joinModal.visible) {
        SoundSystem.playHit();
        this.closeJoinModal();
      }
      return;
    }

    if (btn !== 'e' && btn !== 'space') return;

    if (this.joinModal.visible) {
      if (this.modalFocusIndex === 0) {
        SoundSystem.playSwing();
        this.virtualKeyboard?.open({
          title: 'ENTER INVITE CODE',
          initialValue: this.joinCode,
          maxLength: 4,
          uppercaseOnly: true,
          allowSymbols: false,
          onChange: (val) => {
            this.joinCode = val.toUpperCase();
            this.refreshTextboxes();
          },
          onEnter: (val) => {
            this.joinCode = val.trim().toUpperCase();
            this.refreshTextboxes();
            if (this.joinCode.length >= 4) {
              this.submitJoinCode();
            } else {
              this.modalFocusIndex = 1;
              this.refreshMobileFocus();
            }
          },
          onCancel: () => {
            this.refreshMobileFocus();
          },
        });
      } else if (this.modalFocusIndex === 1) {
        this.submitJoinCode();
      } else {
        this.closeJoinModal();
      }
      return;
    }

    const nameIdx = this.menuButtons.length;

    if (this.mobileFocusIndex === nameIdx && !isSteamworksBuild()) {
      if (!isMobileMode()) {
        this.activeField = this.activeField === 'name' ? 'none' : 'name';
        this.refreshTextboxes();
        return;
      }
      SoundSystem.playSwing();
      this.virtualKeyboard?.open({
        title: 'ENTER USERNAME',
        initialValue: this.playerName,
        maxLength: 12,
        uppercaseOnly: false,
        allowSymbols: true,
        onChange: (val) => {
          this.playerName = val;
          this.saveUsername();
          this.refreshTextboxes();
        },
        onEnter: (val) => {
          this.playerName = val.trim() || 'Wanderer';
          this.saveUsername();
          this.refreshTextboxes();
          this.refreshMobileFocus();
        },
        onCancel: () => {
          this.refreshMobileFocus();
        },
      });
      return;
    }

    this.menuButtons[this.mobileFocusIndex]?.onClick();
  }

  private refreshMobileFocus(): void {
    const showFocus = isMobileMode() || inputSystem.controlType === 'gamepad';
    const nameIdx = this.menuButtons.length;

    this.menuButtons.forEach((b, idx) => {
      const focused = showFocus && !this.joinModal.visible && this.mobileFocusIndex === idx;
      b.bg.setTexture(focused ? 'ui_btn_hover' : 'ui_btn');
      b.txt.setTint(focused ? 0xffe066 : 0xffffff);
    });

    if (showFocus && !this.joinModal.visible && this.mobileFocusIndex === nameIdx) {
      this.nameBoxBg.setStrokeStyle(2, 0xffe066);
      this.nameText.setTint(0xffe066);
    } else if (this.activeField !== 'name') {
      this.nameBoxBg.setStrokeStyle(1, 0x6c5bb3);
      this.nameText.setTint(0xffffff);
    }

    if (this.joinModal.visible && showFocus) {
      this.codeBoxBg.setStrokeStyle(this.modalFocusIndex === 0 ? 2 : 1, this.modalFocusIndex === 0 ? 0xffe066 : 0x6c5bb3);
      this.joinBtnBg.setTexture(this.modalFocusIndex === 1 ? 'ui_btn_hover' : 'ui_btn');
      this.joinBtnTxt.setTint(this.modalFocusIndex === 1 ? 0xffe066 : 0xffffff);
      this.cancelBtnBg.setTexture(this.modalFocusIndex === 2 ? 'ui_btn_hover' : 'ui_btn');
      this.cancelBtnTxt.setTint(this.modalFocusIndex === 2 ? 0xffe066 : 0xffffff);
    }
  }

  private getChosenAvatarId(): string {
    if (this.dlcUnlocked) {
      return ALL_SELECTABLE_AVATARS[this.selectedAvatarIndex]?.id ?? pickRandomPaletteId();
    }
    return pickRandomPaletteId();
  }

  private getChosenPetId(): string | null {
    if (!this.dlcUnlocked) return null;
    return getSavedPetId();
  }

  private applyDlcAvatarSelection(): void {
    const entry = ALL_SELECTABLE_AVATARS[this.selectedAvatarIndex] ?? ALL_SELECTABLE_AVATARS[0];
    if (this.previewSprite?.active) {
      this.previewSprite.setTexture(`player_${entry.id}`, 0);
    }
    this.skinsBtnBg?.setVisible(true);
    this.skinsBtnTxt?.setVisible(true);
    this.petsBtnBg?.setVisible(true);
    this.petsBtnTxt?.setVisible(true);

    const petId = this.getChosenPetId();
    const petDef = getPetById(petId);
    if (this.previewPetSprite?.active) {
      if (petDef) {
        this.previewPetSprite.setTexture(`pet_${petDef.id}`, 0).setVisible(true);
      } else {
        this.previewPetSprite.setVisible(false);
      }
    }
  }

  private cyclePalette(_dir: number): void {
    if (!this.dlcUnlocked || this.joinModal.visible) return;
    SoundSystem.playPickup();
    this.scene.start('SkinScene');
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
