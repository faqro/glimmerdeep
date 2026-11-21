export type NavDir = 'up' | 'down' | 'left' | 'right';
export type VirtualButton = 'e' | 'space' | 'tab' | 'q' | 'esc' | 'slot1' | 'slot2' | 'slot3';

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

  private navListeners = new Set<(dir: NavDir) => void>();
  private buttonListeners = new Set<(btn: VirtualButton) => void>();

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
    if (active && (dirX !== 0 || dirY !== 0)) {
      this.dpadAngle = Math.atan2(dirY, dirX);
      if (!wasActive || dirX !== prevDirX || dirY !== prevDirY) {
        this.attackQueued = true;
      }
    }
  }

  public queueDodge(): void {
    this.dodgeQueued = true;
  }

  public consumeDodge(): boolean {
    if (!this.dodgeQueued) return false;
    this.dodgeQueued = false;
    return true;
  }

  public consumeAttack(): boolean {
    if (!this.attackQueued) return false;
    this.attackQueued = false;
    return true;
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
}

export const mobileInput = new MobileInputState();
