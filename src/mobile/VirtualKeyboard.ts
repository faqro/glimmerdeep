import Phaser from 'phaser';
import { addPixelText } from '../assets/PixelFont';
import { SoundSystem } from '../audio/SoundSystem';
import { mobileInput, NavDir, VirtualButton } from './MobileInput';

export interface VirtualKeyboardOptions {
  title: string;
  initialValue: string;
  maxLength: number;
  uppercaseOnly?: boolean;
  allowSymbols?: boolean;
  onChange?: (val: string) => void;
  onEnter: (val: string) => void;
  onCancel?: () => void;
}

interface KeyDef {
  label: string;
  value: string;
  w: number;
}

const KEY_ROWS: KeyDef[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((c) => ({ label: c, value: c, w: 28 })),
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((c) => ({ label: c, value: c, w: 28 })),
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'].map((c) => ({ label: c, value: c, w: 28 })),
  [
    ...['Z', 'X', 'C', 'V', 'B', 'N', 'M', '_'].map((c) => ({ label: c, value: c, w: 28 })),
    { label: 'SPC', value: ' ', w: 58 },
  ],
  [
    { label: 'DEL', value: 'DEL', w: 66 },
    { label: 'CLR', value: 'CLR', w: 66 },
    { label: 'ENTER', value: 'ENTER', w: 94 },
    { label: 'BACK', value: 'BACK', w: 66 },
  ],
];

export class VirtualKeyboard {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private titleTxt!: Phaser.GameObjects.BitmapText;
  private valueTxt!: Phaser.GameObjects.BitmapText;
  private focusRing!: Phaser.GameObjects.Rectangle;
  private keyButtons: Array<Array<{ bg: Phaser.GameObjects.Image; txt: Phaser.GameObjects.BitmapText; x: number; y: number; w: number; def: KeyDef }>> = [];

  private row = 1;
  private col = 0;
  private value = '';
  private opts: VirtualKeyboardOptions | null = null;
  private cursorBlink = true;
  private blinkTimer?: Phaser.Time.TimerEvent;

  private domRoot: HTMLElement | null = null;
  private domTitleEl: HTMLElement | null = null;
  private domInputEl: HTMLElement | null = null;
  private domKeyButtons: HTMLButtonElement[][] = [];

  public visible = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(100).setVisible(false);
    this.domRoot = typeof document !== 'undefined' ? document.getElementById('mc-keyboard') : null;
    if (this.domRoot) {
      this.buildDom();
    } else {
      this.build();
    }
  }

  private buildDom(): void {
    if (!this.domRoot) return;
    this.domRoot.innerHTML = `
      <div class="mc-kb-header">
        <div class="mc-kb-title" id="mc-kb-title">ENTER TEXT</div>
        <div class="mc-kb-input" id="mc-kb-input">_</div>
      </div>
      <div class="mc-kb-rows">
        ${KEY_ROWS.map(
          (rowDefs, rIdx) => `
          <div class="mc-kb-row">
            ${rowDefs
              .map((def, cIdx) => {
                const cls = [
                  'mc-kb-key',
                  def.w > 40 ? 'wide' : '',
                  def.value === 'ENTER' ? 'enter' : '',
                  def.value === 'BACK' || def.value === 'DEL' ? 'danger' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return `<button class="${cls}" data-kb-r="${rIdx}" data-kb-c="${cIdx}" type="button">${def.label}</button>`;
              })
              .join('')}
          </div>
        `
        ).join('')}
      </div>
    `;

    this.domTitleEl = this.domRoot.querySelector('#mc-kb-title');
    this.domInputEl = this.domRoot.querySelector('#mc-kb-input');
    this.domKeyButtons = KEY_ROWS.map((rowDefs, rIdx) =>
      rowDefs.map((def, cIdx) => {
        const el = this.domRoot!.querySelector<HTMLButtonElement>(`[data-kb-r="${rIdx}"][data-kb-c="${cIdx}"]`)!;
        el.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          this.row = rIdx;
          this.col = cIdx;
          this.refreshFocus();
          this.activateKey(def);
        });
        return el;
      })
    );
  }

  private build(): void {
    const dim = this.scene.add.rectangle(180, 135, 360, 270, 0x0b0917, 0.85).setInteractive();
    const panel = this.scene.add.image(180, 142, 'ui_panel').setDisplaySize(336, 212);

    this.titleTxt = addPixelText(this.scene, 180, 48, 'ENTER TEXT', 8, 0xf49ac1, 0.5, 0.5);
    const inputBg = this.scene.add.rectangle(180, 68, 220, 20, 0x100d24).setStrokeStyle(1, 0xffe066);
    this.valueTxt = addPixelText(this.scene, 180, 68, '_', 8, 0xffffff, 0.5, 0.5);

    this.container.add([dim, panel, this.titleTxt, inputBg, this.valueTxt]);

    this.keyButtons = [];
    const startY = 96;
    const rowStep = 26;

    KEY_ROWS.forEach((rowDefs, rIdx) => {
      const totalWidth = rowDefs.reduce((acc, k) => acc + k.w, 0) + (rowDefs.length - 1) * 3;
      let cx = 180 - totalWidth / 2;
      const cy = startY + rIdx * rowStep;
      const rowArr: typeof this.keyButtons[number] = [];

      rowDefs.forEach((def) => {
        const kx = Math.round(cx + def.w / 2);
        const bg = this.scene.add.image(kx, cy, 'ui_btn').setDisplaySize(def.w, 20);
        const color = def.value === 'ENTER' ? 0x66ffd9 : def.value === 'BACK' || def.value === 'DEL' ? 0xf49ac1 : 0xffffff;
        const txt = addPixelText(this.scene, kx, cy, def.label, 8, color, 0.5, 0.5);
        this.container.add([bg, txt]);
        rowArr.push({ bg, txt, x: kx, y: cy, w: def.w, def });
        cx += def.w + 3;
      });

      this.keyButtons.push(rowArr);
    });

    this.focusRing = this.scene.add.rectangle(0, 0, 30, 22).setStrokeStyle(1, 0xffe066).setFillStyle(0xffe066, 0.12);
    this.container.add(this.focusRing);
  }

  public open(opts: VirtualKeyboardOptions): void {
    this.opts = opts;
    this.value = opts.initialValue;
    this.row = 1;
    this.col = 0;
    this.visible = true;

    if (this.domRoot) {
      if (this.domTitleEl) this.domTitleEl.textContent = opts.title;
      document.getElementById('mc-columns')?.classList.add('mc-hidden');
      document.getElementById('mc-stats-bar')?.classList.add('mc-hidden');
      document.getElementById('mc-inv-bar')?.classList.add('mc-hidden');
      this.domRoot.classList.remove('mc-hidden');
    } else {
      this.titleTxt.setText(opts.title);
      this.container.setVisible(true);
    }

    this.refreshDisplay();
    this.refreshFocus();

    this.blinkTimer?.remove(false);
    this.blinkTimer = this.scene.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        this.cursorBlink = !this.cursorBlink;
        this.refreshDisplay();
      },
    });
  }

  public close(): void {
    this.visible = false;
    if (this.domRoot) {
      this.domRoot.classList.add('mc-hidden');
      document.getElementById('mc-columns')?.classList.remove('mc-hidden');
      const hud = mobileInput.getHudState();
      if (hud.inGame) {
        document.getElementById('mc-stats-bar')?.classList.remove('mc-hidden');
        document.getElementById('mc-inv-bar')?.classList.remove('mc-hidden');
      }
    } else {
      this.container.setVisible(false);
    }
    this.blinkTimer?.remove(false);
    this.blinkTimer = undefined;
  }

  public destroy(): void {
    this.close();
    this.blinkTimer?.remove(false);
    this.container.destroy(true);
  }

  public handleNav(dir: NavDir): void {
    if (!this.visible) return;
    SoundSystem.playSwing();
    if (dir === 'left') {
      const len = KEY_ROWS[this.row].length;
      this.col = (this.col - 1 + len) % len;
    } else if (dir === 'right') {
      const len = KEY_ROWS[this.row].length;
      this.col = (this.col + 1) % len;
    } else if (dir === 'up') {
      const targetX = this.domRoot
        ? this.col / Math.max(1, KEY_ROWS[this.row].length - 1)
        : this.keyButtons[this.row][this.col].x;
      this.row = (this.row - 1 + KEY_ROWS.length) % KEY_ROWS.length;
      this.col = this.domRoot
        ? Math.round(targetX * Math.max(1, KEY_ROWS[this.row].length - 1))
        : this.findClosestCol(this.row, targetX);
    } else if (dir === 'down') {
      const targetX = this.domRoot
        ? this.col / Math.max(1, KEY_ROWS[this.row].length - 1)
        : this.keyButtons[this.row][this.col].x;
      this.row = (this.row + 1) % KEY_ROWS.length;
      this.col = this.domRoot
        ? Math.round(targetX * Math.max(1, KEY_ROWS[this.row].length - 1))
        : this.findClosestCol(this.row, targetX);
    }
    this.refreshFocus();
  }

  private findClosestCol(targetRow: number, targetX: number): number {
    let bestIdx = 0;
    let bestDist = Infinity;
    this.keyButtons[targetRow].forEach((b, idx) => {
      const d = Math.abs(b.x - targetX);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  public handleButton(btn: VirtualButton): void {
    if (!this.visible || !this.opts) return;
    if (btn === 'esc') {
      SoundSystem.playHit();
      const onCancel = this.opts.onCancel;
      this.close();
      onCancel?.();
      return;
    }
    if (btn === 'e' || btn === 'space') {
      const key = KEY_ROWS[this.row][this.col];
      this.activateKey(key);
    }
  }

  private activateKey(key: KeyDef): void {
    if (!this.opts) return;

    if (key.value === 'ENTER') {
      SoundSystem.playUnlock();
      const val = this.value;
      const onEnter = this.opts.onEnter;
      this.close();
      onEnter(val);
      return;
    }

    if (key.value === 'BACK') {
      SoundSystem.playHit();
      const onCancel = this.opts.onCancel;
      this.close();
      onCancel?.();
      return;
    }

    if (key.value === 'DEL') {
      if (this.value.length > 0) {
        this.value = this.value.slice(0, -1);
        SoundSystem.playSwing();
        this.opts.onChange?.(this.value);
        this.refreshDisplay();
      }
      return;
    }

    if (key.value === 'CLR') {
      this.value = '';
      SoundSystem.playSwing();
      this.opts.onChange?.(this.value);
      this.refreshDisplay();
      return;
    }

    // Character key
    if (!this.opts.allowSymbols && (key.value === ' ' || key.value === '-' || key.value === '_')) {
      SoundSystem.playHit();
      return;
    }
    if (this.value.length >= this.opts.maxLength) {
      SoundSystem.playHit();
      return;
    }

    const ch = this.opts.uppercaseOnly ? key.value.toUpperCase() : key.value;
    this.value += ch;
    SoundSystem.playPickup();
    this.opts.onChange?.(this.value);
    this.refreshDisplay();
  }

  private refreshDisplay(): void {
    const cursor = this.cursorBlink ? '_' : '';
    const text = `${this.value}${cursor}`;
    if (this.domRoot) {
      if (this.domInputEl) this.domInputEl.textContent = text;
    } else {
      this.valueTxt.setText(text);
    }
  }

  private refreshFocus(): void {
    if (this.domRoot) {
      this.domKeyButtons.forEach((rowArr, r) => {
        rowArr.forEach((el, c) => {
          el.classList.toggle('focused', r === this.row && c === this.col);
        });
      });
      return;
    }
    this.keyButtons.forEach((rowArr, r) => {
      rowArr.forEach((btn, c) => {
        const focused = r === this.row && c === this.col;
        btn.bg.setTexture(focused ? 'ui_btn_hover' : 'ui_btn');
        if (focused) {
          this.focusRing.setPosition(btn.x, btn.y).setSize(btn.w + 2, 22);
        }
      });
    });
  }
}
