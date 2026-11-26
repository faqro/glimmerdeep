export type NavDir = 'up' | 'down' | 'left' | 'right';
export type VirtualButton = 'e' | 'space' | 'tab' | 'q' | 'esc' | 'prevSlot' | 'nextSlot';

export interface MobileInventorySlot {
  name: string;
  description: string;
  uses: number;
  maxUses: number;
  iconDataUrl: string;
  rarity: string;
}

export interface MobileStatusBadge {
  id: string;
  color: number;
  remainingMs: number;
}

export interface MobileHudState {
  inGame: boolean;
  activeSlot: number;
  inventory: (MobileInventorySlot | null)[];
  hp: number;
  maxHp: number;
  shield: number;
  stamina: number;
  maxStamina: number;
  shards: number;
  statusEffects: MobileStatusBadge[];
}

export function isMobileMode(): boolean {
  if (import.meta.env.VITE_MOBILE === 'true') return true;
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get('mobile') === 'true';
  }
  return false;
}

class MobileInputState {
  public moveX = 0;
  public moveY = 0;

  public dpadActive = false;
  public dpadAngle = 0;
  public dpadDirX = 0;
  public dpadDirY = 0;

  private dodgeQueued = false;
  private attackQueued = false;
  private suppressAttackUntilRelease = false;
  private suppressCombatUntilMs = 0;

  private navListeners = new Set<(dir: NavDir) => void>();
  private buttonListeners = new Set<(btn: VirtualButton) => void>();
  private selectSlotListeners = new Set<(slotIdx: number) => void>();
  private hudListeners = new Set<(state: MobileHudState) => void>();
  private hudState: MobileHudState = {
    inGame: false,
    activeSlot: 0,
    inventory: [null, null, null],
    hp: 16,
    maxHp: 16,
    shield: 0,
    stamina: 4,
    maxStamina: 4,
    shards: 0,
    statusEffects: [],
  };

  public setMove(x: number, y: number): void {
    this.moveX = x;
    this.moveY = y;
  }

  public setDpad(active: boolean, dirX: number, dirY: number): void {
    const wasActive = this.dpadActive;
    const prevDirX = this.dpadDirX;
    const prevDirY = this.dpadDirY;
    this.dpadActive = active;
    this.dpadDirX = dirX;
    this.dpadDirY = dirY;
    if (!active) {
      this.suppressAttackUntilRelease = false;
      return;
    }
    if (dirX !== 0 || dirY !== 0) {
      this.dpadAngle = Math.atan2(dirY, dirX);
      if (!this.suppressAttackUntilRelease && Date.now() >= this.suppressCombatUntilMs) {
        if (!wasActive || dirX !== prevDirX || dirY !== prevDirY) {
          this.attackQueued = true;
        }
      }
    }
  }

  public queueDodge(): void {
    if (Date.now() < this.suppressCombatUntilMs) return;
    this.dodgeQueued = true;
  }

  public consumeDodge(): boolean {
    if (Date.now() < this.suppressCombatUntilMs) {
      this.dodgeQueued = false;
      return false;
    }
    if (!this.dodgeQueued) return false;
    this.dodgeQueued = false;
    return true;
  }

  public consumeAttack(): boolean {
    if (this.suppressAttackUntilRelease || Date.now() < this.suppressCombatUntilMs) {
      this.attackQueued = false;
      return false;
    }
    if (!this.attackQueued) return false;
    this.attackQueued = false;
    return true;
  }

  public isDpadAttackActive(): boolean {
    if (this.suppressAttackUntilRelease || Date.now() < this.suppressCombatUntilMs) {
      return false;
    }
    return this.dpadActive;
  }

  public clearQueuedActions(): void {
    this.attackQueued = false;
    this.dodgeQueued = false;
    if (this.dpadActive) {
      this.suppressAttackUntilRelease = true;
    }
    this.suppressCombatUntilMs = Date.now() + 140;
  }

  public emitNav(dir: NavDir): void {
    for (const cb of this.navListeners) {
      cb(dir);
    }
  }

  public emitButton(btn: VirtualButton): void {
    if (btn === 'space') {
      this.dodgeQueued = true;
    }
    for (const cb of this.buttonListeners) {
      cb(btn);
    }
  }

  public onNav(cb: (dir: NavDir) => void): () => void {
    this.navListeners.add(cb);
    return () => {
      this.navListeners.delete(cb);
    };
  }

  public onButton(cb: (btn: VirtualButton) => void): () => void {
    this.buttonListeners.add(cb);
    return () => {
      this.buttonListeners.delete(cb);
    };
  }

  public selectSlot(slotIdx: number): void {
    for (const cb of this.selectSlotListeners) {
      cb(slotIdx);
    }
  }

  public onSelectSlot(cb: (slotIdx: number) => void): () => void {
    this.selectSlotListeners.add(cb);
    return () => {
      this.selectSlotListeners.delete(cb);
    };
  }

  public getHudState(): Readonly<MobileHudState> {
    return this.hudState;
  }

  public setHudState(patch: Partial<MobileHudState>): void {
    Object.assign(this.hudState, patch);
    for (const cb of this.hudListeners) {
      cb(this.hudState);
    }
  }

  public onHudChange(cb: (state: MobileHudState) => void): () => void {
    this.hudListeners.add(cb);
    cb(this.hudState);
    return () => {
      this.hudListeners.delete(cb);
    };
  }
}

export const mobileInput = new MobileInputState();
