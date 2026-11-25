import Phaser from 'phaser';
import { version } from '../../package.json';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { pickRandomPaletteId } from '../data/palettes';
import { isMobileMode, mobileInput, NavDir, VirtualButton } from '../mobile/MobileInput';
import { VirtualKeyboard } from '../mobile/VirtualKeyboard';
import { JournalSystem } from '../systems/JournalSystem';
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
  private joinBtnBg!: Phaser.GameObjects.Image;
  private joinBtnTxt!: Phaser.GameObjects.BitmapText;
  private cancelBtnBg!: Phaser.GameObjects.Image;
  private cancelBtnTxt!: Phaser.GameObjects.BitmapText;

  private menuButtons: Array<{ bg: Phaser.GameObjects.Image; txt: Phaser.GameObjects.BitmapText; onClick: () => void }> = [];
  private netToggleBg!: Phaser.GameObjects.Rectangle;
  private netToggleIcon!: Phaser.GameObjects.BitmapText;
  private netToggleLabel!: Phaser.GameObjects.BitmapText;
  private mobileFocusIndex = 0; // 0: PLAY SOLO, 1: CREATE CO-OP, 2: JOIN CO-OP, 3: JOURNAL, 4: NAME BOX, 5: NET SWITCH
  private modalFocusIndex = 0; // 0: CODE BOX, 1: JOIN, 2: CANCEL
  private virtualKeyboard?: VirtualKeyboard;
  private unsubNav?: () => void;
  private unsubBtn?: () => void;

  private cursorBlink = true;
  private fireflies: Array<{ sprite: Phaser.GameObjects.Image; vx: number; vy: number; phase: number }> = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    SoundSystem.stopBossEvilLaughLoop();
    SoundSystem.setMusicTrack('menu');
    net.disconnect();
    this.fireflies = [];
    this.menuButtons = [];
    this.activeField = 'none';
    this.joinCode = '';
    this.mobileFocusIndex = 0;
    this.modalFocusIndex = 0;
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
    this.nameBoxBg = this.add.rectangle(96, 186, 106, 18, 0x100d24).setStrokeStyle(1, 0x6c5bb3);
    this.nameText = addPixelText(this, 96, 186, this.playerName, 8, 0xffffff, 0.5, 0.5);

    if (!isMobileMode()) {
      this.nameBoxBg.setInteractive({ useHandCursor: true });
      this.nameBoxBg.on('pointerdown', () => {
        if (this.joinModal.visible) return;
        this.activeField = 'name';
        SoundSystem.playSwing();
        this.refreshTextboxes();
      });
    }

    this.createPixelButton(256, 92, 'PLAY SOLO', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      net.startSolo(this.playerName.trim() || 'Wanderer', pickRandomPaletteId());
      const seed = getDailySeed(0);
      this.scene.start('GameScene', { levelIndex: 0, floorSeed: seed, resetRun: true });
    });

    this.createPixelButton(256, 119, 'CREATE CO-OP', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      net.hostGame(this.playerName.trim() || 'Host', pickRandomPaletteId());
      this.scene.start('LobbyScene');
    });

    this.createPixelButton(256, 146, 'JOIN CO-OP', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      this.openJoinModal();
    });

    this.createPixelButton(256, 173, 'JOURNAL', () => {
      if (this.joinModal.visible) return;
      SoundSystem.playPickup();
      if (this.playerName === 'ADMIN') {
        JournalSystem.unlockAll();
      }
      this.scene.start('JournalScene');
    });

    // Tiny square button under JOURNAL to switch between Nostr (default) and MQTT
    this.netToggleBg = this.add
      .rectangle(216, 200, 14, 14, 0x100d24)
      .setStrokeStyle(1, 0x6c5bb3);
    this.netToggleIcon = addPixelText(this, 216, 200, 'N', 8, 0x66ffd9, 0.5, 0.5);
    this.netToggleLabel = addPixelText(this, 228, 200, 'NET: NOSTR', 8, 0xb8a1ff, 0, 0.5);
    this.refreshNetToggle();

    if (!isMobileMode()) {
      this.netToggleBg.setInteractive({ useHandCursor: true });
      this.netToggleBg.on('pointerover', () => this.netToggleBg.setStrokeStyle(1, 0xffe066));
      this.netToggleBg.on('pointerout', () => this.netToggleBg.setStrokeStyle(1, 0x6c5bb3));
      this.netToggleBg.on('pointerdown', () => this.toggleSignalingBackend());
    }

    addPixelText(
      this,
      180,
      248,
      isMobileMode()
        ? 'Stick/D-Pad: Navigate | E/Space: Select'
        : 'WASD Move | Mouse Aim/Attack | Space Dodge | E Interact | Tab Map',
      8,
      0x7e71b8,
      0.5,
      0.5,
      336
    );

    addPixelText(this, 354, 264, `v${version}`, 8, 0x7e71b8, 1, 1);

    this.buildJoinModal();

    if (isMobileMode()) {
      this.virtualKeyboard = new VirtualKeyboard(this);
      this.refreshMobileFocus();
      this.unsubNav = mobileInput.onNav((dir) => this.handleMobileNav(dir));
      this.unsubBtn = mobileInput.onButton((btn) => this.handleMobileButton(btn));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubNav?.();
        this.unsubBtn?.();
        this.virtualKeyboard?.destroy();
      });
    }

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
    net.joinGame(code, this.playerName.trim() || 'Guest', pickRandomPaletteId());
    this.scene.start('LobbyScene');
  }

  private toggleSignalingBackend(): void {
    if (this.joinModal.visible) return;
    SoundSystem.playSwing();
    const next = net.signalingBackend === 'nostr' ? 'mqtt' : 'nostr';
    net.setSignalingBackend(next);
    this.refreshNetToggle();
  }

  private refreshNetToggle(): void {
    const isMqtt = net.signalingBackend === 'mqtt';
    this.netToggleIcon.setText(isMqtt ? 'M' : 'N').setTint(isMqtt ? 0xffe066 : 0x66ffd9);
    this.netToggleLabel.setText(isMqtt ? 'NET: MQTT' : 'NET: NOSTR');
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

    if (isMobileMode()) {
      this.refreshMobileFocus();
    }
  }

  private createPixelButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.image(x, y, 'ui_btn').setDisplaySize(136, 22);
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

    if (dir === 'up') {
      if (this.mobileFocusIndex === 4) this.mobileFocusIndex = 3;
      else if (this.mobileFocusIndex === 5) this.mobileFocusIndex = 3;
      else if (this.mobileFocusIndex === 0) this.mobileFocusIndex = 5;
      else this.mobileFocusIndex = this.mobileFocusIndex - 1;
    } else if (dir === 'down') {
      if (this.mobileFocusIndex === 4) this.mobileFocusIndex = 0;
      else if (this.mobileFocusIndex === 3) this.mobileFocusIndex = 5;
      else if (this.mobileFocusIndex === 5) this.mobileFocusIndex = 0;
      else this.mobileFocusIndex = this.mobileFocusIndex + 1;
    } else if (dir === 'left') {
      this.mobileFocusIndex = 4;
    } else if (dir === 'right') {
      if (this.mobileFocusIndex === 4) this.mobileFocusIndex = 0;
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

    if (this.mobileFocusIndex === 4) {
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

    if (this.mobileFocusIndex === 5) {
      this.toggleSignalingBackend();
      return;
    }

    this.menuButtons[this.mobileFocusIndex]?.onClick();
  }

  private refreshMobileFocus(): void {
    if (!isMobileMode()) return;

    this.menuButtons.forEach((b, idx) => {
      const focused = !this.joinModal.visible && this.mobileFocusIndex === idx;
      b.bg.setTexture(focused ? 'ui_btn_hover' : 'ui_btn');
      b.txt.setTint(focused ? 0xffe066 : 0xffffff);
    });

    if (!this.joinModal.visible && this.mobileFocusIndex === 4) {
      this.nameBoxBg.setStrokeStyle(2, 0xffe066);
      this.nameText.setTint(0xffe066);
    } else {
      this.nameBoxBg.setStrokeStyle(1, 0x6c5bb3);
      this.nameText.setTint(0xffffff);
    }

    if (!this.joinModal.visible && this.mobileFocusIndex === 5) {
      this.netToggleBg.setStrokeStyle(2, 0xffe066);
    } else {
      this.netToggleBg.setStrokeStyle(1, 0x6c5bb3);
    }

    if (this.joinModal.visible) {
      this.codeBoxBg.setStrokeStyle(this.modalFocusIndex === 0 ? 2 : 1, this.modalFocusIndex === 0 ? 0xffe066 : 0x6c5bb3);
      this.joinBtnBg.setTexture(this.modalFocusIndex === 1 ? 'ui_btn_hover' : 'ui_btn');
      this.joinBtnTxt.setTint(this.modalFocusIndex === 1 ? 0xffe066 : 0xffffff);
      this.cancelBtnBg.setTexture(this.modalFocusIndex === 2 ? 'ui_btn_hover' : 'ui_btn');
      this.cancelBtnTxt.setTint(this.modalFocusIndex === 2 ? 0xffe066 : 0xffffff);
    }
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
