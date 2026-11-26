import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { ALL_SELECTABLE_AVATARS, PLAYER_PALETTES } from '../data/palettes';
import { getSavedPetId } from '../data/pets';
import { NavDir, VirtualButton } from '../mobile/MobileInput';
import { inputSystem, localCoopSession, LocalPlayerConfig } from '../systems/InputSystem';
import { net } from '../systems/MultiplayerSystem';
import { steamSystem } from '../systems/SteamSystem';
import { getDailySeed } from '../utils/SeededGenerator';
import { AVATAR_STORAGE_KEY } from './SkinScene';

interface SlotUI {
  panel: Phaser.GameObjects.Rectangle;
  sprite: Phaser.GameObjects.Sprite;
  prevBtn: Phaser.GameObjects.BitmapText;
  nextBtn: Phaser.GameObjects.BitmapText;
  titleTxt: Phaser.GameObjects.BitmapText;
  statusTxt: Phaser.GameObjects.BitmapText;
  subTxt: Phaser.GameObjects.BitmapText;
}

export class LocalLobbyScene extends Phaser.Scene {
  private slots: Array<LocalPlayerConfig | null> = [null, null, null, null];
  private slotUIs: SlotUI[] = [];
  private usedPadIndices = new Set<number>();

  private startBtn!: Phaser.GameObjects.Image;
  private startTxt!: Phaser.GameObjects.BitmapText;
  private backBtn!: Phaser.GameObjects.Image;
  private backTxt!: Phaser.GameObjects.BitmapText;
  private statusHint!: Phaser.GameObjects.BitmapText;
  private createdAtMs = 0;
  private dlcUnlocked = false;
  private hostPlayerName = 'Local Co-op';
  private focusArea: 'slots' | 'bottom' = 'slots';
  private bottomFocusIdx: 0 | 1 = 0; // 0: BACK, 1: START RUN
  private unsubNav?: () => void;
  private unsubBtn?: () => void;
  private unsubCtrl?: () => void;

  constructor() {
    super({ key: 'LocalLobbyScene' });
  }

  create(data?: { playerName?: string }): void {
    this.slots = [null, null, null, null];
    this.slotUIs = [];
    this.usedPadIndices.clear();
    this.createdAtMs = performance.now();
    this.dlcUnlocked = steamSystem.isAvatarDlcUnlocked();
    let resolvedName = data?.playerName?.trim() || '';
    if (!resolvedName) {
      try {
        resolvedName = localStorage.getItem('glimmerdeep_username')?.trim() || '';
      } catch {
        // ignore storage errors
      }
    }
    this.hostPlayerName = resolvedName || 'Local Co-op';
    this.focusArea = 'slots';
    this.bottomFocusIdx = 0;
    localCoopSession.active = false;
    localCoopSession.players = [];

    this.add.rectangle(180, 135, 360, 270, 0x0e0c21);

    addPixelText(this, 180, 20, 'LOCAL CO-OP', 16, 0xf49ac1, 0.5, 0.5);
    addPixelText(
      this,
      180,
      38,
      'SHARED SCREEN - CONNECT GAMEPADS TO JOIN',
      8,
      0xb8a1ff,
      0.5,
      0.5
    );

    const cardCoords = [
      { x: 96, y: 88 },
      { x: 264, y: 88 },
      { x: 96, y: 160 },
      { x: 264, y: 160 },
    ];

    for (let i = 0; i < 4; i++) {
      const { x, y } = cardCoords[i];
      const pal = PLAYER_PALETTES[i % PLAYER_PALETTES.length];
      const panel = this.add.rectangle(x, y, 152, 62, 0x181430).setStrokeStyle(2, 0x4a3b7d);
      const sprite = this.add.sprite(x - 50, y, `player_${pal.id}`, 0).setScale(2).setAlpha(0.28);
      const prevBtn = addPixelText(this, x - 67, y, '<', 8, 0xffe066, 0.5, 0.5).setVisible(false);
      const nextBtn = addPixelText(this, x - 33, y, '>', 8, 0xffe066, 0.5, 0.5).setVisible(false);
      prevBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.cyclePlayerSkin(i, -1));
      nextBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.cyclePlayerSkin(i, 1));
      const titleTxt = addPixelText(this, x - 24, y - 16, `PLAYER ${i + 1}`, 8, 0xffe066, 0, 0.5);
      const statusTxt = addPixelText(this, x - 24, y, 'PRESS GAMEPAD', 8, 0x7e71b8, 0, 0.5);
      const subTxt = addPixelText(this, x - 24, y + 13, 'BUTTON TO JOIN', 8, 0x7e71b8, 0, 0.5);
      this.slotUIs.push({ panel, sprite, prevBtn, nextBtn, titleTxt, statusTxt, subTxt });
    }

    this.statusHint = addPixelText(this, 180, 208, 'WAITING FOR PLAYERS...', 8, 0x9d8ce0, 0.5, 0.5);

    this.backBtn = this.add.image(112, 238, 'ui_btn').setDisplaySize(108, 22);
    this.backTxt = addPixelText(this, 112, 238, 'BACK', 8, 0xffffff, 0.5, 0.5);
    this.backBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.goBack());
    this.backBtn.on('pointerover', () => {
      this.backBtn.setTexture('ui_btn_hover');
      this.backTxt.setTint(0xffe066);
    });
    this.backBtn.on('pointerout', () => {
      this.backBtn.setTexture('ui_btn');
      this.backTxt.setTint(0xffffff);
    });

    this.startBtn = this.add.image(248, 238, 'ui_btn').setDisplaySize(120, 22).setAlpha(0.45);
    this.startTxt = addPixelText(this, 248, 238, 'START RUN', 8, 0x9d8ce0, 0.5, 0.5);
    this.startBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.tryStartRun());
    this.startBtn.on('pointerover', () => {
      if (this.getJoinedPlayers().length >= 2) {
        this.startBtn.setTexture('ui_btn_hover');
        this.startTxt.setTint(0xffe066);
      }
    });
    this.startBtn.on('pointerout', () => this.refreshUI());

    // Hidden P1 keyboard join via SPACE (intentionally not advertised in UI)
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.slots[0] === null) {
        this.slots[0] = {
          slotIndex: 0,
          name: 'P1',
          paletteId: this.getDefaultPaletteForSlot(0),
          inputType: 'keyboard',
          padIndex: -1,
        };
        SoundSystem.playPickup();
        this.refreshUI();
      }
    });

    this.input.keyboard?.on('keydown-LEFT', () => {
      if (this.focusArea === 'slots' && this.slots[0]?.inputType === 'keyboard') {
        this.cyclePlayerSkin(0, -1);
      }
    });
    this.input.keyboard?.on('keydown-RIGHT', () => {
      if (this.focusArea === 'slots' && this.slots[0]?.inputType === 'keyboard') {
        this.cyclePlayerSkin(0, 1);
      }
    });
    this.input.keyboard?.on('keydown-A', () => {
      if (this.focusArea === 'slots' && this.slots[0]?.inputType === 'keyboard') {
        this.cyclePlayerSkin(0, -1);
      }
    });
    this.input.keyboard?.on('keydown-D', () => {
      if (this.focusArea === 'slots' && this.slots[0]?.inputType === 'keyboard') {
        this.cyclePlayerSkin(0, 1);
      }
    });

    this.input.keyboard?.on('keydown-ENTER', () => {
      this.tryStartRun();
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      this.goBack();
    });

    this.unsubNav = inputSystem.onNav((dir) => this.handleNav(dir));
    this.unsubBtn = inputSystem.onButton((btn) => this.handleButton(btn));
    this.unsubCtrl = inputSystem.onControlTypeChange(() => this.refreshUI());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubNav?.();
      this.unsubBtn?.();
      this.unsubCtrl?.();
    });

    if (!this.dlcUnlocked) {
      void steamSystem.refreshDlcStatus().then((unlocked) => {
        if (unlocked && this.scene.isActive('LocalLobbyScene')) {
          this.dlcUnlocked = true;
          this.refreshUI();
        }
      });
    }

    this.refreshUI();
  }

  private getDefaultPaletteForSlot(slotIndex: number): string {
    if (slotIndex === 0 && this.dlcUnlocked) {
      try {
        const saved = localStorage.getItem(AVATAR_STORAGE_KEY);
        if (saved && ALL_SELECTABLE_AVATARS.some((a) => a.id === saved)) {
          return saved;
        }
      } catch {
        // ignore storage errors
      }
    }
    return PLAYER_PALETTES[slotIndex % PLAYER_PALETTES.length].id;
  }

  private cyclePlayerSkin(slotIndex: number, dir: -1 | 1): void {
    const cfg = this.slots[slotIndex];
    if (!cfg) return;
    const pool = this.dlcUnlocked
      ? ALL_SELECTABLE_AVATARS
      : ALL_SELECTABLE_AVATARS.filter((a) => !a.isDlc);
    const curIdx = pool.findIndex((a) => a.id === cfg.paletteId);
    const len = pool.length;
    const nextIdx = (((curIdx >= 0 ? curIdx : 0) + dir) % len + len) % len;
    cfg.paletteId = pool[nextIdx].id;
    SoundSystem.playSwing();
    this.refreshUI();
  }

  private getJoinedPlayers(): LocalPlayerConfig[] {
    return this.slots.filter((s): s is LocalPlayerConfig => s !== null);
  }

  private goBack(): void {
    SoundSystem.playHit();
    localCoopSession.active = false;
    localCoopSession.players = [];
    this.scene.start('MenuScene');
  }

  private tryStartRun(): void {
    const joined = this.getJoinedPlayers();
    if (joined.length < 2) {
      SoundSystem.playHit();
      return;
    }
    SoundSystem.playUnlock();
    localCoopSession.active = true;
    localCoopSession.players = joined;
    net.startSolo(this.hostPlayerName, joined[0].paletteId, steamSystem.isAvatarDlcUnlocked() ? getSavedPetId() : null);
    const seed = getDailySeed(0);
    this.scene.start('GameScene', { levelIndex: 0, floorSeed: seed, resetRun: true });
  }

  private handleNav(dir: NavDir): void {
    if (performance.now() - this.createdAtMs < 250) return;
    if (dir === 'up' || dir === 'down') {
      SoundSystem.playSwing();
      if (this.focusArea === 'slots') {
        this.focusArea = 'bottom';
        this.bottomFocusIdx = this.getJoinedPlayers().length >= 2 ? 1 : 0;
      } else {
        this.focusArea = 'slots';
      }
      this.refreshUI();
      return;
    }

    if (this.focusArea === 'bottom' && (dir === 'left' || dir === 'right')) {
      SoundSystem.playSwing();
      this.bottomFocusIdx = this.bottomFocusIdx === 0 ? 1 : 0;
      this.refreshUI();
    }
  }

  private handleButton(btn: VirtualButton): void {
    if (performance.now() - this.createdAtMs < 250) return;
    if (btn === 'esc') {
      this.goBack();
      return;
    }
    if (btn === 'e' || btn === 'space') {
      if (this.focusArea === 'bottom') {
        if (this.bottomFocusIdx === 0) {
          this.goBack();
        } else {
          this.tryStartRun();
        }
      }
    }
  }

  private refreshUI(): void {
    for (let i = 0; i < 4; i++) {
      const cfg = this.slots[i];
      const ui = this.slotUIs[i];
      if (cfg) {
        ui.panel.setStrokeStyle(2, 0x66ffd9);
        ui.sprite.setTexture(`player_${cfg.paletteId}`, 1).setAlpha(1);
        ui.prevBtn.setVisible(true).setAlpha(this.focusArea === 'slots' ? 1 : 0.3);
        ui.nextBtn.setVisible(true).setAlpha(this.focusArea === 'slots' ? 1 : 0.3);
        ui.statusTxt.setText('JOINED!').setTint(0x66ffd9);
        const skinLabel = ALL_SELECTABLE_AVATARS.find((a) => a.id === cfg.paletteId)?.label ?? cfg.paletteId.toUpperCase();
        ui.subTxt.setText(skinLabel).setTint(0xffe066);
      } else {
        const defPal = PLAYER_PALETTES[i % PLAYER_PALETTES.length];
        ui.panel.setStrokeStyle(2, 0x4a3b7d);
        ui.sprite.setTexture(`player_${defPal.id}`, 0).setAlpha(0.28);
        ui.prevBtn.setVisible(false);
        ui.nextBtn.setVisible(false);
        ui.statusTxt.setText('PRESS GAMEPAD').setTint(0x7e71b8);
        ui.subTxt.setText('BUTTON TO JOIN').setTint(0x7e71b8);
      }
    }

    const count = this.getJoinedPlayers().length;
    const showFocus = inputSystem.controlType === 'gamepad';
    const backFocused = showFocus && this.focusArea === 'bottom' && this.bottomFocusIdx === 0;
    const startFocused = showFocus && this.focusArea === 'bottom' && this.bottomFocusIdx === 1;

    this.backBtn.setTexture(backFocused ? 'ui_btn_hover' : 'ui_btn');
    this.backTxt.setTint(backFocused ? 0xffe066 : 0xffffff);

    if (count >= 2) {
      this.statusHint
        .setText(`${count} PLAYERS READY - PRESS START`)
        .setTint(0x66ffd9);
      this.startBtn.setAlpha(1).setTexture(startFocused ? 'ui_btn_hover' : 'ui_btn');
      this.startTxt.setTint(startFocused ? 0xffe066 : 0xffffff);
    } else if (count === 1) {
      this.statusHint.setText('NEED AT LEAST 2 PLAYERS TO START').setTint(0xffe066);
      this.startBtn.setAlpha(0.45).setTexture(startFocused ? 'ui_btn_hover' : 'ui_btn');
      this.startTxt.setTint(startFocused ? 0xffe066 : 0x9d8ce0);
    } else {
      this.statusHint.setText('WAITING FOR PLAYERS (MIN 2)...').setTint(0x9d8ce0);
      this.startBtn.setAlpha(0.45).setTexture(startFocused ? 'ui_btn_hover' : 'ui_btn');
      this.startTxt.setTint(startFocused ? 0xffe066 : 0x9d8ce0);
    }
  }

  update(): void {
    // Small grace period so the button press used to enter Local Co-op doesn't instantly join/start
    if (performance.now() - this.createdAtMs < 250) return;

    // Check if any already-joined gamepad P1 pressed Start to begin
    const p1 = this.slots[0];
    if (p1 && p1.inputType === 'gamepad') {
      if (inputSystem.consumePadAction(p1.padIndex, 'pause')) {
        this.tryStartRun();
        return;
      }
    }

    // Allow joined gamepad players to cycle their skins with Left/Right only when slots are focused
    for (let i = 0; i < 4; i++) {
      const cfg = this.slots[i];
      if (!cfg || cfg.inputType !== 'gamepad') continue;
      const dir = inputSystem.consumePadNavHorizontal(cfg.padIndex);
      if (this.focusArea === 'slots' && dir !== 0) {
        this.cyclePlayerSkin(i, dir);
      }
    }

    // Check if any unassigned gamepad pressed a button to join
    const newPadIdx = inputSystem.consumeAnyPadJoin(this.usedPadIndices);
    if (newPadIdx !== null) {
      const emptyIdx = this.slots.findIndex((s) => s === null);
      if (emptyIdx !== -1) {
        this.usedPadIndices.add(newPadIdx);
        this.slots[emptyIdx] = {
          slotIndex: emptyIdx,
          name: `P${emptyIdx + 1}`,
          paletteId: this.getDefaultPaletteForSlot(emptyIdx),
          inputType: 'gamepad',
          padIndex: newPadIdx,
        };
        SoundSystem.playPickup();
        this.refreshUI();
      }
    }
  }
}
