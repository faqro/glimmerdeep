import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { ALL_SELECTABLE_AVATARS } from '../data/palettes';
import { isMobileMode, NavDir, VirtualButton } from '../mobile/MobileInput';
import { inputSystem } from '../systems/InputSystem';

export const AVATAR_STORAGE_KEY = 'glimmerdeep_selected_avatar';

const SKINS_PER_PAGE = 12; // 4 cols x 3 rows

export class SkinScene extends Phaser.Scene {
  private page = 0;
  private selectedId = ALL_SELECTABLE_AVATARS[0].id;
  private focusArea: 'grid' | 'nav' = 'grid';
  private gridFocusIdx = 0;
  private navFocusIdx = 2; // 0: prev, 1: next, 2: back

  private gridContainer!: Phaser.GameObjects.Container;
  private cards: Array<{
    id: string;
    bg: Phaser.GameObjects.Rectangle;
    sprite: Phaser.GameObjects.Sprite;
    label: Phaser.GameObjects.BitmapText;
  }> = [];

  private currentTxt!: Phaser.GameObjects.BitmapText;
  private pageTxt!: Phaser.GameObjects.BitmapText;
  private prevBtn!: Phaser.GameObjects.Image;
  private prevTxt!: Phaser.GameObjects.BitmapText;
  private nextBtn!: Phaser.GameObjects.Image;
  private nextTxt!: Phaser.GameObjects.BitmapText;
  private backBtn!: Phaser.GameObjects.Image;
  private backTxt!: Phaser.GameObjects.BitmapText;

  private unsubNav?: () => void;
  private unsubBtn?: () => void;

  constructor() {
    super({ key: 'SkinScene' });
  }

  create(): void {
    this.page = 0;
    this.focusArea = 'grid';
    this.gridFocusIdx = 0;
    this.navFocusIdx = 2;

    try {
      const saved = localStorage.getItem(AVATAR_STORAGE_KEY);
      if (saved && ALL_SELECTABLE_AVATARS.some((a) => a.id === saved)) {
        this.selectedId = saved;
        const idx = ALL_SELECTABLE_AVATARS.findIndex((a) => a.id === saved);
        if (idx >= 0) {
          this.page = Math.floor(idx / SKINS_PER_PAGE);
          this.gridFocusIdx = idx % SKINS_PER_PAGE;
        }
      }
    } catch {
      // ignore storage errors
    }

    this.add.rectangle(180, 135, 360, 270, 0x0e0c21);

    addPixelText(this, 16, 16, 'SKIN BROWSER', 16, 0xf49ac1, 0, 0.5);
    this.currentTxt = addPixelText(this, 344, 16, '', 8, 0x66ffd9, 1, 0.5);

    this.add.rectangle(180, 128, 336, 184, 0x181430).setStrokeStyle(2, 0x5d4e9e);
    this.gridContainer = this.add.container(0, 0);

    this.prevBtn = this.add.image(56, 246, 'ui_btn').setDisplaySize(68, 18);
    this.prevTxt = addPixelText(this, 56, 246, '< PREV', 8, 0xffffff, 0.5, 0.5);
    this.pageTxt = addPixelText(this, 134, 246, '1 / 1', 8, 0xb8a1ff, 0.5, 0.5);
    this.nextBtn = this.add.image(212, 246, 'ui_btn').setDisplaySize(68, 18);
    this.nextTxt = addPixelText(this, 212, 246, 'NEXT >', 8, 0xffffff, 0.5, 0.5);
    this.backBtn = this.add.image(306, 246, 'ui_btn').setDisplaySize(76, 18);
    this.backTxt = addPixelText(this, 306, 246, 'BACK', 8, 0xffffff, 0.5, 0.5);

    const onPrev = () => {
      if (this.page > 0) {
        SoundSystem.playSwing();
        this.page--;
        this.gridFocusIdx = 0;
        this.renderPage();
      }
    };
    const onNext = () => {
      const totalPages = Math.max(1, Math.ceil(ALL_SELECTABLE_AVATARS.length / SKINS_PER_PAGE));
      if (this.page + 1 < totalPages) {
        SoundSystem.playSwing();
        this.page++;
        this.gridFocusIdx = 0;
        this.renderPage();
      }
    };
    const onBack = () => {
      SoundSystem.playHit();
      this.scene.start('MenuScene');
    };

    if (!isMobileMode()) {
      this.prevBtn.setInteractive({ useHandCursor: true }).on('pointerdown', onPrev);
      this.nextBtn.setInteractive({ useHandCursor: true }).on('pointerdown', onNext);
      this.backBtn.setInteractive({ useHandCursor: true }).on('pointerdown', onBack);

      this.input.keyboard?.on('keydown-ESC', onBack);
      this.input.keyboard?.on('keydown-LEFT', () => this.handleNav('left'));
      this.input.keyboard?.on('keydown-RIGHT', () => this.handleNav('right'));
      this.input.keyboard?.on('keydown-UP', () => this.handleNav('up'));
      this.input.keyboard?.on('keydown-DOWN', () => this.handleNav('down'));
      this.input.keyboard?.on('keydown-ENTER', () => this.activateFocused(onPrev, onNext, onBack));
    }

    this.unsubNav = inputSystem.onNav((dir) => this.handleNav(dir));
    this.unsubBtn = inputSystem.onButton((btn) => {
      if (btn === 'esc') {
        onBack();
        return;
      }
      if (btn === 'prevSlot') {
        onPrev();
        return;
      }
      if (btn === 'nextSlot') {
        onNext();
        return;
      }
      if (btn === 'e' || btn === 'space') {
        this.activateFocused(onPrev, onNext, onBack);
      }
    });

    this.time.addEvent({
      delay: 350,
      loop: true,
      callback: () => {
        for (const c of this.cards) {
          if (c.sprite?.active) {
            c.sprite.setFrame(c.sprite.frame.name === '0' ? 1 : 0);
          }
        }
      },
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubNav?.();
      this.unsubBtn?.();
    });

    this.renderPage();
  }

  private activateFocused(onPrev: () => void, onNext: () => void, onBack: () => void): void {
    if (this.focusArea === 'grid') {
      const card = this.cards[this.gridFocusIdx];
      if (card) {
        this.selectSkin(card.id);
      }
    } else {
      if (this.navFocusIdx === 0) onPrev();
      else if (this.navFocusIdx === 1) onNext();
      else onBack();
    }
  }

  private selectSkin(id: string): void {
    this.selectedId = id;
    try {
      localStorage.setItem(AVATAR_STORAGE_KEY, id);
    } catch {
      // ignore storage errors
    }
    SoundSystem.playPickup();
    this.refreshSelectionVisuals();
  }

  private handleNav(dir: NavDir): void {
    SoundSystem.playSwing();
    const count = this.cards.length;
    if (this.focusArea === 'grid') {
      if (dir === 'left') {
        if (this.gridFocusIdx % 4 > 0) this.gridFocusIdx--;
      } else if (dir === 'right') {
        if (this.gridFocusIdx % 4 < 3 && this.gridFocusIdx + 1 < count) this.gridFocusIdx++;
      } else if (dir === 'up') {
        if (this.gridFocusIdx - 4 >= 0) {
          this.gridFocusIdx -= 4;
        } else {
          this.focusArea = 'nav';
        }
      } else if (dir === 'down') {
        if (this.gridFocusIdx + 4 < count) {
          this.gridFocusIdx += 4;
        } else {
          this.focusArea = 'nav';
        }
      }
    } else {
      if (dir === 'left') {
        this.navFocusIdx = (this.navFocusIdx + 2) % 3;
      } else if (dir === 'right') {
        this.navFocusIdx = (this.navFocusIdx + 1) % 3;
      } else if (dir === 'up' || dir === 'down') {
        this.focusArea = 'grid';
        this.gridFocusIdx = Math.min(this.gridFocusIdx, Math.max(0, count - 1));
      }
    }
    this.refreshSelectionVisuals();
  }

  private renderPage(): void {
    this.gridContainer.removeAll(true);
    this.cards = [];

    const totalPages = Math.max(1, Math.ceil(ALL_SELECTABLE_AVATARS.length / SKINS_PER_PAGE));
    this.page = Phaser.Math.Clamp(this.page, 0, totalPages - 1);
    const start = this.page * SKINS_PER_PAGE;
    const slice = ALL_SELECTABLE_AVATARS.slice(start, start + SKINS_PER_PAGE);

    slice.forEach((avatar, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const cx = 57 + col * 82;
      const cy = 68 + row * 59;

      const bg = this.add.rectangle(cx, cy, 76, 52, 0x100d24).setStrokeStyle(1, 0x4a3b7d);
      const sprite = this.add.sprite(cx, cy - 8, `player_${avatar.id}`, 0).setScale(1.65);
      const label = addPixelText(this, cx, cy + 16, avatar.label, 8, 0xffffff, 0.5, 0.5, 72);

      if (!isMobileMode()) {
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.focusArea = 'grid';
          this.gridFocusIdx = idx;
          this.selectSkin(avatar.id);
        });
      }

      this.gridContainer.add([bg, sprite, label]);
      this.cards.push({ id: avatar.id, bg, sprite, label });
    });

    this.pageTxt.setText(`${this.page + 1} / ${totalPages}`);
    this.prevBtn.setAlpha(this.page > 0 ? 1 : 0.45);
    this.nextBtn.setAlpha(this.page + 1 < totalPages ? 1 : 0.45);
    this.refreshSelectionVisuals();
  }

  private refreshSelectionVisuals(): void {
    const equipped = ALL_SELECTABLE_AVATARS.find((a) => a.id === this.selectedId);
    this.currentTxt.setText(equipped ? equipped.label : '');

    const showNavFocus = this.focusArea === 'nav';
    this.cards.forEach((c, idx) => {
      const isSelected = c.id === this.selectedId;
      const isFocused = this.focusArea === 'grid' && idx === this.gridFocusIdx;
      if (isFocused) {
        c.bg.setStrokeStyle(2, 0xffe066);
        c.label.setTint(0xffe066);
      } else if (isSelected) {
        c.bg.setStrokeStyle(2, 0x66ffd9);
        c.label.setTint(0x66ffd9);
      } else {
        c.bg.setStrokeStyle(1, 0x4a3b7d);
        c.label.setTint(0xffffff);
      }
    });

    this.prevBtn.setTexture(showNavFocus && this.navFocusIdx === 0 ? 'ui_btn_hover' : 'ui_btn');
    this.prevTxt.setTint(showNavFocus && this.navFocusIdx === 0 ? 0xffe066 : 0xffffff);
    this.nextBtn.setTexture(showNavFocus && this.navFocusIdx === 1 ? 'ui_btn_hover' : 'ui_btn');
    this.nextTxt.setTint(showNavFocus && this.navFocusIdx === 1 ? 0xffe066 : 0xffffff);
    this.backBtn.setTexture(showNavFocus && this.navFocusIdx === 2 ? 'ui_btn_hover' : 'ui_btn');
    this.backTxt.setTint(showNavFocus && this.navFocusIdx === 2 ? 0xffe066 : 0xffffff);
  }
}
