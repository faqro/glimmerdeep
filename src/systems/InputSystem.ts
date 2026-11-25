import { isMobileMode, mobileInput, NavDir, VirtualButton } from '../mobile/MobileInput';

export type ControlType = 'keyboard' | 'gamepad' | 'touch';
export type GamepadBrand = 'xbox' | 'playstation';
export type GamepadLayoutId = 'twin_stick' | 'bumper' | 'southpaw';

export function detectGamepadBrand(id: string): GamepadBrand {
  const lower = id.toLowerCase();
  if (
    lower.includes('playstation') ||
    lower.includes('dualsense') ||
    lower.includes('dualshock') ||
    lower.includes('sony') ||
    lower.includes('ps4') ||
    lower.includes('ps5') ||
    lower.includes('054c')
  ) {
    return 'playstation';
  }
  return 'xbox';
}

export type GameAction =
  | 'attack'
  | 'secondary'
  | 'dodge'
  | 'interact'
  | 'drop'
  | 'prevSlot'
  | 'nextSlot'
  | 'map'
  | 'pause';

export type GamepadButtonId =
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'LB'
  | 'RB'
  | 'LT'
  | 'RT'
  | 'BACK'
  | 'START';

export interface GamepadLayoutConfig {
  id: GamepadLayoutId;
  name: string;
  description: string;
  moveStick: 'left' | 'right';
  aimStick: 'right' | 'left';
  bindings: Record<GameAction, GamepadButtonId>;
  altAttack?: GamepadButtonId;
}

export const GAMEPAD_LAYOUTS: GamepadLayoutConfig[] = [
  {
    id: 'twin_stick',
    name: 'TWIN-STICK',
    description: 'L-Stick Move, R-Stick Aim, RT/X Attack',
    moveStick: 'left',
    aimStick: 'right',
    altAttack: 'X',
    bindings: {
      attack: 'RT',
      secondary: 'LT',
      dodge: 'B',
      interact: 'A',
      drop: 'Y',
      prevSlot: 'LB',
      nextSlot: 'RB',
      map: 'BACK',
      pause: 'START',
    },
  },
  {
    id: 'bumper',
    name: 'BUMPER',
    description: 'L-Stick Move, R-Stick Aim, RB/LB Atk',
    moveStick: 'left',
    aimStick: 'right',
    bindings: {
      attack: 'RB',
      secondary: 'Y',
      dodge: 'LB',
      interact: 'A',
      drop: 'X',
      prevSlot: 'LT',
      nextSlot: 'RT',
      map: 'BACK',
      pause: 'START',
    },
  },
  {
    id: 'southpaw',
    name: 'SOUTHPAW',
    description: 'R-Stick Move, L-Stick Aim, LT/X Attack',
    moveStick: 'right',
    aimStick: 'left',
    altAttack: 'X',
    bindings: {
      attack: 'LT',
      secondary: 'RT',
      dodge: 'B',
      interact: 'A',
      drop: 'Y',
      prevSlot: 'LB',
      nextSlot: 'RB',
      map: 'BACK',
      pause: 'START',
    },
  },
];

const LAYOUT_STORAGE_KEY = 'glimmerdeep_gamepad_layout';

// Standard W3C Gamepad button indices
const BTN_INDEX: Record<GamepadButtonId, number> = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
};

const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

const STICK_DEADZONE = 0.22;
const AIM_DEADZONE = 0.25;
const NAV_STICK_THRESHOLD = 0.55;
const TRIGGER_THRESHOLD = 0.35;

export interface LocalPlayerConfig {
  slotIndex: number;
  name: string;
  paletteId: string;
  inputType: 'gamepad' | 'keyboard';
  padIndex: number;
}

export const localCoopSession: {
  active: boolean;
  players: LocalPlayerConfig[];
} = {
  active: false,
  players: [],
};

interface PadState {
  id: string;
  brand: GamepadBrand;
  prevButtons: Map<number, boolean>;
  currButtons: Map<number, boolean>;
  justPressed: Set<number>;
  axes: { lx: number; ly: number; rx: number; ry: number };
  lastHNavDir: -1 | 0 | 1;
  hNavRepeatAt: number;
}

class InputSystem {
  private _controlType: ControlType = isMobileMode() ? 'touch' : 'keyboard';
  private _layoutIndex = 0;
  private _gamepadConnected = false;
  private _gamepadName = '';
  private _gamepadBrand: GamepadBrand = 'xbox';

  private padStates = new Map<number, PadState>();
  private prevButtons = new Map<number, boolean>();
  private currButtons = new Map<number, boolean>();
  private justPressed = new Set<number>();

  private axes = { lx: 0, ly: 0, rx: 0, ry: 0 };

  private lastNavDir: NavDir | null = null;
  private navRepeatAt = 0;

  private controlTypeListeners = new Set<(type: ControlType) => void>();
  private navListeners = new Set<(dir: NavDir) => void>();
  private buttonListeners = new Set<(btn: VirtualButton) => void>();

  private lastMouseX = -1;
  private lastMouseY = -1;
  private started = false;
  private rafId = 0;

  constructor() {
    this.loadLayout();
    this.setupGlobalListeners();
  }

  private loadLayout(): void {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) {
        const idx = GAMEPAD_LAYOUTS.findIndex((l) => l.id === saved);
        if (idx >= 0) this._layoutIndex = idx;
      }
    } catch {
      // ignore storage errors
    }
  }

  public get controlType(): ControlType {
    return this._controlType;
  }

  public get layout(): GamepadLayoutConfig {
    return GAMEPAD_LAYOUTS[this._layoutIndex];
  }

  public get layoutIndex(): number {
    return this._layoutIndex;
  }

  public isGamepadConnected(): boolean {
    return this._gamepadConnected;
  }

  public getGamepadName(): string {
    return this._gamepadName;
  }

  public get gamepadBrand(): GamepadBrand {
    return this._gamepadBrand;
  }

  public getPadBrand(padIndex: number): GamepadBrand {
    return this.padStates.get(padIndex)?.brand ?? 'xbox';
  }

  private setGamepadBrand(brand: GamepadBrand): void {
    if (this._gamepadBrand === brand) return;
    this._gamepadBrand = brand;
    for (const cb of this.controlTypeListeners) {
      cb(this._controlType);
    }
  }

  public setLayoutByIndex(idx: number): void {
    const len = GAMEPAD_LAYOUTS.length;
    this._layoutIndex = ((idx % len) + len) % len;
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, this.layout.id);
    } catch {
      // ignore storage errors
    }
  }

  public cycleLayout(dir: 1 | -1): void {
    this.setLayoutByIndex(this._layoutIndex + dir);
  }

  public setControlType(type: ControlType): void {
    if (this._controlType === type) return;
    this._controlType = type;
    for (const cb of this.controlTypeListeners) {
      cb(type);
    }
  }

  public onControlTypeChange(cb: (type: ControlType) => void): () => void {
    this.controlTypeListeners.add(cb);
    return () => {
      this.controlTypeListeners.delete(cb);
    };
  }

  public onNav(cb: (dir: NavDir) => void): () => void {
    const unsubMobile = mobileInput.onNav((dir) => {
      this.setControlType('touch');
      cb(dir);
    });
    this.navListeners.add(cb);
    return () => {
      unsubMobile();
      this.navListeners.delete(cb);
    };
  }

  public onButton(cb: (btn: VirtualButton) => void): () => void {
    const unsubMobile = mobileInput.onButton((btn) => {
      this.setControlType('touch');
      cb(btn);
    });
    this.buttonListeners.add(cb);
    return () => {
      unsubMobile();
      this.buttonListeners.delete(cb);
    };
  }

  private emitNav(dir: NavDir): void {
    for (const cb of this.navListeners) {
      cb(dir);
    }
  }

  private emitButton(btn: VirtualButton): void {
    for (const cb of this.buttonListeners) {
      cb(btn);
    }
  }

  private setupGlobalListeners(): void {
    if (typeof window === 'undefined' || this.started) return;
    this.started = true;

    window.addEventListener('keydown', () => {
      if (!isMobileMode()) {
        this.setControlType('keyboard');
      }
    });

    window.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'touch') {
        this.setControlType('touch');
      } else if (!isMobileMode()) {
        this.setControlType('keyboard');
      }
    });

    window.addEventListener('mousemove', (ev) => {
      if (isMobileMode()) return;
      if (this.lastMouseX >= 0) {
        const dist = Math.hypot(ev.clientX - this.lastMouseX, ev.clientY - this.lastMouseY);
        if (dist > 8) {
          this.setControlType('keyboard');
        }
      }
      this.lastMouseX = ev.clientX;
      this.lastMouseY = ev.clientY;
    });

    window.addEventListener('gamepadconnected', (ev) => {
      this._gamepadConnected = true;
      this._gamepadName = ev.gamepad?.id ?? 'Gamepad';
      this.setGamepadBrand(detectGamepadBrand(this._gamepadName));
      this.setControlType('gamepad');
    });

    window.addEventListener('gamepaddisconnected', () => {
      const pads = navigator.getGamepads?.() ?? [];
      const active = Array.from(pads).find((p) => p && p.connected);
      this._gamepadConnected = !!active;
      this._gamepadName = active?.id ?? '';
      if (!active && this._controlType === 'gamepad') {
        this.setControlType(isMobileMode() ? 'touch' : 'keyboard');
      }
    });

    const tick = () => {
      this.pollGamepad();
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  public destroy(): void {
    if (this.rafId && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private pollGamepad(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let firstPad: Gamepad | null = null;

    // Poll all connected gamepads for multi-gamepad local co-op
    for (let pIdx = 0; pIdx < pads.length; pIdx++) {
      const p = pads[pIdx];
      if (!p || !p.connected) {
        this.padStates.delete(pIdx);
        continue;
      }
      if (!firstPad) firstPad = p;

      let state = this.padStates.get(pIdx);
      if (!state) {
        state = {
          id: p.id,
          brand: detectGamepadBrand(p.id),
          prevButtons: new Map(),
          currButtons: new Map(),
          justPressed: new Set(),
          axes: { lx: 0, ly: 0, rx: 0, ry: 0 },
          lastHNavDir: 0,
          hNavRepeatAt: 0,
        };
        this.padStates.set(pIdx, state);
      }

      state.prevButtons.clear();
      for (const [k, v] of state.currButtons) {
        state.prevButtons.set(k, v);
      }
      state.currButtons.clear();
      state.justPressed.clear();

      for (let i = 0; i < p.buttons.length; i++) {
        const b = p.buttons[i];
        const down = b.pressed || b.value > TRIGGER_THRESHOLD;
        state.currButtons.set(i, down);
        if (down && !state.prevButtons.get(i)) {
          state.justPressed.add(i);
        }
      }

      const rLx = p.axes[0] ?? 0;
      const rLy = p.axes[1] ?? 0;
      const rRx = p.axes[2] ?? 0;
      const rRy = p.axes[3] ?? 0;
      state.axes.lx = Math.abs(rLx) > STICK_DEADZONE ? rLx : 0;
      state.axes.ly = Math.abs(rLy) > STICK_DEADZONE ? rLy : 0;
      state.axes.rx = Math.abs(rRx) > AIM_DEADZONE ? rRx : 0;
      state.axes.ry = Math.abs(rRy) > AIM_DEADZONE ? rRy : 0;
    }

    const pad = firstPad;

    if (!pad) {
      this._gamepadConnected = false;
      this._gamepadName = '';
      this._gamepadBrand = 'xbox';
      this.axes = { lx: 0, ly: 0, rx: 0, ry: 0 };
      this.currButtons.clear();
      this.justPressed.clear();
      return;
    }

    this._gamepadConnected = true;
    this._gamepadName = pad.id;
    this.setGamepadBrand(detectGamepadBrand(pad.id));

    // Move previous -> prevButtons
    this.prevButtons.clear();
    for (const [k, v] of this.currButtons) {
      this.prevButtons.set(k, v);
    }
    this.currButtons.clear();
    this.justPressed.clear();

    let anyInput = false;
    for (let i = 0; i < pad.buttons.length; i++) {
      const b = pad.buttons[i];
      const down = b.pressed || b.value > TRIGGER_THRESHOLD;
      this.currButtons.set(i, down);
      if (down) {
        anyInput = true;
        if (!this.prevButtons.get(i)) {
          this.justPressed.add(i);
        }
      }
    }

    const rawLx = pad.axes[0] ?? 0;
    const rawLy = pad.axes[1] ?? 0;
    const rawRx = pad.axes[2] ?? 0;
    const rawRy = pad.axes[3] ?? 0;

    this.axes.lx = Math.abs(rawLx) > STICK_DEADZONE ? rawLx : 0;
    this.axes.ly = Math.abs(rawLy) > STICK_DEADZONE ? rawLy : 0;
    this.axes.rx = Math.abs(rawRx) > AIM_DEADZONE ? rawRx : 0;
    this.axes.ry = Math.abs(rawRy) > AIM_DEADZONE ? rawRy : 0;

    if (this.axes.lx !== 0 || this.axes.ly !== 0 || this.axes.rx !== 0 || this.axes.ry !== 0) {
      anyInput = true;
    }

    if (anyInput) {
      this.setControlType('gamepad');
    }

    // Menu navigation events (D-pad or Left Stick)
    let navDir: NavDir | null = null;
    if (this.currButtons.get(DPAD_UP) || rawLy < -NAV_STICK_THRESHOLD) navDir = 'up';
    else if (this.currButtons.get(DPAD_DOWN) || rawLy > NAV_STICK_THRESHOLD) navDir = 'down';
    else if (this.currButtons.get(DPAD_LEFT) || rawLx < -NAV_STICK_THRESHOLD) navDir = 'left';
    else if (this.currButtons.get(DPAD_RIGHT) || rawLx > NAV_STICK_THRESHOLD) navDir = 'right';

    const now = performance.now();
    if (navDir) {
      if (navDir !== this.lastNavDir) {
        this.lastNavDir = navDir;
        this.navRepeatAt = now + 280;
        this.emitNav(navDir);
      } else if (now >= this.navRepeatAt) {
        this.navRepeatAt = now + 130;
        this.emitNav(navDir);
      }
    } else {
      this.lastNavDir = null;
    }

    // Menu button events
    if (this.justPressed.has(BTN_INDEX.A)) this.emitButton('e');
    if (this.justPressed.has(BTN_INDEX.B)) this.emitButton('esc');
    if (this.justPressed.has(BTN_INDEX.X)) this.emitButton('q');
    if (this.justPressed.has(BTN_INDEX.Y)) this.emitButton('tab');
    if (this.justPressed.has(BTN_INDEX.LB)) this.emitButton('prevSlot');
    if (this.justPressed.has(BTN_INDEX.RB)) this.emitButton('nextSlot');
    if (this.justPressed.has(BTN_INDEX.START)) this.emitButton('esc');
  }

  public getMoveVector(): { x: number; y: number } {
    if (!this._gamepadConnected) return { x: 0, y: 0 };
    const stick = this.layout.moveStick;
    let x = stick === 'left' ? this.axes.lx : this.axes.rx;
    let y = stick === 'left' ? this.axes.ly : this.axes.ry;

    // Also allow D-pad for movement when moveStick is left
    if (x === 0 && y === 0 && stick === 'left') {
      if (this.currButtons.get(DPAD_LEFT)) x -= 1;
      if (this.currButtons.get(DPAD_RIGHT)) x += 1;
      if (this.currButtons.get(DPAD_UP)) y -= 1;
      if (this.currButtons.get(DPAD_DOWN)) y += 1;
    }

    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    return { x, y };
  }

  public getAimVector(): { x: number; y: number; active: boolean } {
    if (!this._gamepadConnected) return { x: 0, y: 0, active: false };
    const stick = this.layout.aimStick;
    const x = stick === 'right' ? this.axes.rx : this.axes.lx;
    const y = stick === 'right' ? this.axes.ry : this.axes.ly;
    const active = Math.hypot(x, y) > 0;
    return { x, y, active };
  }

  private isButtonJustPressed(btn: GamepadButtonId): boolean {
    return this.justPressed.has(BTN_INDEX[btn]);
  }

  private isButtonDown(btn: GamepadButtonId): boolean {
    return !!this.currButtons.get(BTN_INDEX[btn]);
  }

  public consumeAction(action: GameAction): boolean {
    if (!this._gamepadConnected) return false;
    const primary = this.layout.bindings[action];
    if (this.isButtonJustPressed(primary)) return true;
    if (action === 'attack' && this.layout.altAttack && this.isButtonJustPressed(this.layout.altAttack)) {
      return true;
    }
    return false;
  }

  public isActionHeld(action: GameAction): boolean {
    if (!this._gamepadConnected) return false;
    const primary = this.layout.bindings[action];
    if (this.isButtonDown(primary)) return true;
    if (action === 'attack' && this.layout.altAttack && this.isButtonDown(this.layout.altAttack)) {
      return true;
    }
    return false;
  }

  public consumeChatButton(): boolean {
    if (!this._gamepadConnected) return false;
    // Right Stick Click (R3, index 11) opens chat in online co-op
    return this.justPressed.has(11);
  }

  public getButtonForAction(action: GameAction): GamepadButtonId {
    return this.layout.bindings[action];
  }

  // --- Multi-Gamepad Helpers for Local Co-op ---

  public consumeAnyPadJoin(excludePadIndices: Set<number>): number | null {
    for (const [pIdx, state] of this.padStates) {
      if (excludePadIndices.has(pIdx)) continue;
      if (state.justPressed.size > 0) {
        return pIdx;
      }
    }
    return null;
  }

  public getPadMoveVector(padIndex: number): { x: number; y: number } {
    const state = this.padStates.get(padIndex);
    if (!state) return { x: 0, y: 0 };
    const stick = this.layout.moveStick;
    let x = stick === 'left' ? state.axes.lx : state.axes.rx;
    let y = stick === 'left' ? state.axes.ly : state.axes.ry;

    if (x === 0 && y === 0 && stick === 'left') {
      if (state.currButtons.get(DPAD_LEFT)) x -= 1;
      if (state.currButtons.get(DPAD_RIGHT)) x += 1;
      if (state.currButtons.get(DPAD_UP)) y -= 1;
      if (state.currButtons.get(DPAD_DOWN)) y += 1;
    }

    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    return { x, y };
  }

  public getPadAimVector(padIndex: number): { x: number; y: number; active: boolean } {
    const state = this.padStates.get(padIndex);
    if (!state) return { x: 0, y: 0, active: false };
    const stick = this.layout.aimStick;
    const x = stick === 'right' ? state.axes.rx : state.axes.lx;
    const y = stick === 'right' ? state.axes.ry : state.axes.ly;
    return { x, y, active: Math.hypot(x, y) > 0 };
  }

  public consumePadAction(padIndex: number, action: GameAction): boolean {
    const state = this.padStates.get(padIndex);
    if (!state) return false;
    const primary = this.layout.bindings[action];
    if (state.justPressed.has(BTN_INDEX[primary])) return true;
    if (action === 'attack' && this.layout.altAttack && state.justPressed.has(BTN_INDEX[this.layout.altAttack])) {
      return true;
    }
    return false;
  }

  public isPadActionHeld(padIndex: number, action: GameAction): boolean {
    const state = this.padStates.get(padIndex);
    if (!state) return false;
    const primary = this.layout.bindings[action];
    if (state.currButtons.get(BTN_INDEX[primary])) return true;
    if (action === 'attack' && this.layout.altAttack && state.currButtons.get(BTN_INDEX[this.layout.altAttack])) {
      return true;
    }
    return false;
  }

  public consumePadNavHorizontal(padIndex: number): -1 | 0 | 1 {
    const state = this.padStates.get(padIndex);
    if (!state) return 0;

    let dir: -1 | 0 | 1 = 0;
    if (state.currButtons.get(DPAD_LEFT) || state.axes.lx < -NAV_STICK_THRESHOLD) dir = -1;
    else if (state.currButtons.get(DPAD_RIGHT) || state.axes.lx > NAV_STICK_THRESHOLD) dir = 1;

    if (dir === 0) {
      state.lastHNavDir = 0;
      return 0;
    }

    const now = performance.now();
    if (dir !== state.lastHNavDir) {
      state.lastHNavDir = dir;
      state.hNavRepeatAt = now + 280;
      return dir;
    }
    if (now >= state.hNavRepeatAt) {
      state.hNavRepeatAt = now + 140;
      return dir;
    }
    return 0;
  }
}

export const inputSystem = new InputSystem();
