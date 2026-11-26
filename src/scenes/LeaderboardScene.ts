import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { isMobileMode, NavDir } from '../mobile/MobileInput';
import { inputSystem } from '../systems/InputSystem';
import { steamSystem } from '../systems/SteamSystem';

type LeaderboardTab = 'Solo Speedrun' | 'Co-op Speedrun';

function formatTimeMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '--:--.--';
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export class LeaderboardScene extends Phaser.Scene {
  private activeTab: LeaderboardTab = 'Solo Speedrun';
  private focusIdx = 3; // 0: solo tab, 1: coop tab, 2: open steam, 3: back
  private loadSeq = 0;

  private soloTabBg!: Phaser.GameObjects.Image;
  private soloTabTxt!: Phaser.GameObjects.BitmapText;
  private coopTabBg!: Phaser.GameObjects.Image;
  private coopTabTxt!: Phaser.GameObjects.BitmapText;

  private bestTxt!: Phaser.GameObjects.BitmapText;
  private clearsTxt!: Phaser.GameObjects.BitmapText;
  private listContainer!: Phaser.GameObjects.Container;

  private steamBtn!: Phaser.GameObjects.Image;
  private steamTxt!: Phaser.GameObjects.BitmapText;
  private backBtn!: Phaser.GameObjects.Image;
  private backTxt!: Phaser.GameObjects.BitmapText;

  private unsubNav?: () => void;
  private unsubBtn?: () => void;

  constructor() {
    super({ key: 'LeaderboardScene' });
  }

  create(): void {
    this.activeTab = 'Solo Speedrun';
    this.focusIdx = 3;
    this.loadSeq = 0;

    this.add.rectangle(180, 135, 360, 270, 0x0e0c21);
    addPixelText(this, 180, 18, 'LEADERBOARDS', 16, 0xf49ac1, 0.5, 0.5);

    this.soloTabBg = this.add.image(108, 42, 'ui_btn').setDisplaySize(134, 18);
    this.soloTabTxt = addPixelText(this, 108, 42, 'SOLO SPEEDRUN', 8, 0xffffff, 0.5, 0.5);

    this.coopTabBg = this.add.image(252, 42, 'ui_btn').setDisplaySize(134, 18);
    this.coopTabTxt = addPixelText(this, 252, 42, 'CO-OP SPEEDRUN', 8, 0xffffff, 0.5, 0.5);

    // Personal stats bar
    this.add.rectangle(180, 68, 328, 22, 0x181430).setStrokeStyle(1, 0x5d4e9e);
    this.bestTxt = addPixelText(this, 26, 68, 'YOUR BEST: --:--.--', 8, 0x66ffd9, 0, 0.5);
    this.clearsTxt = addPixelText(this, 334, 68, 'CLEARS: 0', 8, 0xffe066, 1, 0.5);

    // Entries panel
    this.add.rectangle(180, 154, 328, 138, 0x181430).setStrokeStyle(2, 0x5d4e9e);
    this.listContainer = this.add.container(0, 0);

    // Bottom buttons
    this.steamBtn = this.add.image(124, 246, 'ui_btn').setDisplaySize(132, 18);
    this.steamTxt = addPixelText(this, 124, 246, 'OPEN IN STEAM', 8, 0x66ffd9, 0.5, 0.5);
    this.backBtn = this.add.image(274, 246, 'ui_btn').setDisplaySize(96, 18);
    this.backTxt = addPixelText(this, 274, 246, 'BACK', 8, 0xffffff, 0.5, 0.5);

    const selectTab = (tab: LeaderboardTab) => {
      if (this.activeTab === tab) return;
      SoundSystem.playSwing();
      this.activeTab = tab;
      this.refreshFocusVisuals();
      void this.fetchAndRender();
    };
    const onOpenSteam = () => {
      SoundSystem.playPickup();
      void steamSystem.openLeaderboardOverlay();
    };
    const onBack = () => {
      SoundSystem.playHit();
      this.scene.start('MenuScene');
    };

    if (!isMobileMode()) {
      this.soloTabBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => selectTab('Solo Speedrun'));
      this.coopTabBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => selectTab('Co-op Speedrun'));
      this.steamBtn.setInteractive({ useHandCursor: true }).on('pointerdown', onOpenSteam);
      this.backBtn.setInteractive({ useHandCursor: true }).on('pointerdown', onBack);

      this.input.keyboard?.on('keydown-ESC', onBack);
      this.input.keyboard?.on('keydown-LEFT', () => this.handleNav('left', selectTab));
      this.input.keyboard?.on('keydown-RIGHT', () => this.handleNav('right', selectTab));
      this.input.keyboard?.on('keydown-UP', () => this.handleNav('up', selectTab));
      this.input.keyboard?.on('keydown-DOWN', () => this.handleNav('down', selectTab));
      this.input.keyboard?.on('keydown-ENTER', () => this.activateFocused(selectTab, onOpenSteam, onBack));
    }

    this.unsubNav = inputSystem.onNav((dir) => this.handleNav(dir, selectTab));
    this.unsubBtn = inputSystem.onButton((btn) => {
      if (btn === 'esc') {
        onBack();
        return;
      }
      if (btn === 'prevSlot') {
        selectTab('Solo Speedrun');
        return;
      }
      if (btn === 'nextSlot') {
        selectTab('Co-op Speedrun');
        return;
      }
      if (btn === 'e' || btn === 'space') {
        this.activateFocused(selectTab, onOpenSteam, onBack);
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubNav?.();
      this.unsubBtn?.();
    });

    this.refreshFocusVisuals();
    void this.fetchAndRender();
  }

  private handleNav(dir: NavDir, selectTab: (tab: LeaderboardTab) => void): void {
    SoundSystem.playSwing();
    if (dir === 'left' || dir === 'right') {
      if (this.focusIdx === 0 || this.focusIdx === 1) {
        const nextTab: LeaderboardTab = this.focusIdx === 0 ? 'Co-op Speedrun' : 'Solo Speedrun';
        this.focusIdx = nextTab === 'Solo Speedrun' ? 0 : 1;
        selectTab(nextTab);
      } else {
        this.focusIdx = this.focusIdx === 2 ? 3 : 2;
      }
    } else if (dir === 'up' || dir === 'down') {
      if (this.focusIdx <= 1) {
        this.focusIdx = this.focusIdx === 0 ? 2 : 3;
      } else {
        this.focusIdx = this.activeTab === 'Solo Speedrun' ? 0 : 1;
      }
    }
    this.refreshFocusVisuals();
  }

  private activateFocused(
    selectTab: (tab: LeaderboardTab) => void,
    onOpenSteam: () => void,
    onBack: () => void
  ): void {
    if (this.focusIdx === 0) selectTab('Solo Speedrun');
    else if (this.focusIdx === 1) selectTab('Co-op Speedrun');
    else if (this.focusIdx === 2) onOpenSteam();
    else onBack();
  }

  private refreshFocusVisuals(): void {
    const soloActive = this.activeTab === 'Solo Speedrun';
    this.soloTabBg.setTexture(soloActive || this.focusIdx === 0 ? 'ui_btn_hover' : 'ui_btn');
    this.soloTabTxt.setTint(this.focusIdx === 0 ? 0xffe066 : soloActive ? 0x66ffd9 : 0xffffff);

    this.coopTabBg.setTexture(!soloActive || this.focusIdx === 1 ? 'ui_btn_hover' : 'ui_btn');
    this.coopTabTxt.setTint(this.focusIdx === 1 ? 0xffe066 : !soloActive ? 0x66ffd9 : 0xffffff);

    this.steamBtn.setTexture(this.focusIdx === 2 ? 'ui_btn_hover' : 'ui_btn');
    this.steamTxt.setTint(this.focusIdx === 2 ? 0xffe066 : 0x66ffd9);

    this.backBtn.setTexture(this.focusIdx === 3 ? 'ui_btn_hover' : 'ui_btn');
    this.backTxt.setTint(this.focusIdx === 3 ? 0xffe066 : 0xffffff);
  }

  private async fetchAndRender(): Promise<void> {
    const seq = ++this.loadSeq;
    this.listContainer.removeAll(true);
    this.listContainer.add(addPixelText(this, 180, 154, 'LOADING...', 8, 0xb8a1ff, 0.5, 0.5));

    const data = await steamSystem.getLeaderboardData(this.activeTab);
    if (seq !== this.loadSeq || !this.scene.isActive('LeaderboardScene')) return;

    this.bestTxt.setText(`YOUR BEST: ${formatTimeMs(data.bestTimeMs)}`);
    this.clearsTxt.setText(`CLEARS: ${data.clears}`);

    this.listContainer.removeAll(true);

    if (!data.available) {
      this.listContainer.add([
        addPixelText(this, 180, 144, 'STEAMWORKS UNAVAILABLE', 8, 0xf49ac1, 0.5, 0.5),
        addPixelText(this, 180, 162, 'Launch via Steam to sync leaderboards.', 8, 0xb8a1ff, 0.5, 0.5, 300),
      ]);
      return;
    }

    if (data.entries.length === 0) {
      this.listContainer.add([
        addPixelText(this, 180, 140, 'NO GLOBAL ENTRIES FETCHED', 8, 0xb8a1ff, 0.5, 0.5),
        addPixelText(
          this,
          180,
          158,
          'Clear the dungeon or click OPEN IN STEAM to view global rankings.',
          8,
          0x7e71b8,
          0.5,
          0.5,
          300
        ),
      ]);
      return;
    }

    this.listContainer.add([
      addPixelText(this, 30, 96, 'RANK', 8, 0x9d8ce0, 0, 0.5),
      addPixelText(this, 78, 96, 'PLAYER', 8, 0x9d8ce0, 0, 0.5),
      addPixelText(this, 330, 96, 'TIME', 8, 0x9d8ce0, 1, 0.5),
    ]);

    data.entries.slice(0, 8).forEach((entry, idx) => {
      const y = 112 + idx * 14;
      const color = entry.isSelf ? 0x66ffd9 : idx === 0 ? 0xffe066 : 0xffffff;
      this.listContainer.add([
        addPixelText(this, 30, y, `#${entry.rank}`, 8, color, 0, 0.5),
        addPixelText(this, 78, y, entry.name.slice(0, 18), 8, color, 0, 0.5),
        addPixelText(this, 330, y, formatTimeMs(entry.timeMs), 8, color, 1, 0.5),
      ]);
    });
  }
}
