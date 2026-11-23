import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { BOSSES, ENEMIES } from '../data/enemies';
import { applyRarityTextStyle, ARTIFACTS, CONSUMABLES, RARITY_ORDER, stopRarityGlow } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { isMobileMode, mobileInput, NavDir, VirtualButton } from '../mobile/MobileInput';
import { JournalSystem } from '../systems/JournalSystem';
import { ItemRarity } from '../types/game';

type JournalCategory = 'enemies' | 'bosses' | 'items';

interface JournalEntry {
  id: string;
  name: string;
  spriteKey: string;
  detail: string;
  discovered: boolean;
  isBoss?: boolean;
  rarity?: ItemRarity;
}

const ITEMS_PER_PAGE = 8; // 2 cols x 4 rows

export class JournalScene extends Phaser.Scene {
  private category: JournalCategory = 'enemies';
  private page = 0;
  private selectedIndex = 0;

  private tabButtons: Array<{ cat: JournalCategory; bg: Phaser.GameObjects.Image; txt: Phaser.GameObjects.BitmapText }> = [];
  private backBtn!: Phaser.GameObjects.Image;
  private backTxt!: Phaser.GameObjects.BitmapText;
  private prevBtn!: Phaser.GameObjects.Image;
  private prevTxt!: Phaser.GameObjects.BitmapText;
  private nextBtn!: Phaser.GameObjects.Image;
  private nextTxt!: Phaser.GameObjects.BitmapText;
  private pageTxt!: Phaser.GameObjects.BitmapText;
  private countTxt!: Phaser.GameObjects.BitmapText;

  private entryContainer!: Phaser.GameObjects.Container;
  private detailIcon?: Phaser.GameObjects.Image;
  private detailTitle!: Phaser.GameObjects.BitmapText;
  private detailDesc!: Phaser.GameObjects.BitmapText;

  private currentEntries: JournalEntry[] = [];
  private mobileArea: 'tabs' | 'grid' | 'nav' = 'tabs';
  private mobileTabIdx = 0;
  private mobileNavIdx = 0; // 0: prev, 1: next, 2: back
  private unsubNav?: () => void;
  private unsubBtn?: () => void;

  constructor() {
    super({ key: 'JournalScene' });
  }

  create(): void {
    this.category = 'enemies';
    this.page = 0;
    this.selectedIndex = 0;
    this.tabButtons = [];
    this.mobileArea = 'tabs';
    this.mobileTabIdx = 0;
    this.mobileNavIdx = 0;

    this.add.rectangle(180, 135, 360, 270, 0x0e0c21);

    addPixelText(this, 16, 16, 'LORE JOURNAL', 16, 0xf49ac1, 0, 0.5);
    this.countTxt = addPixelText(this, 344, 16, '', 8, 0x66ffd9, 1, 0.5);

    // Category tabs
    const cats: Array<{ cat: JournalCategory; label: string; x: number }> = [
      { cat: 'enemies', label: 'ENEMIES', x: 64 },
      { cat: 'bosses', label: 'BOSSES', x: 180 },
      { cat: 'items', label: 'ITEMS', x: 296 },
    ];
    for (const c of cats) {
      const bg = this.add.image(c.x, 38, 'ui_btn').setDisplaySize(104, 18);
      const txt = addPixelText(this, c.x, 38, c.label, 8, 0xffffff, 0.5, 0.5);
      if (!isMobileMode()) {
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.selectCategory(c.cat);
        });
      }
      this.tabButtons.push({ cat: c.cat, bg, txt });
    }

    // Main grid panel
    this.add.image(180, 122, 'ui_panel').setDisplaySize(336, 136);
    this.entryContainer = this.add.container(0, 0);

    // Detail panel
    this.add.image(180, 212, 'ui_panel').setDisplaySize(336, 36);
    this.detailTitle = addPixelText(this, 50, 204, '', 8, 0xffe066, 0, 0.5, 290);
    this.detailDesc = addPixelText(this, 50, 219, '', 8, 0xb8a1ff, 0, 0.5, 290);

    // Bottom navigation
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
        this.selectedIndex = this.page * ITEMS_PER_PAGE;
        this.renderEntries();
      }
    };
    const onNext = () => {
      const totalPages = Math.max(1, Math.ceil(this.currentEntries.length / ITEMS_PER_PAGE));
      if (this.page + 1 < totalPages) {
        SoundSystem.playSwing();
        this.page++;
        this.selectedIndex = this.page * ITEMS_PER_PAGE;
        this.renderEntries();
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
      this.input.keyboard?.on('keydown-LEFT', onPrev);
      this.input.keyboard?.on('keydown-RIGHT', onNext);
    } else {
      this.unsubNav = mobileInput.onNav((dir) => this.handleMobileNav(dir));
      this.unsubBtn = mobileInput.onButton((btn) => {
        if (btn === 'esc') {
          onBack();
          return;
        }
        if (btn !== 'e' && btn !== 'space') return;
        if (this.mobileArea === 'tabs') {
          this.selectCategory(this.tabButtons[this.mobileTabIdx].cat);
        } else if (this.mobileArea === 'nav') {
          if (this.mobileNavIdx === 0) onPrev();
          else if (this.mobileNavIdx === 1) onNext();
          else onBack();
        }
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unsubNav?.();
        this.unsubBtn?.();
      });
    }

    this.loadCategory();
  }

  private selectCategory(cat: JournalCategory): void {
    if (this.category === cat) return;
    SoundSystem.playPickup();
    this.category = cat;
    this.page = 0;
    this.selectedIndex = 0;
    this.loadCategory();
  }

  private buildEntriesForCategory(cat: JournalCategory): JournalEntry[] {
    let all: JournalEntry[] = [];
    let discoveredOrder: string[] = [];

    if (cat === 'enemies') {
      discoveredOrder = JournalSystem.getDiscoveredEnemies();
      const discoveredSet = new Set(discoveredOrder);
      all = Object.values(ENEMIES).map((e) => ({
        id: e.id,
        name: e.name,
        spriteKey: e.spriteKey,
        detail: `HP ${e.hp} | DMG ${e.damage} | ${e.behavior.toUpperCase()}`,
        discovered: discoveredSet.has(e.id),
      }));
    } else if (cat === 'bosses') {
      discoveredOrder = JournalSystem.getDiscoveredBosses();
      const discoveredSet = new Set(discoveredOrder);
      all = Object.values(BOSSES).map((b) => ({
        id: b.id,
        name: b.name,
        spriteKey: b.spriteKey,
        detail: `${b.subtitle} (HP ${b.hp}, DMG ${b.damage})`,
        discovered: discoveredSet.has(b.id),
        isBoss: true,
      }));
    } else {
      discoveredOrder = JournalSystem.getDiscoveredItems();
      const discoveredSet = new Set(discoveredOrder);
      const weaponEntries: JournalEntry[] = Object.values(WEAPONS).map((w) => ({
        id: w.id,
        name: w.name,
        spriteKey: w.iconKey,
        detail: `[WEAPON - ${w.rarity.toUpperCase()}] ${w.description}`,
        discovered: discoveredSet.has(w.id),
        rarity: w.rarity,
      }));
      const consumableEntries: JournalEntry[] = Object.values(CONSUMABLES).map((c) => ({
        id: c.id,
        name: c.name,
        spriteKey: c.iconKey,
        detail: `[ITEM - ${c.rarity.toUpperCase()}] ${c.description}`,
        discovered: discoveredSet.has(c.id),
        rarity: c.rarity,
      }));
      const artifactEntries: JournalEntry[] = Object.values(ARTIFACTS).map((a) => ({
        id: a.id,
        name: a.name,
        spriteKey: a.iconKey,
        detail: `[ARTIFACT - ${a.rarity.toUpperCase()}] ${a.description}`,
        discovered: discoveredSet.has(a.id),
        rarity: a.rarity,
      }));
      all = [...weaponEntries, ...consumableEntries, ...artifactEntries];
    }

    // Encountered entries first, then unencountered entries.
    // For items, sort by rarity (common -> rarer) within both encountered and unencountered groups.
    const orderMap = new Map<string, number>();
    discoveredOrder.forEach((id, idx) => orderMap.set(id, idx));

    const discovered = all
      .filter((e) => e.discovered)
      .sort((a, b) => {
        if (cat === 'items') {
          const rarityDiff = RARITY_ORDER[a.rarity ?? 'common'] - RARITY_ORDER[b.rarity ?? 'common'];
          if (rarityDiff !== 0) return rarityDiff;
        }
        return (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0);
      });
    const undiscovered = all
      .filter((e) => !e.discovered)
      .sort((a, b) => {
        if (cat === 'items') {
          return RARITY_ORDER[a.rarity ?? 'common'] - RARITY_ORDER[b.rarity ?? 'common'];
        }
        return 0;
      });

    return [...discovered, ...undiscovered];
  }

  private loadCategory(): void {
    this.currentEntries = this.buildEntriesForCategory(this.category);
    const discoveredCount = this.currentEntries.filter((e) => e.discovered).length;
    this.countTxt.setText(`${discoveredCount} / ${this.currentEntries.length}`);
    this.renderEntries();
  }

  private renderEntries(): void {
    this.entryContainer.removeAll(true);

    const totalPages = Math.max(1, Math.ceil(this.currentEntries.length / ITEMS_PER_PAGE));
    this.page = Phaser.Math.Clamp(this.page, 0, totalPages - 1);
    const start = this.page * ITEMS_PER_PAGE;
    const slice = this.currentEntries.slice(start, start + ITEMS_PER_PAGE);

    if (this.selectedIndex < start || this.selectedIndex >= start + slice.length) {
      this.selectedIndex = start;
    }

    slice.forEach((entry, idx) => {
      const globalIdx = start + idx;
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const cx = col === 0 ? 96 : 264;
      const cy = 74 + row * 31;
      const isSelected = globalIdx === this.selectedIndex;

      const cardBg = this.add
        .rectangle(cx, cy, 156, 26, isSelected ? 0x241c47 : 0x120f29)
        .setStrokeStyle(1, isSelected ? 0xffe066 : 0x4a3b7d);

      const iconX = cx - 62;
      const icon = this.add.image(iconX, cy, entry.spriteKey, 0);
      const maxDim = Math.max(icon.width, icon.height, 1);
      if (maxDim > 20) {
        icon.setScale(20 / maxDim);
      }

      if (!entry.discovered) {
        icon.setTint(0x0b0917).setAlpha(0.85);
      }

      const labelText = entry.discovered ? entry.name : '???';
      const labelColor = entry.discovered ? (isSelected ? 0xffe066 : 0xffffff) : 0x6c5bb3;
      const label = addPixelText(this, cx - 44, cy, labelText, 8, labelColor, 0, 0.5, 114);
      if (entry.rarity) {
        applyRarityTextStyle(this, label, entry.rarity);
      }

      if (!isMobileMode()) {
        cardBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          SoundSystem.playSwing();
          this.selectedIndex = globalIdx;
          this.renderEntries();
        });
      }

      this.entryContainer.add([cardBg, icon, label]);
    });

    this.pageTxt.setText(`${this.page + 1} / ${totalPages}`);
    this.prevBtn.setAlpha(this.page > 0 ? 1 : 0.45);
    this.nextBtn.setAlpha(this.page + 1 < totalPages ? 1 : 0.45);

    this.refreshDetail();
    this.refreshTabsAndFocus();
  }

  private refreshDetail(): void {
    this.detailIcon?.destroy();
    this.detailIcon = undefined;

    const entry = this.currentEntries[this.selectedIndex];
    if (!entry) {
      stopRarityGlow(this.detailTitle);
      this.detailTitle.setText('NO ENTRIES').setTint(0xffffff);
      this.detailDesc.setText('');
      return;
    }

    const icon = this.add.image(30, 212, entry.spriteKey, 0);
    const maxDim = Math.max(icon.width, icon.height, 1);
    if (maxDim > 24) {
      icon.setScale(24 / maxDim);
    }
    if (!entry.discovered) {
      icon.setTint(0x0b0917).setAlpha(0.85);
      this.detailTitle.setText('???');
      if (entry.rarity) {
        applyRarityTextStyle(this, this.detailTitle, entry.rarity);
      } else {
        stopRarityGlow(this.detailTitle);
        this.detailTitle.setTint(0x6c5bb3);
      }
      this.detailDesc.setText('Not yet encountered.').setTint(0x7e71b8);
    } else {
      this.detailTitle.setText(entry.name);
      if (entry.rarity) {
        applyRarityTextStyle(this, this.detailTitle, entry.rarity);
      } else {
        stopRarityGlow(this.detailTitle);
        this.detailTitle.setTint(0xffe066);
      }
      this.detailDesc.setText(entry.detail).setTint(0xb8a1ff);
    }
    this.detailIcon = icon;
  }

  private refreshTabsAndFocus(): void {
    this.tabButtons.forEach((tb, idx) => {
      const active = tb.cat === this.category;
      const mobileFocused = isMobileMode() && this.mobileArea === 'tabs' && this.mobileTabIdx === idx;
      tb.bg.setTexture(active || mobileFocused ? 'ui_btn_hover' : 'ui_btn');
      tb.txt.setTint(mobileFocused ? 0xffe066 : active ? 0x66ffd9 : 0xffffff);
    });

    if (isMobileMode()) {
      this.prevBtn.setTexture(this.mobileArea === 'nav' && this.mobileNavIdx === 0 ? 'ui_btn_hover' : 'ui_btn');
      this.prevTxt.setTint(this.mobileArea === 'nav' && this.mobileNavIdx === 0 ? 0xffe066 : 0xffffff);
      this.nextBtn.setTexture(this.mobileArea === 'nav' && this.mobileNavIdx === 1 ? 'ui_btn_hover' : 'ui_btn');
      this.nextTxt.setTint(this.mobileArea === 'nav' && this.mobileNavIdx === 1 ? 0xffe066 : 0xffffff);
      this.backBtn.setTexture(this.mobileArea === 'nav' && this.mobileNavIdx === 2 ? 'ui_btn_hover' : 'ui_btn');
      this.backTxt.setTint(this.mobileArea === 'nav' && this.mobileNavIdx === 2 ? 0xffe066 : 0xffffff);
    }
  }

  private handleMobileNav(dir: NavDir): void {
    SoundSystem.playSwing();
    const start = this.page * ITEMS_PER_PAGE;
    const pageCount = Math.min(ITEMS_PER_PAGE, Math.max(0, this.currentEntries.length - start));

    if (this.mobileArea === 'tabs') {
      if (dir === 'left') this.mobileTabIdx = (this.mobileTabIdx + 2) % 3;
      else if (dir === 'right') this.mobileTabIdx = (this.mobileTabIdx + 1) % 3;
      else if (dir === 'down') {
        this.mobileArea = pageCount > 0 ? 'grid' : 'nav';
      } else if (dir === 'up') {
        this.mobileArea = 'nav';
      }
    } else if (this.mobileArea === 'grid') {
      const localIdx = this.selectedIndex - start;
      const row = Math.floor(localIdx / 2);
      const totalPages = Math.max(1, Math.ceil(this.currentEntries.length / ITEMS_PER_PAGE));

      if (dir === 'right') {
        if (localIdx % 2 === 0) {
          if (localIdx + 1 < pageCount) {
            this.selectedIndex = start + localIdx + 1;
          }
        } else if (this.page + 1 < totalPages) {
          this.page++;
          const nextStart = this.page * ITEMS_PER_PAGE;
          this.selectedIndex = Math.min(nextStart + row * 2, this.currentEntries.length - 1);
        }
      } else if (dir === 'left') {
        if (localIdx % 2 === 1) {
          this.selectedIndex = start + localIdx - 1;
        } else if (this.page > 0) {
          this.page--;
          const prevStart = this.page * ITEMS_PER_PAGE;
          this.selectedIndex = Math.min(prevStart + row * 2 + 1, prevStart + ITEMS_PER_PAGE - 1);
        }
      } else if (dir === 'up') {
        if (localIdx - 2 >= 0) this.selectedIndex = start + localIdx - 2;
        else this.mobileArea = 'tabs';
      } else if (dir === 'down') {
        if (localIdx + 2 < pageCount) this.selectedIndex = start + localIdx + 2;
        else this.mobileArea = 'nav';
      }
      this.renderEntries();
      return;
    } else {
      if (dir === 'left') this.mobileNavIdx = (this.mobileNavIdx + 2) % 3;
      else if (dir === 'right') this.mobileNavIdx = (this.mobileNavIdx + 1) % 3;
      else if (dir === 'up') this.mobileArea = pageCount > 0 ? 'grid' : 'tabs';
      else if (dir === 'down') this.mobileArea = 'tabs';
    }
    this.refreshTabsAndFocus();
  }
}
