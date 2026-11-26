import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { BIOMES, LEVEL_MODIFIERS } from '../data/biomes';
import { applyRarityTextStyle, ARTIFACTS, CONSUMABLES, STATUS_EFFECTS } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { isMobileMode, mobileInput, NavDir, VirtualButton } from '../mobile/MobileInput';
import { VirtualKeyboard } from '../mobile/VirtualKeyboard';
import { getControlIconTexture, getGamepadButtonTexture } from '../systems/ControlHints';
import { GameAction, inputSystem, localCoopSession } from '../systems/InputSystem';
import { net } from '../systems/MultiplayerSystem';
import { filterProfanity, settingsSystem } from '../systems/SettingsSystem';
import { isSteamworksBuild, steamSystem } from '../systems/SteamSystem';
import { PlayerStateSnapshot, RoomData, ShopStockItem } from '../types/game';

export interface UIStatePayload {
  player: PlayerStateSnapshot;
  allies: PlayerStateSnapshot[];
  localPlayers?: PlayerStateSnapshot[];
  levelIndex: number;
  modifierId: string;
  rooms: RoomData[][];
  currentRoom: RoomData;
  bossInfo: { name: string; hp: number; maxHp: number; accent: number } | null;
  promptText: string;
  localPrompts?: string[];
  localInputTypes?: Array<'keyboard' | 'gamepad'>;
  runElapsedMs?: number;
  spectating?: { targetName: string; count: number } | null;
}

export class UIScene extends Phaser.Scene {
  private heartSprites: Phaser.GameObjects.Image[] = [];
  private shieldContainer!: Phaser.GameObjects.Container;
  private shieldSprites: Phaser.GameObjects.Image[] = [];
  private stamSprites: Phaser.GameObjects.Image[] = [];
  private shardText!: Phaser.GameObjects.BitmapText;
  private statusContainer!: Phaser.GameObjects.Container;
  private statusBadges: Phaser.GameObjects.Rectangle[] = [];
  private speedrunTxt!: Phaser.GameObjects.BitmapText;
  private allyContainer!: Phaser.GameObjects.Container;
  private allyLabels: Phaser.GameObjects.BitmapText[] = [];

  private slotBgs: Phaser.GameObjects.Image[] = [];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private slotBars: Phaser.GameObjects.Graphics[] = [];
  private slotKeyIcons: Phaser.GameObjects.Image[] = [];
  private slotBumperHints: Phaser.GameObjects.Image[] = [];
  private selectedLabel!: Phaser.GameObjects.BitmapText;
  private selectedDescLabel!: Phaser.GameObjects.BitmapText;
  private lastSelectedRarityKey: string | null = null;
  private hintRows: Array<{ action: GameAction; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.BitmapText }> = [];

  private minimapPanel!: Phaser.GameObjects.Image;
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private roomCoordTxt!: Phaser.GameObjects.BitmapText;
  private shardIcon!: Phaser.GameObjects.Image;
  private singlePlayerNodes: Phaser.GameObjects.GameObject[] = [];
  private localCornerHUDs: Array<{
    container: Phaser.GameObjects.Container;
    nameTxt: Phaser.GameObjects.BitmapText;
    shardTxt: Phaser.GameObjects.BitmapText;
    itemTxt: Phaser.GameObjects.BitmapText;
    promptBg: Phaser.GameObjects.Rectangle;
    promptIcon: Phaser.GameObjects.Image;
    promptTxt: Phaser.GameObjects.BitmapText;
    slotBgs: Phaser.GameObjects.Image[];
    slotIcons: Phaser.GameObjects.Image[];
    slotBars: Phaser.GameObjects.Graphics[];
    hearts: Phaser.GameObjects.Image[];
    shields: Phaser.GameObjects.Image[];
    stams: Phaser.GameObjects.Image[];
  }> = [];
  private bossContainer!: Phaser.GameObjects.Container;
  private bossNameTxt!: Phaser.GameObjects.BitmapText;
  private bossBarGfx!: Phaser.GameObjects.Graphics;

  private promptBg!: Phaser.GameObjects.Rectangle;
  private promptIcon!: Phaser.GameObjects.Image;
  private promptTxt!: Phaser.GameObjects.BitmapText;
  private toastTxt!: Phaser.GameObjects.BitmapText;
  private toastTimer?: Phaser.Time.TimerEvent;

  private mapOverlay!: Phaser.GameObjects.Container;
  private mapGfx!: Phaser.GameObjects.Graphics;
  private mapTitleTxt!: Phaser.GameObjects.BitmapText;
  private mapModTxt!: Phaser.GameObjects.BitmapText;

  private shopOverlay!: Phaser.GameObjects.Container;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private spectateBar!: Phaser.GameObjects.Container;
  private spectateTxt!: Phaser.GameObjects.BitmapText;
  private spectatePrevBtn!: Phaser.GameObjects.Image;
  private spectateNextBtn!: Phaser.GameObjects.Image;

  private lastPayload: UIStatePayload | null = null;
  private onBuyCallback?: (idx: number) => void;
  private onQuitCallback?: () => void;
  private onSkipTutorialCallback?: () => void;
  private onPauseChangeCallback?: (paused: boolean) => void;
  private onSpectatePrev?: () => void;
  private onSpectateNext?: () => void;

  private pauseButtons: Array<{ bg: Phaser.GameObjects.Image; txt: Phaser.GameObjects.BitmapText; action: () => void }> = [];
  private basePauseButtons: Array<{ bg: Phaser.GameObjects.Image; txt: Phaser.GameObjects.BitmapText; action: () => void }> = [];
  private skipTutorialPauseBtn?: { bg: Phaser.GameObjects.Image; txt: Phaser.GameObjects.BitmapText; action: () => void };
  private pausePanel!: Phaser.GameObjects.Rectangle;
  private pauseTitleTxt!: Phaser.GameObjects.BitmapText;
  private pausePlayersPanel!: Phaser.GameObjects.Container;
  private pausePlayersList!: Phaser.GameObjects.Container;
  private pauseFocusIndex = 0;

  private shopCards: Array<{ card: Phaser.GameObjects.Image; sold: boolean; idx: number }> = [];
  private shopCloseTxt?: Phaser.GameObjects.BitmapText;
  private shopFocusRing?: Phaser.GameObjects.Rectangle;
  private overlayOpenedFrame = -1;
  private shopClosedFrame = -1;
  private shopFocusIndex = 0; // 0..2 = cards, 3 = CLOSE
  private unsubNav?: () => void;
  private unsubBtn?: () => void;
  private unsubCtrl?: () => void;

  // Online Co-op Chat UI
  private virtualKeyboard?: VirtualKeyboard;
  private iconUrlCache = new Map<string, string>();
  private chatInputContainer!: Phaser.GameObjects.Container;
  private chatInputTxt!: Phaser.GameObjects.BitmapText;
  private chatTyping = false;
  private chatDraft = '';
  private chatBlink = true;
  private chatMessages: Array<{
    container: Phaser.GameObjects.Container;
    height: number;
    timer?: Phaser.Time.TimerEvent;
  }> = [];

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    const syncUiCamera = () => {
      const uiScale = this.scale.width / 360;
      this.cameras.main.setZoom(uiScale);
      this.cameras.main.centerOn(180, 135);
    };
    syncUiCamera();
    this.scale.on('resize', syncUiCamera);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', syncUiCamera);
    });

    // Left margin: Bigger 3-slot Inventory stacked vertically + item name & description
    this.slotBgs = [];
    this.slotIcons = [];
    this.slotBars = [];
    this.slotKeyIcons = [];
    this.slotBumperHints = [];
    for (let i = 0; i < 3; i++) {
      const sx = 38;
      const sy = 32 + i * 40;
      const bg = this.add.image(sx, sy, 'ui_slot').setScale(1.5);
      const icon = this.add.image(sx, sy - 2, 'item_moonblade').setScale(1.5).setVisible(false);
      const bar = this.add.graphics();
      const keyIcon = this.add.image(sx - 15, sy - 11, `key_${i + 1}`).setScale(0.85);
      this.slotBgs.push(bg);
      this.slotIcons.push(icon);
      this.slotBars.push(bar);
      this.slotKeyIcons.push(keyIcon);
    }

    const lbHint = this.add.image(16, 12, 'pad_lb').setScale(0.85).setVisible(false);
    const rbHint = this.add.image(16, 132, 'pad_rb').setScale(0.85).setVisible(false);
    this.slotBumperHints.push(lbHint, rbHint);

    this.selectedLabel = addPixelText(this, 38, 138, '', 8, 0xffffff, 0.5, 0, 68);
    this.selectedDescLabel = addPixelText(this, 38, 160, '', 8, 0xb8a1ff, 0.5, 0, 68);

    // Compact live control hints in bottom-left margin
    this.hintRows = [];
    const hintDefs: Array<{ action: GameAction; label: string; y: number }> = [
      { action: 'drop', label: 'DROP', y: 220 },
      { action: 'dodge', label: 'DASH', y: 235 },
      { action: 'map', label: 'MAP', y: 250 },
    ];
    for (const hd of hintDefs) {
      const icon = this.add.image(20, hd.y, getControlIconTexture(hd.action)).setScale(0.95);
      const label = addPixelText(this, 35, hd.y, hd.label, 8, 0x9d8ce0, 0, 0.5);
      this.hintRows.push({ action: hd.action, icon, label });
    }
    this.refreshControlHints();

    // Right margin: Compact 6x6 Minimap + Room Coordinate Label (A1..F6)
    this.minimapPanel = this.add.image(323, 32, 'ui_panel').setDisplaySize(50, 50).setAlpha(0.88);
    this.minimapGfx = this.add.graphics();
    this.roomCoordTxt = addPixelText(this, 323, 61, 'A3', 8, 0xffe066, 0.5, 0);

    // Right margin (under map): up to 10 Hearts (2 rows of 5 = up to 20 HP), Shields, Stamina, Shards, Status, Allies
    this.heartSprites = [];
    for (let i = 0; i < 10; i++) {
      const hx = 294 + (i % 5) * 11;
      const hy = 76 + Math.floor(i / 5) * 10;
      const h = this.add.image(hx, hy, 'ui_heart_full');
      this.heartSprites.push(h);
    }

    this.shieldContainer = this.add.container(294, 97);
    this.shieldSprites = [];
    for (let i = 0; i < 6; i++) {
      const sh = this.add.image(i * 8, 0, 'ui_shield').setVisible(false);
      this.shieldContainer.add(sh);
      this.shieldSprites.push(sh);
    }

    this.stamSprites = [];
    for (let i = 0; i < 4; i++) {
      const s = this.add.image(294 + i * 9, 108, 'ui_stam_full');
      this.stamSprites.push(s);
    }

    this.shardIcon = this.add.image(333, 108, 'item_shard').setScale(0.75);
    this.shardText = addPixelText(this, 340, 104, '0', 8, 0x6ef3ff, 0, 0);

    this.statusContainer = this.add.container(292, 120);
    this.statusBadges = [];
    for (let i = 0; i < 4; i++) {
      const badge = this.add.rectangle(i * 18 + 4, 3, 6, 6, 0xffffff).setStrokeStyle(1, 0x100d24).setVisible(false);
      this.statusContainer.add(badge);
      this.statusBadges.push(badge);
    }

    this.allyContainer = this.add.container(292, 134);
    this.allyLabels = [];
    for (let i = 0; i < 3; i++) {
      const txt = addPixelText(this, 0, i * 11, '', 8, 0xb8a1ff, 0, 0).setVisible(false);
      this.allyContainer.add(txt);
      this.allyLabels.push(txt);
    }

    this.speedrunTxt = addPixelText(this, 292, 132, '00:00.000', 8, 0xffe066, 0, 0).setVisible(false);

    this.singlePlayerNodes = isMobileMode()
      ? [this.allyContainer]
      : [
          ...this.slotBgs,
          ...this.slotIcons,
          ...this.slotBars,
          ...this.slotKeyIcons,
          ...this.slotBumperHints,
          this.selectedLabel,
          this.selectedDescLabel,
          ...this.hintRows.flatMap((r) => [r.icon, r.label]),
          ...this.heartSprites,
          this.shieldContainer,
          ...this.stamSprites,
          this.shardIcon,
          this.shardText,
          this.statusContainer,
          this.allyContainer,
        ];

    this.buildLocalCornerHUDs();

    // Bottom center (below room) for prompts & toasts
    this.promptBg = this.add.rectangle(180, 254, 180, 14, 0x100d24, 0.85).setVisible(false);
    this.promptIcon = this.add.image(180, 254, 'key_e').setScale(0.95).setVisible(false);
    this.promptTxt = addPixelText(this, 180, 254, '', 8, 0xffffff, 0, 0.5, 220).setVisible(false);

    this.toastTxt = addPixelText(this, 180, 12, '', 8, 0x66ffd9, 0.5, 0, 220).setDepth(20).setVisible(false);

    // Top-center Boss HP Bar
    this.bossContainer = this.add.container(180, 14).setVisible(false);
    const bossBg = this.add.image(0, 4, 'ui_panel').setDisplaySize(176, 18);
    this.bossNameTxt = addPixelText(this, 0, -2, '', 8, 0xf49ac1, 0.5, 0.5);
    this.bossBarGfx = this.add.graphics();
    this.bossContainer.add([bossBg, this.bossNameTxt, this.bossBarGfx]);

    this.buildMapOverlay();
    this.buildShopOverlay();
    this.buildPauseOverlay();
    this.buildSpectateBar();
    this.buildChatUI();

    this.unsubNav = inputSystem.onNav((dir) => this.handleMobileNav(dir));
    this.unsubBtn = inputSystem.onButton((btn) => this.handleMobileButton(btn));
    this.unsubCtrl = inputSystem.onControlTypeChange(() => {
      this.refreshControlHints();
      this.refreshPauseFocus();
      this.refreshShopFocus();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubNav?.();
      this.unsubBtn?.();
      this.unsubCtrl?.();
      this.virtualKeyboard?.destroy();
      if (isMobileMode()) {
        mobileInput.setHudState({ inGame: false, activeSlot: 0, inventory: [null, null, null] });
      }
    });

    if (isMobileMode()) {
      for (let i = 0; i < 3; i++) {
        this.slotBgs[i].setVisible(false);
        this.slotIcons[i].setVisible(false);
        this.slotBars[i].setVisible(false);
        this.slotKeyIcons[i].setVisible(false);
      }
      this.slotBumperHints.forEach((h) => h.setVisible(false));
      this.selectedLabel.setVisible(false);
      this.selectedDescLabel.setVisible(false);
      this.hintRows.forEach((r) => {
        r.icon.setVisible(false);
        r.label.setVisible(false);
      });
      this.heartSprites.forEach((h) => h.setVisible(false));
      this.shieldContainer.setVisible(false);
      this.stamSprites.forEach((s) => s.setVisible(false));
      this.shardIcon.setVisible(false);
      this.shardText.setVisible(false);
      this.statusContainer.setVisible(false);
      mobileInput.setHudState({ inGame: true });
    }
  }

  private getIconDataUrl(iconKey: string): string {
    const cached = this.iconUrlCache.get(iconKey);
    if (cached !== undefined) return cached;
    try {
      const tex = this.textures.get(iconKey);
      const img = tex?.getSourceImage() as HTMLCanvasElement | HTMLImageElement | undefined;
      if (img && typeof (img as HTMLCanvasElement).toDataURL === 'function') {
        const url = (img as HTMLCanvasElement).toDataURL();
        this.iconUrlCache.set(iconKey, url);
        return url;
      }
    } catch {
      // ignore
    }
    this.iconUrlCache.set(iconKey, '');
    return '';
  }

  private buildSpectateBar(): void {
    this.spectateBar = this.add.container(0, 0).setVisible(false).setDepth(25);
    const bg = this.add.rectangle(180, 250, 184, 22, 0x100d24, 0.9).setStrokeStyle(1, 0x66ffd9, 0.7);
    this.spectatePrevBtn = this.add.image(102, 250, 'ui_btn').setDisplaySize(22, 16);
    const prevTxt = addPixelText(this, 102, 250, '<', 8, 0xffffff, 0.5, 0.5);
    this.spectateNextBtn = this.add.image(258, 250, 'ui_btn').setDisplaySize(22, 16);
    const nextTxt = addPixelText(this, 258, 250, '>', 8, 0xffffff, 0.5, 0.5);
    this.spectateTxt = addPixelText(this, 180, 250, '', 8, 0xffe066, 0.5, 0.5, 130);

    if (!isMobileMode()) {
      this.spectatePrevBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onSpectatePrev?.());
      this.spectateNextBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onSpectateNext?.());
    }

    this.spectateBar.add([bg, this.spectatePrevBtn, prevTxt, this.spectateNextBtn, nextTxt, this.spectateTxt]);
  }

  setSpectateHandlers(onPrev: () => void, onNext: () => void): void {
    this.onSpectatePrev = onPrev;
    this.onSpectateNext = onNext;
  }

  private buildChatUI(): void {
    this.chatMessages = [];
    this.chatTyping = false;
    this.chatDraft = '';
    this.virtualKeyboard = new VirtualKeyboard(this);

    // Bottom-right focused chat textbox
    this.chatInputContainer = this.add.container(0, 0).setDepth(85).setVisible(false);
    const boxBg = this.add.rectangle(290, 256, 130, 15, 0x100d24, 0.94).setStrokeStyle(1, 0xffe066);
    this.chatInputTxt = addPixelText(this, 229, 256, '_', 8, 0xffffff, 0, 0.5);
    this.chatInputContainer.add([boxBg, this.chatInputTxt]);

    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        this.chatBlink = !this.chatBlink;
        if (this.chatTyping) this.refreshChatInput();
      },
    });

    const onWindowKeyDown = (ev: KeyboardEvent) => {
      if (!this.chatTyping) return;
      ev.stopPropagation();
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.closeChatKeyboard();
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const text = this.chatDraft;
        this.closeChatKeyboard();
        this.submitChatMessage(text);
        return;
      }
      if (ev.key === 'Backspace') {
        ev.preventDefault();
        this.chatDraft = this.chatDraft.slice(0, -1);
        this.refreshChatInput();
        return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key.length === 1 && this.chatDraft.length < 42) {
        this.chatDraft += ev.key;
        this.refreshChatInput();
      }
    };
    window.addEventListener('keydown', onWindowKeyDown, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onWindowKeyDown, true);
    });
  }

  private refreshChatInput(): void {
    if (!this.chatInputTxt?.active) return;
    const cursor = this.chatBlink ? '_' : ' ';
    const visibleSlice = this.chatDraft.length > 18 ? this.chatDraft.slice(-18) : this.chatDraft;
    this.chatInputTxt.setText(`${visibleSlice}${cursor}`);
  }

  public isChatOpen(): boolean {
    return this.chatTyping || !!this.virtualKeyboard?.visible;
  }

  public openChatKeyboard(): void {
    if (net.mode === 'solo' || localCoopSession.active || this.isChatOpen()) return;
    this.chatTyping = true;
    this.chatDraft = '';
    this.chatBlink = true;
    this.chatInputContainer.setVisible(true);
    this.refreshChatInput();
    SoundSystem.playSwing();
  }

  public closeChatKeyboard(): void {
    this.chatTyping = false;
    this.chatDraft = '';
    this.chatInputContainer.setVisible(false);
  }

  public openChatGamepad(): void {
    if (net.mode === 'solo' || localCoopSession.active || this.isChatOpen()) return;
    SoundSystem.playSwing();
    this.virtualKeyboard?.open({
      title: 'TEAM CHAT',
      initialValue: '',
      maxLength: 42,
      uppercaseOnly: false,
      allowSymbols: true,
      onEnter: (val) => {
        this.submitChatMessage(val);
      },
    });
  }

  private submitChatMessage(raw: string): void {
    const sent = net.broadcastChat(raw);
    if (sent) {
      SoundSystem.playPickup();
      this.addChatMessage(sent.sender, sent.text);
    }
  }

  public addChatMessage(sender: string, text: string): void {
    if (!this.scene.isActive('UIScene')) return;
    const container = this.add.container(0, 0).setDepth(80);
    const filtered = settingsSystem.current.filterMessages ? filterProfanity(text) : text;
    const display = `${sender.slice(0, 10)}: ${filtered}`;
    const txt = addPixelText(this, 354, 0, display, 6, 0xffffff, 1, 0.5, 148);
    const h = Math.max(8, txt.height + 2);
    container.add([txt]);

    const entry: { container: Phaser.GameObjects.Container; height: number; timer?: Phaser.Time.TimerEvent } = {
      container,
      height: h,
    };
    this.chatMessages.push(entry);

    while (this.chatMessages.length > 5) {
      const oldest = this.chatMessages.shift();
      oldest?.timer?.remove(false);
      oldest?.container.destroy();
    }

    this.layoutChatMessages();

    entry.timer = this.time.delayedCall(10000, () => {
      if (!entry.container.active) return;
      this.tweens.add({
        targets: entry.container,
        alpha: 0,
        duration: 450,
        onComplete: () => {
          const idx = this.chatMessages.indexOf(entry);
          if (idx !== -1) this.chatMessages.splice(idx, 1);
          entry.container.destroy();
          this.layoutChatMessages();
        },
      });
    });
  }

  private layoutChatMessages(): void {
    let bottomY = 244;
    for (let i = this.chatMessages.length - 1; i >= 0; i--) {
      const item = this.chatMessages[i];
      if (!item.container.active) continue;
      const cy = Math.round(bottomY - item.height / 2);
      item.container.setY(cy);
      bottomY -= item.height + 2;
    }
  }

  private buildMapOverlay(): void {
    this.mapOverlay = this.add.container(0, 0).setVisible(false).setDepth(50);
    const dim = this.add.rectangle(180, 135, 360, 270, 0x0b0917, 0.72);
    const panel = this.add.image(180, 135, 'ui_panel').setDisplaySize(260, 196);
    this.mapTitleTxt = addPixelText(this, 180, 50, '', 8, 0xf49ac1, 0.5, 0.5, 240);
    this.mapModTxt = addPixelText(this, 180, 64, '', 8, 0x66ffd9, 0.5, 0.5, 236);
    this.mapGfx = this.add.graphics();
    const legend = addPixelText(
      this,
      180,
      216,
      'You: Gold  Boss: Pink  Shop: Cyan  Heal: Mint',
      8,
      0xb8a1ff,
      0.5,
      0.5,
      240
    );

    this.mapOverlay.add([dim, panel, this.mapTitleTxt, this.mapModTxt, this.mapGfx, legend]);
  }

  private buildShopOverlay(): void {
    this.shopOverlay = this.add.container(0, 0).setVisible(false).setDepth(60);
  }

  private buildPauseOverlay(): void {
    this.pauseOverlay = this.add.container(0, 0).setVisible(false).setDepth(70);
    this.pauseButtons = [];
    this.basePauseButtons = [];
    const dim = this.add.rectangle(180, 135, 360, 270, 0x0b0917, 0.75);
    this.pausePanel = this.add.rectangle(180, 135, 180, 138, 0x181430, 0.96).setStrokeStyle(2, 0x5d4e9e);
    this.pauseTitleTxt = addPixelText(this, 180, 80, 'PAUSED', 8, 0xf49ac1, 0.5, 0.5);

    const mkBtn = (y: number, label: string, cb: () => void, includeInBase = true) => {
      const b = this.add.image(180, y, 'ui_btn').setDisplaySize(128, 20);
      const t = addPixelText(this, 180, y, label, 8, 0xffffff, 0.5, 0.5);
      if (!isMobileMode()) {
        b.setInteractive({ useHandCursor: true });
        b.on('pointerover', () => b.setTexture('ui_btn_hover'));
        b.on('pointerout', () => b.setTexture('ui_btn'));
        b.on('pointerdown', cb);
      }
      const entry = { bg: b, txt: t, action: cb };
      if (includeInBase) {
        this.basePauseButtons.push(entry);
        this.pauseButtons.push(entry);
      }
      return entry;
    };

    const resumeEntry = mkBtn(108, 'RESUME', () => this.togglePause(false));

    const muteBtn = this.add.image(180, 132, 'ui_btn').setDisplaySize(128, 20);
    const muteTxt = addPixelText(this, 180, 132, SoundSystem.muted ? 'AUDIO: OFF' : 'AUDIO: ON', 8, 0xffffff, 0.5, 0.5);
    const toggleMute = () => {
      SoundSystem.muted = !SoundSystem.muted;
      muteTxt.setText(SoundSystem.muted ? 'AUDIO: OFF' : 'AUDIO: ON');
    };
    if (!isMobileMode()) {
      muteBtn.setInteractive({ useHandCursor: true }).on('pointerdown', toggleMute);
    }
    const muteEntry = { bg: muteBtn, txt: muteTxt, action: toggleMute };
    this.basePauseButtons.push(muteEntry);
    this.pauseButtons.push(muteEntry);

    const fsEntry = mkBtn(156, 'FULLSCREEN', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });

    const skipEntry = mkBtn(
      166,
      'SKIP TUTORIAL',
      () => {
        this.togglePause(false);
        this.onSkipTutorialCallback?.();
      },
      false
    );
    skipEntry.bg.setVisible(false);
    skipEntry.txt.setVisible(false);
    this.skipTutorialPauseBtn = skipEntry;

    const quitEntry = mkBtn(180, 'QUIT TO MENU', () => {
      this.togglePause(false);
      this.onQuitCallback?.();
    });

    this.pausePlayersPanel = this.add.container(0, 0).setVisible(false);
    const pBg = this.add.rectangle(262, 135, 146, 138, 0x181430, 0.96).setStrokeStyle(2, 0x5d4e9e);
    const pTitle = addPixelText(this, 262, 80, 'PLAYERS', 8, 0x66ffd9, 0.5, 0.5);
    this.pausePlayersList = this.add.container(0, 0);
    this.pausePlayersPanel.add([pBg, pTitle, this.pausePlayersList]);

    this.pauseOverlay.add([
      dim,
      this.pausePanel,
      this.pauseTitleTxt,
      resumeEntry.bg,
      resumeEntry.txt,
      muteBtn,
      muteTxt,
      fsEntry.bg,
      fsEntry.txt,
      skipEntry.bg,
      skipEntry.txt,
      quitEntry.bg,
      quitEntry.txt,
      this.pausePlayersPanel,
    ]);
    this.refreshPausePlayersList();
  }

  private refreshPausePlayersList(): void {
    if (!this.pausePanel?.active || !this.pausePlayersPanel?.active) return;
    const isOnline = net.mode !== 'solo' && !localCoopSession.active;
    const hasSkip = Boolean(this.onSkipTutorialCallback);
    this.pausePlayersPanel.setVisible(isOnline);
    const menuX = isOnline ? 102 : 180;
    this.pausePanel.setPosition(menuX, 135).setSize(isOnline ? 156 : 180, hasSkip ? 162 : 138);
    this.pauseTitleTxt.setPosition(menuX, hasSkip ? 68 : 80);

    if (hasSkip && this.skipTutorialPauseBtn) {
      this.skipTutorialPauseBtn.bg.setVisible(true);
      this.skipTutorialPauseBtn.txt.setVisible(true);
      this.pauseButtons = [
        this.basePauseButtons[0],
        this.basePauseButtons[1],
        this.basePauseButtons[2],
        this.skipTutorialPauseBtn,
        this.basePauseButtons[3],
      ];
      const ys = [94, 118, 142, 166, 190];
      this.pauseButtons.forEach((b, i) => {
        b.bg.setPosition(menuX, ys[i]).setDisplaySize(isOnline ? 120 : 128, 20);
        b.txt.setPosition(menuX, ys[i]);
      });
    } else {
      if (this.skipTutorialPauseBtn) {
        this.skipTutorialPauseBtn.bg.setVisible(false);
        this.skipTutorialPauseBtn.txt.setVisible(false);
      }
      this.pauseButtons = [...this.basePauseButtons];
      const ys = [108, 132, 156, 180];
      this.pauseButtons.forEach((b, i) => {
        b.bg.setPosition(menuX, ys[i]).setDisplaySize(isOnline ? 120 : 128, 20);
        b.txt.setPosition(menuX, ys[i]);
      });
    }

    if (!isOnline) return;
    this.pausePlayersList.removeAll(true);

    const list = Array.from(net.players.values());
    const localOnSteam = isSteamworksBuild();

    list.forEach((p, idx) => {
      const y = 100 + idx * 24;
      const isSelf = p.peerId === net.localPeerId;
      let textX = 198;

      if (p.steamId) {
        const stIc = this.add.image(202, y, 'ui_steam_icon');
        this.pausePlayersList.add(stIc);
        textX = 211;
      }

      const label = `${p.name.slice(0, 10)}${p.isHost ? '*' : ''}`;
      const nm = addPixelText(this, textX, y, label, 8, isSelf ? 0xffe066 : 0xffffff, 0, 0.5);
      this.pausePlayersList.add(nm);

      if (localOnSteam && !isSelf && p.steamId) {
        const targetSteamId = p.steamId;
        void steamSystem.isFriend(targetSteamId).then((alreadyFriend) => {
          if (alreadyFriend || !this.pauseOverlay.visible || !this.pausePlayersList.active) return;
          const addBg = this.add.rectangle(322, y, 13, 13, 0x100d24).setStrokeStyle(1, 0x66ffd9);
          const addTxt = addPixelText(this, 322, y, '+', 8, 0x66ffd9, 0.5, 0.5);
          addBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            SoundSystem.playPickup();
            void steamSystem.addFriend(targetSteamId);
            addTxt.setText('OK').setTint(0xffe066);
            addBg.disableInteractive();
          });
          this.pausePlayersList.add([addBg, addTxt]);
        });
      }
    });
  }

  setQuitHandler(cb: () => void): void {
    this.onQuitCallback = cb;
  }

  setSkipTutorialHandler(cb?: () => void): void {
    this.onSkipTutorialCallback = cb;
    if (this.pausePanel?.active && this.pausePlayersPanel?.active) {
      this.refreshPausePlayersList();
    }
  }

  setPauseChangeHandler(cb: (paused: boolean) => void): void {
    this.onPauseChangeCallback = cb;
  }

  toggleMap(force?: boolean): void {
    const next = force !== undefined ? force : !this.mapOverlay.visible;
    this.mapOverlay.setVisible(next);
    if (next) {
      this.overlayOpenedFrame = this.game.loop.frame;
      if (this.lastPayload) {
        this.renderFullMap(this.lastPayload);
      }
    } else {
      this.shopClosedFrame = this.game.loop.frame;
      if (isMobileMode()) {
        mobileInput.clearQueuedActions();
      }
    }
  }

  closeMap(): void {
    if (this.mapOverlay.visible) {
      this.toggleMap(false);
    }
  }

  togglePause(force?: boolean): boolean {
    const next = force !== undefined ? force : !this.pauseOverlay.visible;
    this.pauseOverlay.setVisible(next);
    this.onPauseChangeCallback?.(next);
    if (next) {
      this.overlayOpenedFrame = this.game.loop.frame;
      if (isMobileMode()) {
        mobileInput.clearQueuedActions();
      }
      this.refreshPausePlayersList();
      this.pauseFocusIndex = 0;
      this.refreshPauseFocus();
    } else if (isMobileMode()) {
      mobileInput.clearQueuedActions();
    }
    return next;
  }

  isOverlayOpen(): boolean {
    return this.pauseOverlay.visible || this.shopOverlay.visible || this.mapOverlay.visible;
  }

  wasShopClosedRecently(): boolean {
    return this.game.loop.frame <= this.shopClosedFrame + 1;
  }

  openShop(stock: ShopStockItem[], shards: number, onBuy: (idx: number) => void): void {
    this.overlayOpenedFrame = this.game.loop.frame;
    this.onBuyCallback = onBuy;
    this.shopOverlay.removeAll(true);
    this.shopCards = [];
    const dim = this.add.rectangle(180, 135, 360, 270, 0x0b0917, 0.78);
    const panel = this.add.image(180, 135, 'ui_panel').setDisplaySize(344, 218);
    const title = addPixelText(this, 180, 38, "MIMI'S MAGICAL WARES", 8, 0xffd275, 0.5, 0.5);
    const shopHint =
      inputSystem.controlType === 'gamepad'
        ? inputSystem.gamepadBrand === 'playstation'
          ? `Shards: ${shards} (Stick/D-Pad Move, Cross Buy, Circle Close)`
          : `Shards: ${shards} (Stick/D-Pad Move, A Buy, B Close)`
        : inputSystem.controlType === 'touch'
          ? `Shards: ${shards} (Stick/D-Pad Move, E Buy, Esc Close)`
          : `Shards: ${shards} (Click item, Esc close)`;
    const sub = addPixelText(this, 180, 52, shopHint, 8, 0x6ef3ff, 0.5, 0.5, 320);

    this.shopOverlay.add([dim, panel, title, sub]);

    stock.forEach((entry, i) => {
      const cx = 72 + i * 108;
      const cy = 134;
      const card = this.add.image(cx, cy, 'ui_panel').setDisplaySize(102, 130);
      const itemIconKey = `item_${entry.itemId}`;
      const icon = this.add.image(cx, cy - 44, this.textures.exists(itemIconKey) ? itemIconKey : 'item_shard').setScale(1.5);
      const def = WEAPONS[entry.itemId] ?? CONSUMABLES[entry.itemId] ?? ARTIFACTS[entry.itemId];
      const shortName = def ? def.name : entry.itemId.replace(/_/g, ' ').toUpperCase();
      const nameTxt = addPixelText(this, cx, cy - 26, shortName, 8, 0xffffff, 0.5, 0, 92);
      applyRarityTextStyle(this, nameTxt, def?.rarity);
      const descTxt = addPixelText(this, cx, cy + 4, def?.description ?? '', 8, 0xb8a1ff, 0.5, 0, 92);
      const priceColor = entry.sold ? 0x7e71b8 : shards >= entry.price ? 0x66ffd9 : 0xff5d8f;
      const priceTxt = addPixelText(this, cx, cy + 48, entry.sold ? 'SOLD' : `${entry.price} SHARDS`, 8, priceColor, 0.5, 0.5);

      if (!entry.sold && !isMobileMode()) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => {
          this.onBuyCallback?.(i);
        });
      }
      this.shopCards.push({ card, sold: entry.sold, idx: i });
      this.shopOverlay.add([card, icon, nameTxt, descTxt, priceTxt]);
    });

    this.shopCloseTxt = addPixelText(this, 180, 222, '[CLOSE]', 8, 0xf49ac1, 0.5, 0.5);
    if (!isMobileMode()) {
      this.shopCloseTxt.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.closeShop());
    }
    this.shopFocusRing = this.add.rectangle(72, 134, 106, 134).setStrokeStyle(2, 0xffe066).setVisible(false);
    this.shopOverlay.add([this.shopCloseTxt, this.shopFocusRing]);
    this.shopOverlay.setVisible(true);

    this.shopFocusIndex = Math.min(this.shopFocusIndex, Math.max(0, this.shopCards.length - 1));
    this.refreshShopFocus();
  }

  closeShop(): void {
    this.shopOverlay.setVisible(false);
    this.shopClosedFrame = this.game.loop.frame;
    if (isMobileMode()) {
      mobileInput.clearQueuedActions();
    }
  }

  private handleMobileNav(dir: NavDir): void {
    if (this.virtualKeyboard?.visible) {
      this.virtualKeyboard.handleNav(dir);
      return;
    }

    if (this.pauseOverlay.visible) {
      SoundSystem.playSwing();
      if (dir === 'up') {
        this.pauseFocusIndex = (this.pauseFocusIndex - 1 + this.pauseButtons.length) % this.pauseButtons.length;
      } else if (dir === 'down') {
        this.pauseFocusIndex = (this.pauseFocusIndex + 1) % this.pauseButtons.length;
      }
      this.refreshPauseFocus();
      return;
    }

    if (this.shopOverlay.visible) {
      SoundSystem.playSwing();
      if (dir === 'left') {
        if (this.shopFocusIndex < 3) this.shopFocusIndex = (this.shopFocusIndex + 2) % 3;
      } else if (dir === 'right') {
        if (this.shopFocusIndex < 3) this.shopFocusIndex = (this.shopFocusIndex + 1) % 3;
      } else if (dir === 'down') {
        this.shopFocusIndex = this.shopFocusIndex < 3 ? 3 : 1;
      } else if (dir === 'up') {
        this.shopFocusIndex = this.shopFocusIndex === 3 ? 1 : 3;
      }
      this.refreshShopFocus();
    }
  }

  private handleMobileButton(btn: VirtualButton): void {
    if (this.virtualKeyboard?.visible) {
      this.virtualKeyboard.handleButton(btn);
      return;
    }

    if (this.game.loop.frame <= this.overlayOpenedFrame) return;

    if (this.pauseOverlay.visible) {
      if (btn === 'e' || btn === 'space') {
        this.pauseButtons[this.pauseFocusIndex]?.action();
      }
      return;
    }

    if (this.mapOverlay.visible) {
      if (btn === 'esc') {
        this.closeMap();
      }
      return;
    }

    if (this.shopOverlay.visible) {
      if (btn === 'esc') {
        this.closeShop();
        return;
      }
      if (btn === 'e' || btn === 'space') {
        if (this.shopFocusIndex === 3) {
          this.closeShop();
        } else {
          const card = this.shopCards[this.shopFocusIndex];
          if (card && !card.sold) {
            this.onBuyCallback?.(card.idx);
          } else {
            SoundSystem.playHit();
          }
        }
      }
    }
  }

  private refreshPauseFocus(): void {
    const showFocus = isMobileMode() || inputSystem.controlType === 'gamepad';
    this.pauseButtons.forEach((b, idx) => {
      const focused = showFocus && idx === this.pauseFocusIndex;
      b.bg.setTexture(focused ? 'ui_btn_hover' : 'ui_btn');
      b.txt.setTint(focused ? 0xffe066 : 0xffffff);
    });
  }

  private refreshShopFocus(): void {
    if (!this.shopFocusRing || !this.shopCloseTxt) return;
    const showFocus = isMobileMode() || inputSystem.controlType === 'gamepad';
    if (!showFocus) {
      this.shopFocusRing.setVisible(false);
      this.shopCloseTxt.setTint(0xf49ac1);
      return;
    }
    if (this.shopFocusIndex < 3) {
      const cx = 72 + this.shopFocusIndex * 108;
      this.shopFocusRing.setPosition(cx, 134).setSize(106, 134).setVisible(true);
      this.shopCloseTxt.setTint(0xf49ac1);
    } else {
      this.shopFocusRing.setVisible(false);
      this.shopCloseTxt.setTint(0xffe066);
    }
  }

  private refreshControlHints(): void {
    const isPad = inputSystem.controlType === 'gamepad';
    const isTouch = inputSystem.controlType === 'touch';
    const showHints = settingsSystem.current.showControlHints;

    for (const keyIcon of this.slotKeyIcons) {
      keyIcon.setVisible(showHints && !isPad && !isTouch);
    }
    if (this.slotBumperHints.length === 2) {
      this.slotBumperHints[0].setTexture(getControlIconTexture('prevSlot')).setVisible(showHints && isPad);
      this.slotBumperHints[1].setTexture(getControlIconTexture('nextSlot')).setVisible(showHints && isPad);
    }

    for (const row of this.hintRows) {
      const tex = getControlIconTexture(row.action);
      row.icon.setTexture(tex).setVisible(showHints);
      const texW = row.icon.displayWidth;
      row.icon.setX(Math.round(10 + texW / 2));
      row.label.setX(Math.round(10 + texW + 4)).setVisible(showHints);
    }
  }

  private getToastY(isLocalCoop: boolean, hasBoss: boolean): number {
    if (isLocalCoop) {
      return hasBoss ? 82 : 60;
    }
    return hasBoss ? 31 : 12;
  }

  showToast(message: string, color = '#66ffd9'): void {
    const tint = parseInt(color.replace('#', ''), 16) || 0x66ffd9;
    const isLocalCoop = !!(this.lastPayload?.localPlayers && this.lastPayload.localPlayers.length > 0);
    this.toastTxt.setY(this.getToastY(isLocalCoop, Boolean(this.bossContainer?.visible)));
    this.toastTxt.setText(message).setTint(tint).setVisible(true);
    this.toastTimer?.remove(false);
    this.toastTimer = this.time.delayedCall(2600, () => {
      if (this.toastTxt.active) this.toastTxt.setVisible(false);
    });
  }

  private buildLocalCornerHUDs(): void {
    this.localCornerHUDs = [];
    // P1: Top-Left (4, 4) | P2: Top-Right (254, 4) | P3: Bottom-Left (4, 210) | P4: Bottom-Right (254, 210)
    const anchors = [
      { x: 4, y: 4 },
      { x: 254, y: 4 },
      { x: 4, y: 210 },
      { x: 254, y: 210 },
    ];
    const tagColors = [0x66ffd9, 0xffe066, 0xf49ac1, 0x6ef3ff];

    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const { x, y } = anchors[pIdx];
      const container = this.add.container(x, y).setVisible(false).setDepth(15);
      const bg = this.add.rectangle(51, 28, 102, 56, 0x100d24, 0.86).setStrokeStyle(1, 0x5d4e9e);
      const nameTxt = addPixelText(this, 4, 3, `P${pIdx + 1}`, 8, tagColors[pIdx], 0, 0);
      const shIc = this.add.image(76, 6, 'item_shard').setScale(0.6);
      const shardTxt = addPixelText(this, 82, 3, '0', 8, 0x6ef3ff, 0, 0);

      const slotBgs: Phaser.GameObjects.Image[] = [];
      const slotIcons: Phaser.GameObjects.Image[] = [];
      const slotBars: Phaser.GameObjects.Graphics[] = [];
      for (let s = 0; s < 3; s++) {
        const sx = 12 + s * 18;
        const sy = 20;
        const sbg = this.add.image(sx, sy, 'ui_slot').setScale(0.72);
        const sic = this.add.image(sx, sy - 1, 'item_moonblade').setScale(0.72).setVisible(false);
        const sbar = this.add.graphics();
        slotBgs.push(sbg);
        slotIcons.push(sic);
        slotBars.push(sbar);
      }

      const itemTxt = addPixelText(this, 4, 31, '', 6, 0xb8a1ff, 0, 0, 94);

      const hearts: Phaser.GameObjects.Image[] = [];
      for (let h = 0; h < 8; h++) {
        const hi = this.add.image(7 + h * 7, 42, 'ui_heart_full').setScale(0.75);
        hearts.push(hi);
      }

      const shields: Phaser.GameObjects.Image[] = [];
      for (let sh = 0; sh < 4; sh++) {
        const si = this.add.image(74 + sh * 6, 42, 'ui_shield').setScale(0.7).setVisible(false);
        shields.push(si);
      }

      const stams: Phaser.GameObjects.Image[] = [];
      for (let st = 0; st < 4; st++) {
        const sti = this.add.image(7 + st * 7, 50, 'ui_stam_full').setScale(0.8);
        stams.push(sti);
      }

      const promptY = pIdx < 2 ? 62 : -6;
      const promptBg = this.add.rectangle(51, promptY, 96, 9, 0x100d24, 0.88).setStrokeStyle(1, 0x5d4e9e).setVisible(false);
      const promptIcon = this.add.image(12, promptY, 'key_e').setScale(0.5).setVisible(false);
      const promptTxt = addPixelText(this, 20, promptY, '', 4, 0xffffff, 0, 0.5, 86).setVisible(false);

      container.add([
        bg,
        nameTxt,
        shIc,
        shardTxt,
        ...slotBgs,
        ...slotIcons,
        ...slotBars,
        itemTxt,
        ...hearts,
        ...shields,
        ...stams,
        promptBg,
        promptIcon,
        promptTxt,
      ]);
      this.localCornerHUDs.push({
        container,
        nameTxt,
        shardTxt,
        itemTxt,
        promptBg,
        promptIcon,
        promptTxt,
        slotBgs,
        slotIcons,
        slotBars,
        hearts,
        shields,
        stams,
      });
    }
  }

  updateState(payload: UIStatePayload): void {
    this.lastPayload = payload;
    const isLocalCoop = !!payload.localPlayers && payload.localPlayers.length > 0;

    for (const node of this.singlePlayerNodes) {
      if ('setVisible' in node && typeof (node as Phaser.GameObjects.Image).setVisible === 'function') {
        (node as Phaser.GameObjects.Image).setVisible(!isLocalCoop);
      }
    }

    if (isLocalCoop && payload.localPlayers) {
      this.updateLocalCornerHUDs(payload.localPlayers, payload.localPrompts, payload.localInputTypes);
    } else {
      for (const ch of this.localCornerHUDs) {
        ch.container.setVisible(false);
      }
      this.updateSinglePlayerHUD(payload);
    }

    if (payload.spectating) {
      this.spectateBar.setVisible(true);
      this.spectateTxt.setText(`SPEC: ${payload.spectating.targetName.slice(0, 10)}`);
      const multi = payload.spectating.count > 1;
      this.spectatePrevBtn.setAlpha(multi ? 1 : 0.45);
      this.spectateNextBtn.setAlpha(multi ? 1 : 0.45);
    } else {
      this.spectateBar.setVisible(false);
    }

    if (!isLocalCoop && payload.promptText && !payload.spectating) {
      let label = payload.promptText;
      let action: GameAction | null = null;
      if (label.startsWith('[E] ')) {
        action = 'interact';
        label = label.slice(4);
      } else if (label.startsWith('[Q] ')) {
        action = 'drop';
        label = label.slice(4);
      } else if (label.startsWith('[SPACE] ')) {
        action = 'dodge';
        label = label.slice(8);
      } else if (label.startsWith('[TAB] ')) {
        action = 'map';
        label = label.slice(6);
      }

      this.promptTxt.setText(label).setVisible(true);
      if (action) {
        this.promptIcon.setTexture(getControlIconTexture(action)).setVisible(true);
        const iconW = this.promptIcon.displayWidth;
        const gap = 4;
        const totalW = iconW + gap + this.promptTxt.width;
        const leftX = Math.round(180 - totalW / 2);
        this.promptIcon.setPosition(Math.round(leftX + iconW / 2), 254);
        this.promptTxt.setOrigin(0, 0.5).setPosition(Math.round(leftX + iconW + gap), 254);
        this.promptBg.setSize(totalW + 12, Math.max(14, this.promptTxt.height + 6)).setVisible(true);
      } else {
        this.promptIcon.setVisible(false);
        this.promptTxt.setOrigin(0.5, 0.5).setPosition(180, 254);
        this.promptBg.setSize(this.promptTxt.width + 10, this.promptTxt.height + 6).setVisible(true);
      }
    } else {
      this.promptIcon.setVisible(false);
      this.promptTxt.setVisible(false);
      this.promptBg.setVisible(false);
    }

    if (payload.bossInfo && payload.bossInfo.hp > 0) {
      this.bossContainer.setVisible(true);
      this.toastTxt.setY(this.getToastY(isLocalCoop, true));
      this.bossNameTxt.setText(payload.bossInfo.name.toUpperCase());
      this.bossBarGfx.clear();
      const pct = Math.max(0, payload.bossInfo.hp / payload.bossInfo.maxHp);
      this.bossBarGfx.fillStyle(0x100d24, 1);
      this.bossBarGfx.fillRect(-84, 5, 168, 5);
      this.bossBarGfx.fillStyle(payload.bossInfo.accent, 1);
      this.bossBarGfx.fillRect(-83, 6, Math.floor(166 * pct), 3);
    } else {
      this.bossContainer.setVisible(false);
      this.toastTxt.setY(this.getToastY(isLocalCoop, false));
    }

    const hasBoss = !!(payload.bossInfo && payload.bossInfo.hp > 0);
    if (isLocalCoop) {
      const mapCenterY = hasBoss ? 48 : 26;
      this.minimapPanel.setPosition(180, mapCenterY).setDisplaySize(44, 44);
      this.roomCoordTxt.setFontSize(6).setPosition(180, mapCenterY + 24);
      this.renderMinimap(payload.rooms, payload.currentRoom, 162, mapCenterY - 18);
    } else {
      this.minimapPanel.setPosition(323, 32).setDisplaySize(50, 50);
      this.roomCoordTxt.setFontSize(8).setPosition(323, 61);
      this.renderMinimap(payload.rooms, payload.currentRoom, 305, 14);
    }
    const col = String.fromCharCode(65 + payload.currentRoom.gx);
    const row = payload.currentRoom.gy + 1;
    this.roomCoordTxt.setText(`${col}${row}`);

    const showSpeedrun =
      settingsSystem.current.speedrunCounter &&
      typeof payload.runElapsedMs === 'number' &&
      !isLocalCoop;
    if (showSpeedrun) {
      const totalMs = Math.max(0, Math.floor(payload.runElapsedMs!));
      const mins = Math.floor(totalMs / 60000);
      const secs = Math.floor((totalMs % 60000) / 1000);
      const ms = totalMs % 1000;
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
      const allyCount = Math.min(3, payload.allies.length);
      this.speedrunTxt
        .setPosition(292, 132 + (allyCount > 0 ? allyCount * 11 + 2 : 0))
        .setText(formatted)
        .setVisible(true);
    } else {
      this.speedrunTxt.setVisible(false);
    }

    if (this.mapOverlay.visible) {
      this.renderFullMap(payload);
    }
  }

  private updateSinglePlayerHUD(payload: UIStatePayload): void {
    const p = payload.player;

    if (isMobileMode()) {
      const allies = payload.allies.slice(0, 3);
      for (let i = 0; i < 3; i++) {
        const ally = allies[i];
        const lbl = this.allyLabels[i];
        if (ally) {
          lbl
            .setText(`${ally.name.slice(0, 6)} ${ally.downed ? 'DOWN' : `${ally.hp}/${ally.maxHp}`}`)
            .setTint(ally.downed ? 0xff5d8f : 0xb8a1ff)
            .setVisible(true);
        } else {
          lbl.setVisible(false);
        }
      }
      mobileInput.setHudState({
        inGame: true,
        activeSlot: p.activeSlot,
        hp: p.hp,
        maxHp: p.maxHp,
        shield: p.shield,
        stamina: p.stamina,
        maxStamina: p.maxStamina,
        shards: p.shards,
        statusEffects: p.statusEffects.slice(0, 4).map((eff) => ({
          id: eff.id,
          color: STATUS_EFFECTS[eff.id].color,
          remainingMs: eff.remainingMs,
        })),
        inventory: p.inventory.map((item) =>
          item
            ? {
                name: item.name,
                description: item.description,
                uses: item.uses,
                maxUses: item.maxUses,
                iconDataUrl: this.getIconDataUrl(item.iconKey),
                rarity: item.rarity,
              }
            : null
        ),
      });
      return;
    }

    const numHearts = Math.min(this.heartSprites.length, Math.ceil(p.maxHp / 2));
    const cols = numHearts <= 8 ? 4 : 5;
    for (let i = 0; i < this.heartSprites.length; i++) {
      if (i >= numHearts) {
        this.heartSprites[i].setVisible(false);
        continue;
      }
      const row = Math.floor(i / cols);
      const col = i % cols;
      const rowCount = Math.min(cols, numHearts - row * cols);
      const startX = 323 - ((rowCount - 1) * 11) / 2;
      this.heartSprites[i].setPosition(Math.round(startX + col * 11), 76 + row * 10).setVisible(true);
      const hpForHeart = p.hp - i * 2;
      if (hpForHeart >= 2) this.heartSprites[i].setTexture('ui_heart_full');
      else if (hpForHeart === 1) this.heartSprites[i].setTexture('ui_heart_half');
      else this.heartSprites[i].setTexture('ui_heart_empty');
    }

    const shieldCount = Math.min(p.shield, 6);
    for (let i = 0; i < 6; i++) {
      this.shieldSprites[i].setVisible(i < shieldCount);
    }

    const fullStam = Math.floor(p.stamina);
    for (let i = 0; i < 4; i++) {
      this.stamSprites[i].setTexture(i < fullStam ? 'ui_stam_full' : 'ui_stam_empty');
    }

    this.shardText.setText(`${p.shards}`);

    const activeEffects = p.statusEffects.slice(0, 4);
    for (let i = 0; i < 4; i++) {
      const eff = activeEffects[i];
      if (eff) {
        this.statusBadges[i].setFillStyle(STATUS_EFFECTS[eff.id].color).setVisible(true);
      } else {
        this.statusBadges[i].setVisible(false);
      }
    }

    const allies = payload.allies.slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const ally = allies[i];
      const lbl = this.allyLabels[i];
      if (ally) {
        lbl
          .setText(`${ally.name.slice(0, 6)} ${ally.downed ? 'DOWN' : `${ally.hp}/${ally.maxHp}`}`)
          .setTint(ally.downed ? 0xff5d8f : 0xb8a1ff)
          .setVisible(true);
      } else {
        lbl.setVisible(false);
      }
    }

    for (let i = 0; i < 3; i++) {
      const isSelected = p.activeSlot === i;
      this.slotBgs[i].setTexture(isSelected ? 'ui_slot_active' : 'ui_slot');
      const item = p.inventory[i];
      const bar = this.slotBars[i];
      bar.clear();

      if (item) {
        this.slotIcons[i].setTexture(item.iconKey).setVisible(true);
        const pct = Math.max(0, Math.min(1, item.uses / item.maxUses));
        const sx = 38;
        const sy = 32 + i * 40;
        bar.fillStyle(0x100d24, 1);
        bar.fillRect(sx - 12, sy + 10, 24, 3);
        bar.fillStyle(pct > 0.35 ? 0x66ffd9 : 0xff5d8f, 1);
        bar.fillRect(sx - 12, sy + 10, Math.ceil(24 * pct), 3);
      } else {
        this.slotIcons[i].setVisible(false);
      }
    }

    const activeItem = p.inventory[p.activeSlot];
    this.selectedLabel.setText(activeItem ? `${activeItem.name} (${activeItem.uses}/${activeItem.maxUses})` : 'Empty Hand');
    const rarityKey = activeItem ? activeItem.rarity : 'empty';
    if (rarityKey !== this.lastSelectedRarityKey) {
      this.lastSelectedRarityKey = rarityKey;
      applyRarityTextStyle(this, this.selectedLabel, activeItem?.rarity);
    }
    this.selectedDescLabel.setText(activeItem ? activeItem.description : '');
    this.selectedDescLabel.setY(this.selectedLabel.y + this.selectedLabel.height + 3);
  }

  private updateLocalCornerHUDs(
    players: PlayerStateSnapshot[],
    localPrompts?: string[],
    localInputTypes?: Array<'keyboard' | 'gamepad'>
  ): void {
    const tagColors = [0x66ffd9, 0xffe066, 0xf49ac1, 0x6ef3ff];
    for (let idx = 0; idx < 4; idx++) {
      const ch = this.localCornerHUDs[idx];
      const lp = players[idx];
      if (!lp) {
        ch.container.setVisible(false);
        continue;
      }
      ch.container.setVisible(true);
      ch.nameTxt
        .setText(lp.downed ? `P${idx + 1} DOWN` : `P${idx + 1}`)
        .setTint(lp.downed ? 0xff5d8f : tagColors[idx]);
      ch.shardTxt.setText(`${lp.shards}`);

      const activeItem = lp.inventory[lp.activeSlot];
      const rawItemName = activeItem ? activeItem.name : 'Empty';
      const displayItemName = rawItemName.length > 20 ? `${rawItemName.slice(0, 19)}.` : rawItemName;
      ch.itemTxt.setText(displayItemName);

      const rawPrompt = !lp.downed ? localPrompts?.[idx] ?? '' : '';
      if (rawPrompt) {
        let label = rawPrompt;
        const bracketEnd = label.indexOf('] ');
        if (label.startsWith('[') && bracketEnd !== -1) {
          label = label.slice(bracketEnd + 2);
        }
        if (label.length > 24) {
          label = `${label.slice(0, 23)}.`;
        }
        const inputType = localInputTypes?.[idx] ?? 'gamepad';
        const iconKey =
          inputType === 'keyboard'
            ? 'key_e'
            : getGamepadButtonTexture(inputSystem.getButtonForAction('interact'));
        ch.promptIcon.setTexture(iconKey).setVisible(true);
        ch.promptTxt.setText(label).setVisible(true);
        const iconW = ch.promptIcon.displayWidth;
        const gap = 2;
        const totalW = iconW + gap + ch.promptTxt.width;
        const leftX = Math.round(51 - totalW / 2);
        const py = idx < 2 ? 62 : -6;
        ch.promptIcon.setPosition(Math.round(leftX + iconW / 2), py);
        ch.promptTxt.setPosition(Math.round(leftX + iconW + gap), py);
        ch.promptBg.setSize(Math.max(28, totalW + 6), 9).setVisible(true);
      } else {
        ch.promptBg.setVisible(false);
        ch.promptIcon.setVisible(false);
        ch.promptTxt.setVisible(false);
      }

      for (let s = 0; s < 3; s++) {
        ch.slotBgs[s].setTexture(lp.activeSlot === s ? 'ui_slot_active' : 'ui_slot');
        const item = lp.inventory[s];
        const bar = ch.slotBars[s];
        bar.clear();
        if (item) {
          ch.slotIcons[s].setTexture(item.iconKey).setVisible(true);
          const pct = Math.max(0, Math.min(1, item.uses / item.maxUses));
          const sx = 12 + s * 18;
          const sy = 20;
          bar.fillStyle(0x100d24, 1);
          bar.fillRect(sx - 6, sy + 6, 12, 2);
          bar.fillStyle(pct > 0.35 ? 0x66ffd9 : 0xff5d8f, 1);
          bar.fillRect(sx - 6, sy + 6, Math.ceil(12 * pct), 2);
        } else {
          ch.slotIcons[s].setVisible(false);
        }
      }

      const numHearts = Math.min(ch.hearts.length, Math.ceil(lp.maxHp / 2));
      for (let h = 0; h < ch.hearts.length; h++) {
        if (h >= numHearts) {
          ch.hearts[h].setVisible(false);
          continue;
        }
        ch.hearts[h].setVisible(true);
        const hpForHeart = lp.hp - h * 2;
        if (hpForHeart >= 2) ch.hearts[h].setTexture('ui_heart_full');
        else if (hpForHeart === 1) ch.hearts[h].setTexture('ui_heart_half');
        else ch.hearts[h].setTexture('ui_heart_empty');
      }

      const shCount = Math.min(lp.shield, ch.shields.length);
      for (let sh = 0; sh < ch.shields.length; sh++) {
        ch.shields[sh].setVisible(sh < shCount);
      }

      const fullStam = Math.floor(lp.stamina);
      for (let st = 0; st < ch.stams.length; st++) {
        ch.stams[st].setTexture(st < fullStam ? 'ui_stam_full' : 'ui_stam_empty');
      }
    }
  }

  private renderMinimap(rooms: RoomData[][], current: RoomData, ox = 305, oy = 14): void {
    this.minimapGfx.clear();
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const r = rooms[y]?.[x];
        if (!r) continue;
        if (r.type === 'secret' && !r.secretRevealed && !r.visited) continue;
        if (!r.visited && !this.isAdjacentToVisited(rooms, x, y)) continue;

        let color = r.visited ? 0x5d4e9e : 0x2b2447;
        if (r.type === 'boss') color = 0xff47b6;
        else if (r.type === 'merchant') color = 0x6ef3ff;
        else if (r.type === 'healing') color = 0x66ffd9;
        else if (r.type === 'treasure' || r.type === 'secret') color = 0xffd275;
        if (r.gx === current.gx && r.gy === current.gy) color = 0xffffff;

        this.minimapGfx.fillStyle(color, 1);
        this.minimapGfx.fillRect(ox + x * 6, oy + y * 6, 5, 5);
      }
    }
  }

  private renderFullMap(payload: UIStatePayload): void {
    if (payload.currentRoom.isTutorialRoom) {
      this.mapTitleTxt.setText('TUTORIAL GROUNDS');
      this.mapModTxt.setText('Learn the ropes of Glimmerdeep!');
    } else {
      const biome = BIOMES[Math.min(payload.levelIndex, BIOMES.length - 1)];
      const mod = LEVEL_MODIFIERS.find((m) => m.id === payload.modifierId) ?? LEVEL_MODIFIERS[0];
      this.mapTitleTxt.setText(`FLOOR ${biome.level}: ${biome.name.toUpperCase()}`);
      this.mapModTxt.setText(`${mod.name} - ${mod.description}`);
    }

    this.mapGfx.clear();
    const ox = 120;
    const oy = 84;
    const step = 20;
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const r = payload.rooms[y]?.[x];
        if (!r) continue;
        if (r.type === 'secret' && !r.secretRevealed && !r.visited) continue;
        if (!r.visited && !this.isAdjacentToVisited(payload.rooms, x, y)) continue;

        const rx = ox + x * step;
        const ry = oy + y * step;

        this.mapGfx.fillStyle(0x5d4e9e, 1);
        if (r.connections.east) this.mapGfx.fillRect(rx + 14, ry + 6, 6, 2);
        if (r.connections.south) this.mapGfx.fillRect(rx + 6, ry + 14, 2, 6);

        let color = r.visited ? 0x6c5bb3 : 0x2b2447;
        if (r.type === 'boss') color = 0xff47b6;
        else if (r.type === 'merchant') color = 0x6ef3ff;
        else if (r.type === 'healing') color = 0x66ffd9;
        else if (r.type === 'treasure' || r.type === 'secret') color = 0xffd275;
        if (r.gx === payload.currentRoom.gx && r.gy === payload.currentRoom.gy) color = 0xffe066;

        this.mapGfx.fillStyle(0x100d24, 1);
        this.mapGfx.fillRect(rx, ry, 14, 14);
        this.mapGfx.fillStyle(color, 1);
        this.mapGfx.fillRect(rx + 1, ry + 1, 12, 12);
      }
    }
  }

  private isAdjacentToVisited(rooms: RoomData[][], x: number, y: number): boolean {
    const cur = rooms[y]?.[x];
    if (!cur) return false;
    if (cur.connections.north && rooms[y - 1]?.[x]?.visited) return true;
    if (cur.connections.south && rooms[y + 1]?.[x]?.visited) return true;
    if (cur.connections.west && rooms[y]?.[x - 1]?.visited) return true;
    if (cur.connections.east && rooms[y]?.[x + 1]?.visited) return true;
    return false;
  }
}
