import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { ALL_PETS, getSavedPetId, PET_STORAGE_KEY } from '../data/pets';
import { isMobileMode, NavDir } from '../mobile/MobileInput';
import { inputSystem } from '../systems/InputSystem';

const PETS_PER_PAGE = 12; // 4 cols x 3 rows

interface PetOptionEntry {
  id: string;
  label: string;
  categoryLabel: string;
  description: string;
  scale?: number;
}

const PET_OPTIONS: PetOptionEntry[] = [
  { id: 'none', label: 'None', categoryLabel: '', description: 'No pet equipped.' },
  ...ALL_PETS.map((p) => ({
    id: p.id,
    label: p.name,
    categoryLabel: p.category.toUpperCase(),
    description: p.description,
    scale: p.scale,
  })),
];

export class PetScene extends Phaser.Scene {
  private page = 0;
  private selectedId = 'none';
  private focusArea: 'grid' | 'nav' = 'grid';
  private gridFocusIdx = 0;
  private navFocusIdx = 2; // 0: prev, 1: next, 2: back

  private gridContainer!: Phaser.GameObjects.Container;
  private cards: Array<{
    id: string;
    bg: Phaser.GameObjects.Rectangle;
    sprite?: Phaser.GameObjects.Sprite;
    label: Phaser.GameObjects.BitmapText;
  }> = [];

  private currentTxt!: Phaser.GameObjects.BitmapText;
  private descTxt!: Phaser.GameObjects.BitmapText;
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
    super({ key: 'PetScene' });
  }

  create(): void {
    this.page = 0;
    this.focusArea = 'grid';
    this.gridFocusIdx = 0;
    this.navFocusIdx = 2;

    const saved = getSavedPetId();
    this.selectedId = saved ?? 'none';
    const idx = PET_OPTIONS.findIndex((p) => p.id === this.selectedId);
    if (idx >= 0) {
      this.page = Math.floor(idx / PETS_PER_PAGE);
      this.gridFocusIdx = idx % PETS_PER_PAGE;
    }

    this.add.rectangle(180, 135, 360, 270, 0x0e0c21);

    addPixelText(this, 16, 16, 'PET BROWSER', 16, 0xf49ac1, 0, 0.5);
    this.currentTxt = addPixelText(this, 344, 16, '', 8, 0x66ffd9, 1, 0.5);

    this.add.rectangle(180, 124, 336, 176, 0x181430).setStrokeStyle(2, 0x5d4e9e);
    this.gridContainer = this.add.container(0, 0);

    this.descTxt = addPixelText(this, 180, 222, '', 8, 0xb8a1ff, 0.5, 0.5, 332);

    this.prevBtn = this.add.image(56, 248, 'ui_btn').setDisplaySize(68, 18);
    this.prevTxt = addPixelText(this, 56, 248, '< PREV', 8, 0xffffff, 0.5, 0.5);
    this.pageTxt = addPixelText(this, 134, 248, '1 / 1', 8, 0xb8a1ff, 0.5, 0.5);
    this.nextBtn = this.add.image(212, 248, 'ui_btn').setDisplaySize(68, 18);
    this.nextTxt = addPixelText(this, 212, 248, 'NEXT >', 8, 0xffffff, 0.5, 0.5);
    this.backBtn = this.add.image(306, 248, 'ui_btn').setDisplaySize(76, 18);
    this.backTxt = addPixelText(this, 306, 248, 'BACK', 8, 0xffffff, 0.5, 0.5);

    const onPrev = () => {
      if (this.page > 0) {
        SoundSystem.playSwing();
        this.page--;
        this.gridFocusIdx = 0;
        this.renderPage();
      }
    };
    const onNext = () => {
      const totalPages = Math.max(1, Math.ceil(PET_OPTIONS.length / PETS_PER_PAGE));
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
      delay: 260,
      loop: true,
      callback: () => {
        for (const c of this.cards) {
          if (c.sprite?.active) {
            const cur = Number(c.sprite.frame.name) || 0;
            c.sprite.setFrame((cur + 1) % 3);
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
        this.selectPet(card.id);
      }
    } else {
      if (this.navFocusIdx === 0) onPrev();
      else if (this.navFocusIdx === 1) onNext();
      else onBack();
    }
  }

  private selectPet(id: string): void {
    this.selectedId = id;
    try {
      localStorage.setItem(PET_STORAGE_KEY, id);
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

    const totalPages = Math.max(1, Math.ceil(PET_OPTIONS.length / PETS_PER_PAGE));
    this.page = Phaser.Math.Clamp(this.page, 0, totalPages - 1);
    const start = this.page * PETS_PER_PAGE;
    const slice = PET_OPTIONS.slice(start, start + PETS_PER_PAGE);

    slice.forEach((opt, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const cx = 57 + col * 82;
      const cy = 66 + row * 56;

      const bg = this.add.rectangle(cx, cy, 76, 50, 0x100d24).setStrokeStyle(1, 0x4a3b7d);
      let sprite: Phaser.GameObjects.Sprite | undefined;
      if (opt.id === 'none') {
        const dash = addPixelText(this, cx, cy - 8, '--', 16, 0x7e71b8, 0.5, 0.5);
        this.gridContainer.add(dash);
      } else {
        sprite = this.add.sprite(cx, cy - 8, `pet_${opt.id}`, 0).setScale(1.75 * (opt.scale ?? 1));
      }
      const label = addPixelText(this, cx, cy + 15, opt.label, 8, 0xffffff, 0.5, 0.5, 72);

      if (!isMobileMode()) {
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.focusArea = 'grid';
          this.gridFocusIdx = idx;
          this.selectPet(opt.id);
        });
      }

      this.gridContainer.add(sprite ? [bg, sprite, label] : [bg, label]);
      this.cards.push({ id: opt.id, bg, sprite, label });
    });

    this.pageTxt.setText(`${this.page + 1} / ${totalPages}`);
    this.prevBtn.setAlpha(this.page > 0 ? 1 : 0.45);
    this.nextBtn.setAlpha(this.page + 1 < totalPages ? 1 : 0.45);
    this.refreshSelectionVisuals();
  }

  private refreshSelectionVisuals(): void {
    const equipped = PET_OPTIONS.find((p) => p.id === this.selectedId);
    this.currentTxt.setText(equipped ? equipped.label : 'None');

    const focusedCard = this.focusArea === 'grid' ? this.cards[this.gridFocusIdx] : undefined;
    const descTarget = PET_OPTIONS.find((p) => p.id === (focusedCard?.id ?? this.selectedId));
    this.descTxt.setText(descTarget?.description ?? '');

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
