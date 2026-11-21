import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { BIOMES, LEVEL_MODIFIERS } from '../data/biomes';
import { ARTIFACTS, CONSUMABLES, STATUS_EFFECTS } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { isMobileMode, mobileInput, NavDir, VirtualButton } from '../mobile/MobileInput';
import { PlayerStateSnapshot, RoomData, ShopStockItem } from '../types/game';

export interface UIStatePayload {
  player: PlayerStateSnapshot;
  allies: PlayerStateSnapshot[];
  levelIndex: number;
  modifierId: string;
  rooms: RoomData[][];
  currentRoom: RoomData;
  bossInfo: { name: string; hp: number; maxHp: number; accent: number } | null;
  promptText: string;
  spectating?: { targetName: string; count: number } | null;
}

export class UIScene extends Phaser.Scene {
  private heartSprites: Phaser.GameObjects.Image[] = [];
  private shieldContainer!: Phaser.GameObjects.Container;
  private stamSprites: Phaser.GameObjects.Image[] = [];
  private shardText!: Phaser.GameObjects.BitmapText;
  private statusContainer!: Phaser.GameObjects.Container;
  private allyContainer!: Phaser.GameObjects.Container;

  private slotBgs: Phaser.GameObjects.Image[] = [];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private slotBars: Phaser.GameObjects.Graphics[] = [];
  private selectedLabel!: Phaser.GameObjects.BitmapText;
  private selectedDescLabel!: Phaser.GameObjects.BitmapText;

  private minimapGfx!: Phaser.GameObjects.Graphics;
  private roomCoordTxt!: Phaser.GameObjects.BitmapText;
  private bossContainer!: Phaser.GameObjects.Container;
  private bossNameTxt!: Phaser.GameObjects.BitmapText;
  private bossBarGfx!: Phaser.GameObjects.Graphics;

  private promptBg!: Phaser.GameObjects.Rectangle;
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
  private onPauseChangeCallback?: (paused: boolean) => void;
  private onSpectatePrev?: () => void;
  private onSpectateNext?: () => void;

  private pauseButtons: Array<{ bg: Phaser.GameObjects.Image; txt: Phaser.GameObjects.BitmapText; action: () => void }> = [];
  private pauseFocusIndex = 0;

  private shopCards: Array<{ card: Phaser.GameObjects.Image; sold: boolean; idx: number }> = [];
  private shopCloseTxt?: Phaser.GameObjects.BitmapText;
  private shopFocusRing?: Phaser.GameObjects.Rectangle;
  private overlayOpenedFrame = -1;
  private shopFocusIndex = 0; // 0..2 = cards, 3 = CLOSE
  private unsubNav?: () => void;
  private unsubBtn?: () => void;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    // Left margin: Bigger 3-slot Inventory stacked vertically + item name & description
    this.slotBgs = [];
    this.slotIcons = [];
    this.slotBars = [];
    for (let i = 0; i < 3; i++) {
      const sx = 38;
      const sy = 32 + i * 40;
      const bg = this.add.image(sx, sy, 'ui_slot').setScale(1.5);
      const icon = this.add.image(sx, sy - 2, 'item_moonblade').setScale(1.5).setVisible(false);
      const bar = this.add.graphics();
      addPixelText(this, sx - 13, sy - 14, `${i + 1}`, 8, 0x9d8ce0, 0, 0);
      this.slotBgs.push(bg);
      this.slotIcons.push(icon);
      this.slotBars.push(bar);
    }

    this.selectedLabel = addPixelText(this, 38, 138, '', 8, 0xffe066, 0.5, 0, 68);
    this.selectedDescLabel = addPixelText(this, 38, 160, '', 8, 0xb8a1ff, 0.5, 0, 68);

    // Right margin: Compact 6x6 Minimap + Room Coordinate Label (A1..F6)
    this.add.image(323, 32, 'ui_panel').setDisplaySize(50, 50).setAlpha(0.88);
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

    this.stamSprites = [];
    for (let i = 0; i < 4; i++) {
      const s = this.add.image(294 + i * 9, 108, 'ui_stam_full');
      this.stamSprites.push(s);
    }

    this.add.image(333, 108, 'item_shard').setScale(0.75);
    this.shardText = addPixelText(this, 340, 104, '0', 8, 0x6ef3ff, 0, 0);

    this.statusContainer = this.add.container(292, 120);
    this.allyContainer = this.add.container(292, 134);

    // Bottom center (below room) for prompts & toasts
    this.promptBg = this.add.rectangle(180, 254, 180, 12, 0x100d24, 0.85).setVisible(false);
    this.promptTxt = addPixelText(this, 180, 254, '', 8, 0xffffff, 0.5, 0.5, 220).setVisible(false);

    this.toastTxt = addPixelText(this, 180, 16, '', 8, 0x66ffd9, 0.5, 0.5, 220).setVisible(false);

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

    if (isMobileMode()) {
      this.unsubNav = mobileInput.onNav((dir) => this.handleMobileNav(dir));
      this.unsubBtn = mobileInput.onButton((btn) => this.handleMobileButton(btn));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubNav?.();
        this.unsubBtn?.();
      });
    }
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
    const dim = this.add.rectangle(180, 135, 360, 270, 0x0b0917, 0.75);
    const panel = this.add.image(180, 135, 'ui_panel').setDisplaySize(180, 138);
    const title = addPixelText(this, 180, 82, 'PAUSED', 8, 0xf49ac1, 0.5, 0.5);

    const mkBtn = (y: number, label: string, cb: () => void) => {
      const b = this.add.image(180, y, 'ui_btn').setDisplaySize(128, 20);
      const t = addPixelText(this, 180, y, label, 8, 0xffffff, 0.5, 0.5);
      if (!isMobileMode()) {
        b.setInteractive({ useHandCursor: true });
        b.on('pointerover', () => b.setTexture('ui_btn_hover'));
        b.on('pointerout', () => b.setTexture('ui_btn'));
        b.on('pointerdown', cb);
      }
      this.pauseButtons.push({ bg: b, txt: t, action: cb });
      return [b, t] as const;
    };

    const resumeEls = mkBtn(108, 'RESUME', () => this.togglePause(false));

    const muteBtn = this.add.image(180, 132, 'ui_btn').setDisplaySize(128, 20);
    const muteTxt = addPixelText(this, 180, 132, SoundSystem.muted ? 'AUDIO: OFF' : 'AUDIO: ON', 8, 0xffffff, 0.5, 0.5);
    const toggleMute = () => {
      SoundSystem.muted = !SoundSystem.muted;
      muteTxt.setText(SoundSystem.muted ? 'AUDIO: OFF' : 'AUDIO: ON');
    };
    if (!isMobileMode()) {
      muteBtn.setInteractive({ useHandCursor: true }).on('pointerdown', toggleMute);
    }
    this.pauseButtons.push({ bg: muteBtn, txt: muteTxt, action: toggleMute });

    const fsEls = mkBtn(156, 'FULLSCREEN', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });

    const quitEls = mkBtn(180, 'QUIT TO MENU', () => {
      this.togglePause(false);
      this.onQuitCallback?.();
    });

    this.pauseOverlay.add([dim, panel, title, ...resumeEls, muteBtn, muteTxt, ...fsEls, ...quitEls]);
  }

  setQuitHandler(cb: () => void): void {
    this.onQuitCallback = cb;
  }

  setPauseChangeHandler(cb: (paused: boolean) => void): void {
    this.onPauseChangeCallback = cb;
  }

  toggleMap(): void {
    const next = !this.mapOverlay.visible;
    this.mapOverlay.setVisible(next);
    if (next && this.lastPayload) {
      this.renderFullMap(this.lastPayload);
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
        this.pauseFocusIndex = 0;
        this.refreshPauseFocus();
      }
    } else if (isMobileMode()) {
      mobileInput.clearQueuedActions();
    }
    return next;
  }

  isOverlayOpen(): boolean {
    return this.pauseOverlay.visible || this.shopOverlay.visible;
  }

  openShop(stock: ShopStockItem[], shards: number, onBuy: (idx: number) => void): void {
    this.overlayOpenedFrame = this.game.loop.frame;
    this.onBuyCallback = onBuy;
    this.shopOverlay.removeAll(true);
    this.shopCards = [];
    const dim = this.add.rectangle(180, 135, 360, 270, 0x0b0917, 0.78);
    const panel = this.add.image(180, 135, 'ui_panel').setDisplaySize(344, 218);
    const title = addPixelText(this, 180, 38, "MIMI'S MAGICAL WARES", 8, 0xffd275, 0.5, 0.5);
    const sub = addPixelText(
      this,
      180,
      52,
      isMobileMode()
        ? `Shards: ${shards} (Stick/D-Pad Move, E Buy, Esc Close)`
        : `Shards: ${shards} (Click item, Esc close)`,
      8,
      0x6ef3ff,
      0.5,
      0.5,
      320
    );

    this.shopOverlay.add([dim, panel, title, sub]);

    stock.forEach((entry, i) => {
      const cx = 72 + i * 108;
      const cy = 134;
      const card = this.add.image(cx, cy, 'ui_panel').setDisplaySize(102, 130);
      const itemIconKey = `item_${entry.itemId}`;
      const icon = this.add.image(cx, cy - 44, this.textures.exists(itemIconKey) ? itemIconKey : 'item_shard').setScale(1.5);
      const def = WEAPONS[entry.itemId] ?? CONSUMABLES[entry.itemId] ?? ARTIFACTS[entry.itemId];
      const shortName = def ? def.name : entry.itemId.replace(/_/g, ' ').toUpperCase();
      const nameColor = def?.rarity === 'super_rare' ? 0xffe066 : 0xffffff;
      const nameTxt = addPixelText(this, cx, cy - 26, shortName, 8, nameColor, 0.5, 0, 92);
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

    if (isMobileMode()) {
      this.shopFocusIndex = Math.min(this.shopFocusIndex, Math.max(0, this.shopCards.length - 1));
      this.refreshShopFocus();
    }
  }

  closeShop(): void {
    this.shopOverlay.setVisible(false);
    if (isMobileMode()) {
      mobileInput.clearQueuedActions();
    }
  }

  private handleMobileNav(dir: NavDir): void {
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
    if (this.game.loop.frame <= this.overlayOpenedFrame) return;

    if (this.pauseOverlay.visible) {
      if (btn === 'e' || btn === 'space') {
        this.pauseButtons[this.pauseFocusIndex]?.action();
      }
      return;
    }

    if (this.shopOverlay.visible) {
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
    if (!isMobileMode()) return;
    this.pauseButtons.forEach((b, idx) => {
      const focused = idx === this.pauseFocusIndex;
      b.bg.setTexture(focused ? 'ui_btn_hover' : 'ui_btn');
      b.txt.setTint(focused ? 0xffe066 : 0xffffff);
    });
  }

  private refreshShopFocus(): void {
    if (!isMobileMode() || !this.shopFocusRing || !this.shopCloseTxt) return;
    if (this.shopFocusIndex < 3) {
      const cx = 72 + this.shopFocusIndex * 108;
      this.shopFocusRing.setPosition(cx, 134).setSize(106, 134).setVisible(true);
      this.shopCloseTxt.setTint(0xf49ac1);
    } else {
      this.shopFocusRing.setVisible(false);
      this.shopCloseTxt.setTint(0xffe066);
    }
  }

  showToast(message: string, color = '#66ffd9'): void {
    const tint = parseInt(color.replace('#', ''), 16) || 0x66ffd9;
    this.toastTxt.setText(message).setTint(tint).setVisible(true);
    this.toastTimer?.remove(false);
    this.toastTimer = this.time.delayedCall(2200, () => {
      if (this.toastTxt.active) this.toastTxt.setVisible(false);
    });
  }

  updateState(payload: UIStatePayload): void {
    this.lastPayload = payload;
    const p = payload.player;

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

    this.shieldContainer.removeAll(true);
    for (let i = 0; i < Math.min(p.shield, 6); i++) {
      this.shieldContainer.add(this.add.image(i * 8, 0, 'ui_shield'));
    }

    const fullStam = Math.floor(p.stamina);
    for (let i = 0; i < 4; i++) {
      this.stamSprites[i].setTexture(i < fullStam ? 'ui_stam_full' : 'ui_stam_empty');
    }

    this.shardText.setText(`${p.shards}`);

    this.statusContainer.removeAll(true);
    p.statusEffects.slice(0, 4).forEach((eff, idx) => {
      const meta = STATUS_EFFECTS[eff.id];
      const badge = this.add.rectangle(idx * 18 + 4, 3, 6, 6, meta.color).setStrokeStyle(1, 0x100d24);
      this.statusContainer.add(badge);
    });

    this.allyContainer.removeAll(true);
    payload.allies.slice(0, 3).forEach((ally, idx) => {
      const ay = idx * 11;
      const txt = addPixelText(
        this,
        0,
        ay,
        `${ally.name.slice(0, 6)} ${ally.downed ? 'DOWN' : `${ally.hp}/${ally.maxHp}`}`,
        8,
        ally.downed ? 0xff5d8f : 0xb8a1ff,
        0,
        0
      );
      this.allyContainer.add(txt);
    });

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
    this.selectedDescLabel.setText(activeItem ? activeItem.description : '');
    this.selectedDescLabel.setY(this.selectedLabel.y + this.selectedLabel.height + 3);

    if (payload.spectating) {
      this.spectateBar.setVisible(true);
      this.spectateTxt.setText(`SPEC: ${payload.spectating.targetName.slice(0, 10)}`);
      const multi = payload.spectating.count > 1;
      this.spectatePrevBtn.setAlpha(multi ? 1 : 0.45);
      this.spectateNextBtn.setAlpha(multi ? 1 : 0.45);
    } else {
      this.spectateBar.setVisible(false);
    }

    if (payload.promptText && !payload.spectating) {
      this.promptTxt.setText(payload.promptText).setVisible(true);
      this.promptBg.setSize(this.promptTxt.width + 10, this.promptTxt.height + 6).setVisible(true);
    } else {
      this.promptTxt.setVisible(false);
      this.promptBg.setVisible(false);
    }

    if (payload.bossInfo && payload.bossInfo.hp > 0) {
      this.bossContainer.setVisible(true);
      this.bossNameTxt.setText(payload.bossInfo.name.toUpperCase());
      this.bossBarGfx.clear();
      const pct = Math.max(0, payload.bossInfo.hp / payload.bossInfo.maxHp);
      this.bossBarGfx.fillStyle(0x100d24, 1);
      this.bossBarGfx.fillRect(-84, 5, 168, 5);
      this.bossBarGfx.fillStyle(payload.bossInfo.accent, 1);
      this.bossBarGfx.fillRect(-83, 6, Math.floor(166 * pct), 3);
    } else {
      this.bossContainer.setVisible(false);
    }

    this.renderMinimap(payload.rooms, payload.currentRoom);
    const col = String.fromCharCode(65 + payload.currentRoom.gx);
    const row = payload.currentRoom.gy + 1;
    this.roomCoordTxt.setText(`${col}${row}`);
    if (this.mapOverlay.visible) {
      this.renderFullMap(payload);
    }
  }

  private renderMinimap(rooms: RoomData[][], current: RoomData): void {
    this.minimapGfx.clear();
    const ox = 305;
    const oy = 14;
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
    const biome = BIOMES[Math.min(payload.levelIndex, BIOMES.length - 1)];
    const mod = LEVEL_MODIFIERS.find((m) => m.id === payload.modifierId) ?? LEVEL_MODIFIERS[0];
    this.mapTitleTxt.setText(`FLOOR ${biome.level}: ${biome.name.toUpperCase()}`);
    this.mapModTxt.setText(`${mod.name} - ${mod.description}`);

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
