export type SteamAchievementId =
  | 'ACH_FIRST_BLOOD'
  | 'ACH_BOSS_SLAYER'
  | 'ACH_FLOOR_3'
  | 'ACH_FLOOR_6'
  | 'ACH_EVERHEART_RESTORED'
  | 'ACH_SOLO_CHAMPION'
  | 'ACH_HOARDER'
  | 'ACH_LORE_SEEKER';

const ADMIN_UNLOCK_STORAGE_KEY = 'glimmerdeep_admin_unlock';

export function hasAdminMasterUnlock(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ADMIN_UNLOCK_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function grantAdminMasterUnlock(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ADMIN_UNLOCK_STORAGE_KEY, 'true');
    }
  } catch {
    // ignore storage errors
  }
}

export function isDesktopBuild(): boolean {
  if (hasAdminMasterUnlock()) return true;
  if (import.meta.env.VITE_DESKTOP === 'true') return true;
  if (typeof window !== 'undefined' && window.glimmerdeepDesktop?.isDesktop) return true;
  return false;
}

export function isSteamworksBuild(): boolean {
  if (import.meta.env.VITE_STEAMWORKS === 'true') return true;
  if (typeof window !== 'undefined' && window.glimmerdeepDesktop?.isSteamworks) return true;
  return false;
}

class SteamSystem {
  private unlocked = new Set<string>();
  private _hasAvatarDlc = false;

  public isAvatarDlcUnlocked(): boolean {
    if (hasAdminMasterUnlock()) return true;
    return isSteamworksBuild() && this._hasAvatarDlc;
  }

  public async refreshDlcStatus(): Promise<boolean> {
    if (hasAdminMasterUnlock()) {
      this._hasAvatarDlc = true;
      return true;
    }
    if (!isSteamworksBuild()) {
      this._hasAvatarDlc = false;
      return false;
    }
    try {
      this._hasAvatarDlc = Boolean(await window.glimmerdeepDesktop?.hasAvatarDlc());
    } catch {
      this._hasAvatarDlc = false;
    }
    return this._hasAvatarDlc;
  }

  public async unlockAchievement(id: SteamAchievementId): Promise<void> {
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id);
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.unlockAchievement(id);
    } catch {
      // ignore IPC errors
    }
  }

  public async submitSoloClearTime(timeMs: number): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.submitLeaderboardTime('Solo Speedrun', timeMs);
    } catch {
      // ignore IPC errors
    }
  }

  public async setStat(name: string, value: number): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.setStat(name, value);
    } catch {
      // ignore IPC errors
    }
  }
}

export const steamSystem = new SteamSystem();
