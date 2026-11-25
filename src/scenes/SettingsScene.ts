import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { NavDir, VirtualButton } from '../mobile/MobileInput';
import { getGamepadButtonTexture } from '../systems/ControlHints';
import { GameAction, GamepadBrand, GamepadButtonId, inputSystem } from '../systems/InputSystem';
import { net } from '../systems/MultiplayerSystem';
import { settingsSystem } from '../systems/SettingsSystem';

type SettingsTab = 'game' | 'audio' | 'gamepad' | 'keyboard';

interface SettingOptionRow {
  label: string;
  getValue: () => string;
  onChange: (dir: 1 | -1) => void;
  bg?: Phaser.GameObjects.Rectangle;
  valTxt?: Phaser.GameObjects.BitmapText;
  lblTxt?: Phaser.GameObjects.BitmapText;
}

export class SettingsScene extends Phaser.Scene {
  private activeTab: SettingsTab = 'game';
  private focusArea: 'tabs' | 'list' | 'back' = 'list';
  private tabFocusIdx = 0;
  private listFocusIdx = 0;
  private bottomFocusIdx = 0; // 0: BACK, 1: CREDITS

  private tabButtons: Array<{ tab: SettingsTab; bg: Phaser.GameObjects.Image; txt: Phaser.GameObjects.BitmapText }> = [];
  private padStatusTxt!: Phaser.GameObjects.BitmapText;
  private backBtn!: Phaser.GameObjects.Image;
  private backTxt!: Phaser.GameObjects.BitmapText;
  private creditsBtn!: Phaser.GameObjects.Image;
  private creditsTxt!: Phaser.GameObjects.BitmapText;
  private creditsOverlay!: Phaser.GameObjects.Container;

  private contentContainer!: Phaser.GameObjects.Container;
  private optionRows: SettingOptionRow[] = [];
  private prevLayoutBtn?: Phaser.GameObjects.Image;
  private nextLayoutBtn?: Phaser.GameObjects.Image;
  private prevLayoutTxt?: Phaser.GameObjects.BitmapText;
  private nextLayoutTxt?: Phaser.GameObjects.BitmapText;

  private unsubNav?: () => void;
  private unsubBtn?: () => void;
  private lastPadConnected = false;
  private lastPadBrand: GamepadBrand = 'xbox';

  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    this.activeTab = 'game';
    this.tabFocusIdx = 0;
    this.focusArea = 'list';
    this.listFocusIdx = 0;
    this.tabButtons = [];
    this.optionRows = [];
    this.lastPadConnected = inputSystem.isGamepadConnected();
    this.lastPadBrand = inputSystem.gamepadBrand;

    this.add.rectangle(180, 135, 360, 270, 0x0e0c21);

    addPixelText(this, 16, 16, 'SETTINGS', 16, 0xf49ac1, 0, 0.5);
    this.padStatusTxt = addPixelText(this, 344, 16, '', 8, 0x66ffd9, 1, 0.5);
    this.refreshPadStatus();

    const tabs: Array<{ tab: SettingsTab; label: string; x: number }> = [
      { tab: 'game', label: 'GAME', x: 54 },
      { tab: 'audio', label: 'AUDIO', x: 138 },
      { tab: 'gamepad', label: 'GAMEPAD', x: 222 },
      { tab: 'keyboard', label: 'KEYS', x: 306 },
    ];
    for (const t of tabs) {
      const bg = this.add.image(t.x, 38, 'ui_btn').setDisplaySize(78, 18);
      const txt = addPixelText(this, t.x, 38, t.label, 8, 0xffffff, 0.5, 0.5);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.selectTab(t.tab);
      });
      this.tabButtons.push({ tab: t.tab, bg, txt });
    }

    this.add.rectangle(180, 143, 336, 174, 0x181430).setStrokeStyle(2, 0x5d4e9e);
    this.contentContainer = this.add.container(0, 0);

    this.backBtn = this.add.image(124, 248, 'ui_btn').setDisplaySize(96, 18);
    this.backTxt = addPixelText(this, 124, 248, 'BACK', 8, 0xffffff, 0.5, 0.5);
    const onBack = () => {
      if (this.creditsOverlay?.visible) {
        this.closeCreditsModal();
        return;
      }
      SoundSystem.playHit();
      this.scene.start('MenuScene');
    };
    this.backBtn.setInteractive({ useHandCursor: true }).on('pointerdown', onBack);
    this.backBtn.on('pointerover', () => {
      this.backBtn.setTexture('ui_btn_hover');
      this.backTxt.setTint(0xffe066);
    });
    this.backBtn.on('pointerout', () => this.refreshFocus());

    this.creditsBtn = this.add.image(236, 248, 'ui_btn').setDisplaySize(96, 18);
    this.creditsTxt = addPixelText(this, 236, 248, 'CREDITS', 8, 0xffffff, 0.5, 0.5);
    this.creditsBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openCreditsModal());
    this.creditsBtn.on('pointerover', () => {
      this.creditsBtn.setTexture('ui_btn_hover');
      this.creditsTxt.setTint(0xffe066);
    });
    this.creditsBtn.on('pointerout', () => this.refreshFocus());

    this.buildCreditsOverlay();

    this.input.keyboard?.on('keydown-ESC', onBack);
    this.input.keyboard?.on('keydown-TAB', (ev: KeyboardEvent) => {
      if (this.creditsOverlay.visible) return;
      ev.preventDefault();
      const nextIdx = (this.tabFocusIdx + 1) % this.tabButtons.length;
      this.selectTab(this.tabButtons[nextIdx].tab);
    });
    this.input.keyboard?.on('keydown-LEFT', () => {
      if (this.creditsOverlay.visible) return;
      if (this.activeTab === 'gamepad') {
        this.changeLayout(-1);
      } else if (this.optionRows.length > 0) {
        this.optionRows[this.listFocusIdx]?.onChange(-1);
        this.refreshOptionValues();
      }
    });
    this.input.keyboard?.on('keydown-RIGHT', () => {
      if (this.creditsOverlay.visible) return;
      if (this.activeTab === 'gamepad') {
        this.changeLayout(1);
      } else if (this.optionRows.length > 0) {
        this.optionRows[this.listFocusIdx]?.onChange(1);
        this.refreshOptionValues();
      }
    });
    this.input.keyboard?.on('keydown-UP', () => {
      if (this.creditsOverlay.visible) return;
      if (this.optionRows.length > 0) {
        SoundSystem.playSwing();
        this.listFocusIdx = (this.listFocusIdx - 1 + this.optionRows.length) % this.optionRows.length;
        this.refreshFocus();
      }
    });
    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.creditsOverlay.visible) return;
      if (this.optionRows.length > 0) {
        SoundSystem.playSwing();
        this.listFocusIdx = (this.listFocusIdx + 1) % this.optionRows.length;
        this.refreshFocus();
      }
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.creditsOverlay.visible) {
        this.closeCreditsModal();
        return;
      }
      if (this.optionRows.length > 0) {
        this.optionRows[this.listFocusIdx]?.onChange(1);
        this.refreshOptionValues();
      }
    });

    this.unsubNav = inputSystem.onNav((dir) => this.handleNav(dir));
    this.unsubBtn = inputSystem.onButton((btn) => this.handleButton(btn));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubNav?.();
      this.unsubBtn?.();
    });

    this.renderContent();
    this.refreshFocus();
  }

  private selectTab(tab: SettingsTab): void {
    if (this.activeTab === tab) return;
    SoundSystem.playSwing();
    this.activeTab = tab;
    this.tabFocusIdx = this.tabButtons.findIndex((b) => b.tab === tab);
    this.listFocusIdx = 0;
    this.focusArea = tab === 'keyboard' ? 'tabs' : 'list';
    this.renderContent();
    this.refreshFocus();
  }

  private changeLayout(dir: 1 | -1): void {
    SoundSystem.playPickup();
    inputSystem.cycleLayout(dir);
    this.renderContent();
    this.refreshFocus();
  }

  private handleNav(dir: NavDir): void {
    if (this.creditsOverlay.visible) return;
    SoundSystem.playSwing();
    if (this.focusArea === 'tabs') {
      if (dir === 'left') {
        this.tabFocusIdx = (this.tabFocusIdx - 1 + this.tabButtons.length) % this.tabButtons.length;
        this.activeTab = this.tabButtons[this.tabFocusIdx].tab;
        this.listFocusIdx = 0;
        this.renderContent();
      } else if (dir === 'right') {
        this.tabFocusIdx = (this.tabFocusIdx + 1) % this.tabButtons.length;
        this.activeTab = this.tabButtons[this.tabFocusIdx].tab;
        this.listFocusIdx = 0;
        this.renderContent();
      } else if (dir === 'down') {
        this.focusArea = this.activeTab === 'keyboard' ? 'back' : 'list';
      } else if (dir === 'up') {
        this.focusArea = 'back';
      }
    } else if (this.focusArea === 'list') {
      if (this.activeTab === 'gamepad') {
        if (dir === 'left') this.changeLayout(-1);
        else if (dir === 'right') this.changeLayout(1);
        else if (dir === 'up') this.focusArea = 'tabs';
        else if (dir === 'down') this.focusArea = 'back';
      } else if (this.optionRows.length > 0) {
        if (dir === 'left') {
          this.optionRows[this.listFocusIdx]?.onChange(-1);
          this.refreshOptionValues();
        } else if (dir === 'right') {
          this.optionRows[this.listFocusIdx]?.onChange(1);
          this.refreshOptionValues();
        } else if (dir === 'up') {
          if (this.listFocusIdx > 0) this.listFocusIdx--;
          else this.focusArea = 'tabs';
        } else if (dir === 'down') {
          if (this.listFocusIdx + 1 < this.optionRows.length) this.listFocusIdx++;
          else this.focusArea = 'back';
        }
      } else {
        this.focusArea = 'back';
      }
    } else if (this.focusArea === 'back') {
      if (dir === 'left' || dir === 'right') {
        this.bottomFocusIdx = this.bottomFocusIdx === 0 ? 1 : 0;
      } else if (dir === 'up') {
        this.focusArea = this.activeTab === 'keyboard' ? 'tabs' : 'list';
      } else if (dir === 'down') {
        this.focusArea = 'tabs';
      }
    }
    this.refreshFocus();
  }

  private handleButton(btn: VirtualButton): void {
    if (this.creditsOverlay.visible) {
      if (btn === 'esc' || btn === 'e' || btn === 'space') {
        this.closeCreditsModal();
      }
      return;
    }
    if (btn === 'esc') {
      SoundSystem.playHit();
      this.scene.start('MenuScene');
      return;
    }
    if (btn === 'prevSlot') {
      const next = (this.tabFocusIdx - 1 + this.tabButtons.length) % this.tabButtons.length;
      this.selectTab(this.tabButtons[next].tab);
      return;
    }
    if (btn === 'nextSlot') {
      const next = (this.tabFocusIdx + 1) % this.tabButtons.length;
      this.selectTab(this.tabButtons[next].tab);
      return;
    }
    if (btn !== 'e' && btn !== 'space') return;

    if (this.focusArea === 'tabs') {
      this.selectTab(this.tabButtons[this.tabFocusIdx].tab);
    } else if (this.focusArea === 'list') {
      if (this.activeTab === 'gamepad') {
        this.changeLayout(1);
      } else {
        this.optionRows[this.listFocusIdx]?.onChange(1);
        this.refreshOptionValues();
      }
    } else if (this.focusArea === 'back') {
      if (this.bottomFocusIdx === 1) {
        this.openCreditsModal();
      } else {
        SoundSystem.playHit();
        this.scene.start('MenuScene');
      }
    }
  }

  private buildCreditsOverlay(): void {
    this.creditsOverlay = this.add.container(0, 0).setVisible(false).setDepth(40);
    const dim = this.add.rectangle(180, 135, 360, 270, 0x0b0917, 0.85).setInteractive();
    const panel = this.add.rectangle(180, 135, 316, 186, 0x181430).setStrokeStyle(2, 0x5d4e9e);
    const heading = addPixelText(this, 180, 62, 'GLIMMERDEEP', 10, 0xf49ac1, 0.5, 0.5);
    const body = addPixelText(
      this,
      180,
      130,
      [
        'Written by Faraaz Jan',
        'Developed by Faraaz Jan',
        'Created using Phaser',
        'Multiplayer by Trystero',
        '',
        'Music licensed from MOJI,',
        'NearTheAtmosphere, and David Renda',
        '',
        'Audio licensed from Vsessa,',
        'SolarPhasing, jeckkech, and Electrobuz',
      ].join('\n'),
      6,
      0xffffff,
      0.5,
      0.5,
      300
    );
    const closeBtn = this.add.image(180, 206, 'ui_btn_hover').setDisplaySize(96, 18);
    const closeTxt = addPixelText(this, 180, 206, 'CLOSE', 8, 0xffe066, 0.5, 0.5);
    closeBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.closeCreditsModal());

    this.creditsOverlay.add([dim, panel, heading, body, closeBtn, closeTxt]);
  }

  private openCreditsModal(): void {
    SoundSystem.playPickup();
    this.creditsOverlay.setVisible(true);
  }

  private closeCreditsModal(): void {
    SoundSystem.playHit();
    this.creditsOverlay.setVisible(false);
  }

  private refreshPadStatus(): void {
    const connected = inputSystem.isGamepadConnected();
    const brandLabel = inputSystem.gamepadBrand === 'playstation' ? 'PS' : 'XBOX';
    this.padStatusTxt
      .setText(connected ? `PAD: ${brandLabel}` : 'PAD: NONE')
      .setTint(connected ? 0x66ffd9 : 0x7e71b8);
  }

  private refreshOptionValues(): void {
    for (const r of this.optionRows) {
      r.valTxt?.setText(r.getValue());
    }
  }

  private refreshFocus(): void {
    this.tabButtons.forEach((b, idx) => {
      const selected = b.tab === this.activeTab;
      const focused = this.focusArea === 'tabs' && idx === this.tabFocusIdx;
      b.bg.setTexture(selected || focused ? 'ui_btn_hover' : 'ui_btn');
      b.txt.setTint(focused ? 0xffe066 : selected ? 0xf49ac1 : 0xffffff);
    });

    this.optionRows.forEach((r, idx) => {
      const focused = this.focusArea === 'list' && idx === this.listFocusIdx;
      r.bg?.setStrokeStyle(focused ? 2 : 1, focused ? 0xffe066 : 0x4a3b7d);
      r.lblTxt?.setTint(focused ? 0xffe066 : 0xffffff);
    });

    if (this.prevLayoutBtn && this.nextLayoutBtn && this.prevLayoutTxt && this.nextLayoutTxt) {
      const layoutFocused = this.focusArea === 'list' && this.activeTab === 'gamepad';
      this.prevLayoutBtn.setTexture(layoutFocused ? 'ui_btn_hover' : 'ui_btn');
      this.nextLayoutBtn.setTexture(layoutFocused ? 'ui_btn_hover' : 'ui_btn');
      this.prevLayoutTxt.setTint(layoutFocused ? 0xffe066 : 0xffffff);
      this.nextLayoutTxt.setTint(layoutFocused ? 0xffe066 : 0xffffff);
    }

    const backFocused = this.focusArea === 'back' && this.bottomFocusIdx === 0;
    this.backBtn.setTexture(backFocused ? 'ui_btn_hover' : 'ui_btn');
    this.backTxt.setTint(backFocused ? 0xffe066 : 0xffffff);

    const creditsFocused = this.focusArea === 'back' && this.bottomFocusIdx === 1;
    this.creditsBtn.setTexture(creditsFocused ? 'ui_btn_hover' : 'ui_btn');
    this.creditsTxt.setTint(creditsFocused ? 0xffe066 : 0xffffff);
  }

  private renderContent(): void {
    this.contentContainer.removeAll(true);
    this.optionRows = [];
    this.prevLayoutBtn = undefined;
    this.nextLayoutBtn = undefined;
    this.prevLayoutTxt = undefined;
    this.nextLayoutTxt = undefined;

    if (this.activeTab === 'game') {
      this.renderGameTab();
    } else if (this.activeTab === 'audio') {
      this.renderAudioTab();
    } else if (this.activeTab === 'gamepad') {
      this.renderGamepadTab();
    } else {
      this.renderKeyboardTab();
    }
  }

  private renderOptionList(titleStr: string, defs: SettingOptionRow[]): void {
    const title = addPixelText(this, 180, 68, titleStr, 8, 0xffe066, 0.5, 0.5);
    this.contentContainer.add(title);

    defs.forEach((def, idx) => {
      const y = 90 + idx * 23;
      const bg = this.add.rectangle(180, y, 304, 19, 0x100d24).setStrokeStyle(1, 0x4a3b7d);
      const lblTxt = addPixelText(this, 40, y, def.label, 8, 0xffffff, 0, 0.5);
      const valTxt = addPixelText(this, 318, y, def.getValue(), 8, 0x66ffd9, 1, 0.5);

      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.focusArea = 'list';
        this.listFocusIdx = idx;
        def.onChange(1);
        this.refreshOptionValues();
        this.refreshFocus();
      });

      def.bg = bg;
      def.lblTxt = lblTxt;
      def.valTxt = valTxt;
      this.optionRows.push(def);
      this.contentContainer.add([bg, lblTxt, valTxt]);
    });
  }

  private renderGameTab(): void {
    this.renderOptionList('GRAPHICS & NETWORK', [
      {
        label: 'FULLSCREEN',
        getValue: () => (this.scale.isFullscreen ? 'ON' : 'OFF'),
        onChange: () => {
          SoundSystem.playSwing();
          if (this.scale.isFullscreen) this.scale.stopFullscreen();
          else this.scale.startFullscreen();
        },
      },
      {
        label: 'SCREEN SHAKE',
        getValue: () => (settingsSystem.current.screenShake ? 'ON' : 'OFF'),
        onChange: () => {
          SoundSystem.playSwing();
          settingsSystem.update({ screenShake: !settingsSystem.current.screenShake });
        },
      },
      {
        label: 'PARTICLES',
        getValue: () => (settingsSystem.current.particles === 'full' ? 'FULL' : 'REDUCED'),
        onChange: () => {
          SoundSystem.playSwing();
          settingsSystem.update({
            particles: settingsSystem.current.particles === 'full' ? 'reduced' : 'full',
          });
        },
      },
      {
        label: 'CRT SCANLINES',
        getValue: () => (settingsSystem.current.crtScanlines ? 'ON' : 'OFF'),
        onChange: () => {
          SoundSystem.playSwing();
          settingsSystem.update({ crtScanlines: !settingsSystem.current.crtScanlines });
        },
      },
      {
        label: 'CONTROL HINTS',
        getValue: () => (settingsSystem.current.showControlHints ? 'ON' : 'OFF'),
        onChange: () => {
          SoundSystem.playSwing();
          settingsSystem.update({ showControlHints: !settingsSystem.current.showControlHints });
        },
      },
      {
        label: 'CO-OP NETWORK',
        getValue: () => (net.signalingBackend === 'mqtt' ? 'MQTT' : 'NOSTR'),
        onChange: () => {
          SoundSystem.playPickup();
          net.setSignalingBackend(net.signalingBackend === 'nostr' ? 'mqtt' : 'nostr');
        },
      },
    ]);
  }

  private renderAudioTab(): void {
    const stepVolume = (cur: number, dir: 1 | -1): number => {
      const next = cur + dir * 20;
      if (next > 100) return 0;
      if (next < 0) return 100;
      return next;
    };

    this.renderOptionList('AUDIO SETTINGS', [
      {
        label: 'MASTER AUDIO',
        getValue: () => (settingsSystem.current.muted ? 'MUTED' : 'ON'),
        onChange: () => {
          settingsSystem.update({ muted: !settingsSystem.current.muted });
          if (!settingsSystem.current.muted) SoundSystem.playPickup();
        },
      },
      {
        label: 'MUSIC VOLUME',
        getValue: () => `< ${settingsSystem.current.musicVolume}% >`,
        onChange: (dir) => {
          SoundSystem.playSwing();
          settingsSystem.update({
            musicVolume: stepVolume(settingsSystem.current.musicVolume, dir),
          });
        },
      },
      {
        label: 'SFX VOLUME',
        getValue: () => `< ${settingsSystem.current.sfxVolume}% >`,
        onChange: (dir) => {
          settingsSystem.update({
            sfxVolume: stepVolume(settingsSystem.current.sfxVolume, dir),
          });
          SoundSystem.playPickup();
        },
      },
      {
        label: 'TEST SOUND',
        getValue: () => '[PLAY]',
        onChange: () => {
          SoundSystem.playUnlock();
        },
      },
    ]);
  }

  private renderGamepadTab(): void {
    const layout = inputSystem.layout;
    const isPs = inputSystem.gamepadBrand === 'playstation';
    const descStr = isPs
      ? layout.id === 'twin_stick'
        ? 'L-Stick Move, R-Stick Aim, R2/Sq Attack'
        : layout.id === 'bumper'
          ? 'L-Stick Move, R-Stick Aim, R1/L1 Atk'
          : 'R-Stick Move, L-Stick Aim, L2/Sq Attack'
      : layout.description;

    // Layout selector row
    const lbl = addPixelText(this, 24, 68, 'LAYOUT:', 8, 0xb8a1ff, 0, 0.5);
    const prevBtn = this.add.image(118, 68, 'ui_btn').setDisplaySize(22, 16);
    const prevTxt = addPixelText(this, 118, 68, '<', 8, 0xffffff, 0.5, 0.5);
    const layoutName = addPixelText(this, 198, 68, layout.name, 8, 0xffe066, 0.5, 0.5);
    const nextBtn = this.add.image(278, 68, 'ui_btn').setDisplaySize(22, 16);
    const nextTxt = addPixelText(this, 278, 68, '>', 8, 0xffffff, 0.5, 0.5);
    const idxTxt = addPixelText(this, 336, 68, `${inputSystem.layoutIndex + 1}/3`, 8, 0x9d8ce0, 1, 0.5);
    const descTxt = addPixelText(this, 180, 84, descStr, 8, 0x66ffd9, 0.5, 0.5, 326);

    prevBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.changeLayout(-1));
    nextBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.changeLayout(1));
    this.prevLayoutBtn = prevBtn;
    this.nextLayoutBtn = nextBtn;
    this.prevLayoutTxt = prevTxt;
    this.nextLayoutTxt = nextTxt;

    this.contentContainer.add([lbl, prevBtn, prevTxt, layoutName, nextBtn, nextTxt, idxTxt, descTxt]);

    // Controller Diagram in center (cx=180, cy=152)
    const cx = 180;
    const cy = 154;
    const gfx = this.add.graphics();

    // Grips & controller body silhouette
    gfx.fillStyle(0x100d24, 1);
    gfx.fillRoundedRect(cx - 50, cy - 22, 100, 38, 10);
    gfx.fillRoundedRect(cx - 52, cy - 4, 24, 34, 8);
    gfx.fillRoundedRect(cx + 28, cy - 4, 24, 34, 8);

    gfx.lineStyle(1, 0x6c5bb3, 1);
    gfx.strokeRoundedRect(cx - 50, cy - 22, 100, 38, 10);

    // Inner body fill
    gfx.fillStyle(0x1f193d, 1);
    gfx.fillRoundedRect(cx - 48, cy - 20, 96, 34, 8);

    // Shoulder bumps
    gfx.fillStyle(0x2e2459, 1);
    gfx.fillRect(cx - 42, cy - 25, 18, 4);
    gfx.fillRect(cx + 24, cy - 25, 18, 4);

    // Icons on controller silhouette
    const lsIcon = this.add.image(cx - 32, cy - 7, 'pad_ls');
    const dpadIcon = this.add.image(cx - 18, cy + 7, 'pad_dpad');
    const rsIcon = this.add.image(cx + 18, cy + 7, 'pad_rs');
    const btnY = this.add.image(cx + 33, cy - 13, getGamepadButtonTexture('Y')).setScale(0.75);
    const btnB = this.add.image(cx + 40, cy - 7, getGamepadButtonTexture('B')).setScale(0.75);
    const btnA = this.add.image(cx + 33, cy - 1, getGamepadButtonTexture('A')).setScale(0.75);
    const btnX = this.add.image(cx + 26, cy - 7, getGamepadButtonTexture('X')).setScale(0.75);
    const backIcon = this.add.image(cx - 8, cy - 8, getGamepadButtonTexture('BACK')).setScale(0.7);
    const startIcon = this.add.image(cx + 8, cy - 8, getGamepadButtonTexture('START')).setScale(0.7);

    this.contentContainer.add([
      gfx,
      lsIcon,
      dpadIcon,
      rsIcon,
      btnY,
      btnB,
      btnA,
      btnX,
      backIcon,
      startIcon,
    ]);

    // Build reverse map from button -> short action label
    const actionShort: Record<GameAction, string> = {
      attack: 'ATTACK',
      secondary: 'ALT ATK',
      dodge: 'DODGE',
      interact: 'INTERACT',
      drop: 'DROP',
      prevSlot: 'PREV SLOT',
      nextSlot: 'NEXT SLOT',
      map: 'MAP',
      pause: 'PAUSE',
    };

    const btnLabel = (b: GamepadButtonId): string => {
      for (const [act, mapped] of Object.entries(layout.bindings)) {
        if (mapped === b) return actionShort[act as GameAction];
      }
      if (layout.altAttack === b) return 'ATTACK';
      return '-';
    };

    const addCallout = (iconKey: string, text: string, ix: number, iy: number, alignRight: boolean, lineToX?: number, lineToY?: number) => {
      const ic = this.add.image(ix, iy, iconKey);
      const tx = alignRight ? ix - 11 : ix + 11;
      const t = addPixelText(this, tx, iy, text, 8, 0xffffff, alignRight ? 1 : 0, 0.5);
      if (lineToX !== undefined && lineToY !== undefined) {
        gfx.lineStyle(1, 0x5d4e9e, 0.7);
        gfx.lineBetween(ix + (alignRight ? 7 : -7), iy, lineToX, lineToY);
      }
      this.contentContainer.add([ic, t]);
    };

    // Left callouts (x = 106, right-aligned text to the left)
    addCallout(getGamepadButtonTexture('LT'), btnLabel('LT'), 106, 106, true, cx - 36, cy - 24);
    addCallout(getGamepadButtonTexture('LB'), btnLabel('LB'), 106, 122, true, cx - 36, cy - 21);
    addCallout('pad_ls', layout.moveStick === 'left' ? 'MOVE' : 'AIM', 106, 144, true, cx - 36, cy - 7);
    addCallout('pad_dpad', 'NAV / MOVE', 106, 166, true, cx - 22, cy + 7);
    addCallout(getGamepadButtonTexture('BACK'), btnLabel('BACK'), 106, 188, true, cx - 8, cy - 4);

    // Right callouts (x = 250, left-aligned text to the right)
    addCallout(getGamepadButtonTexture('RT'), btnLabel('RT'), 250, 106, false, cx + 36, cy - 24);
    addCallout(getGamepadButtonTexture('RB'), btnLabel('RB'), 250, 122, false, cx + 36, cy - 21);
    addCallout(getGamepadButtonTexture('Y'), btnLabel('Y'), 250, 138, false, cx + 36, cy - 13);
    addCallout(getGamepadButtonTexture('B'), btnLabel('B'), 250, 152, false, cx + 43, cy - 7);
    addCallout(getGamepadButtonTexture('A'), btnLabel('A'), 250, 166, false, cx + 36, cy - 1);
    addCallout(getGamepadButtonTexture('X'), btnLabel('X'), 250, 180, false, cx + 29, cy - 7);
    addCallout('pad_rs', layout.aimStick === 'right' ? 'AIM' : 'MOVE', 250, 198, false, cx + 22, cy + 7);

    // Bottom center Start callout
    const stIc = this.add.image(154, 212, getGamepadButtonTexture('START'));
    const stTxt = addPixelText(this, 166, 212, btnLabel('START'), 8, 0xf49ac1, 0, 0.5);
    this.contentContainer.add([stIc, stTxt]);
  }

  private renderKeyboardTab(): void {
    const title = addPixelText(this, 180, 68, 'KEYBOARD & MOUSE CONTROLS', 8, 0xffe066, 0.5, 0.5);
    this.contentContainer.add(title);

    // Left column: WASD cluster + Movement
    const wasdW = this.add.image(56, 94, 'key_w');
    const wasdA = this.add.image(44, 107, 'key_a');
    const wasdS = this.add.image(56, 107, 'key_s');
    const wasdD = this.add.image(68, 107, 'key_d');
    const moveLbl = addPixelText(this, 82, 103, 'MOVE', 8, 0xffffff, 0, 0.5);

    const addKeyRow = (x: number, y: number, keyTex: string, label: string, offset = 16) => {
      const icon = this.add.image(x, y, keyTex);
      const txt = addPixelText(this, x + offset, y, label, 8, 0xffffff, 0, 0.5);
      this.contentContainer.add([icon, txt]);
    };

    addKeyRow(56, 132, 'key_space', 'DODGE', 16);
    addKeyRow(56, 152, 'key_e', 'INTERACT', 16);
    addKeyRow(56, 172, 'key_q', 'DROP ITEM', 16);
    addKeyRow(56, 192, 'key_tab', 'FULL MAP', 16);
    addKeyRow(56, 212, 'key_esc', 'PAUSE / BACK', 16);

    // Right column: Slots + Mouse Diagram
    const k1 = this.add.image(210, 98, 'key_1');
    const k2 = this.add.image(223, 98, 'key_2');
    const k3 = this.add.image(236, 98, 'key_3');
    const slotLbl = addPixelText(this, 248, 98, 'EQUIP SLOT', 8, 0xffffff, 0, 0.5);

    // Mouse graphic
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x5d4e9e, 0.5);
    gfx.lineBetween(190, 86, 190, 218);

    addKeyRow(223, 132, 'mouse_lmb', 'ATTACK / USE', 14);
    addKeyRow(223, 154, 'mouse_rmb', 'ALT ACTION', 14);
    addKeyRow(223, 176, 'mouse_scroll', 'CYCLE SLOTS', 14);

    const aimNote = addPixelText(this, 265, 206, 'CURSOR: AIM', 8, 0x66ffd9, 0.5, 0.5);

    this.contentContainer.add([
      wasdW,
      wasdA,
      wasdS,
      wasdD,
      moveLbl,
      k1,
      k2,
      k3,
      slotLbl,
      gfx,
      aimNote,
    ]);
  }

  update(): void {
    const connected = inputSystem.isGamepadConnected();
    const brand = inputSystem.gamepadBrand;
    if (connected !== this.lastPadConnected || brand !== this.lastPadBrand) {
      this.lastPadConnected = connected;
      this.lastPadBrand = brand;
      this.refreshPadStatus();
      if (this.activeTab === 'gamepad') {
        this.renderContent();
        this.refreshFocus();
      }
    }
  }
}
