export type SteamAchievementId =
  | 'ACH_FIRST_BLOOD'
  | 'ACH_BOSS_SLAYER'
  | 'ACH_FLOOR_3'
  | 'ACH_FLOOR_6'
  | 'ACH_EVERHEART_RESTORED'
  | 'ACH_SOLO_CHAMPION'
  | 'ACH_COOP_CHAMPION'
  | 'ACH_HOARDER'
  | 'ACH_LORE_SEEKER'
  | 'ACH_ITEM_COLLECTOR'
  | 'ACH_JOURNAL_MASTER'
  | 'ACH_SECRET_ARSENAL'
  | 'ACH_PERSISTENT'
  | 'ACH_PINCUSHION'
  | 'ACH_FRUGAL'
  | 'ACH_COLD_HEARTED'
  | 'ACH_PACIFIST'
  | 'ACH_NO_HEAL'
  | 'ACH_SPEEDRUNNER';

const DEATH_COUNT_KEY = 'glimmerdeep_total_deaths';
const SPIKE_STAB_COUNT_KEY = 'glimmerdeep_spike_stabs';

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
  private _playerName: string | null = null;
  private _steamId: string | null = null;
  private _currentLobbyId: string | null = null;

  public getCachedPlayerName(): string | null {
    return this._playerName;
  }

  public getCachedSteamId(): string | null {
    return this._steamId;
  }

  public getCurrentLobbyId(): string | null {
    return this._currentLobbyId;
  }

  public async refreshSteamId(): Promise<string | null> {
    if (!isSteamworksBuild()) return null;
    try {
      const id = await window.glimmerdeepDesktop?.getSteamId();
      if (id) this._steamId = id;
    } catch {
      // ignore
    }
    return this._steamId;
  }

  public async refreshPlayerName(): Promise<string | null> {
    if (!isSteamworksBuild()) return null;
    try {
      const name = await window.glimmerdeepDesktop?.getPlayerName();
      if (name && name.trim().length > 0) {
        this._playerName = name.trim().slice(0, 12);
      }
    } catch {
      // ignore
    }
    return this._playerName;
  }

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

  public async submitCoopClearTime(timeMs: number): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.submitLeaderboardTime('Co-op Speedrun', timeMs);
    } catch {
      // ignore IPC errors
    }
  }

  public async getLeaderboardData(name: 'Solo Speedrun' | 'Co-op Speedrun'): Promise<{
    available: boolean;
    bestTimeMs: number | null;
    clears: number;
    entries: Array<{ rank: number; name: string; timeMs: number; isSelf?: boolean }>;
    appId: number | null;
  }> {
    if (!isSteamworksBuild()) {
      return { available: false, bestTimeMs: null, clears: 0, entries: [], appId: null };
    }
    try {
      const res = await window.glimmerdeepDesktop?.getLeaderboardData(name);
      if (res) return res;
    } catch {
      // ignore IPC errors
    }
    return { available: false, bestTimeMs: null, clears: 0, entries: [], appId: null };
  }

  public async openLeaderboardOverlay(): Promise<boolean> {
    if (!isSteamworksBuild()) return false;
    try {
      return Boolean(await window.glimmerdeepDesktop?.openLeaderboardOverlay());
    } catch {
      return false;
    }
  }

  public recordDeath(): void {
    let total = 0;
    try {
      total = (Number(localStorage.getItem(DEATH_COUNT_KEY)) || 0) + 1;
      localStorage.setItem(DEATH_COUNT_KEY, String(total));
    } catch {
      total = 1;
    }
    if (isSteamworksBuild()) {
      void window.glimmerdeepDesktop?.incrementStat('total_deaths', 1);
    }
    if (total >= 100) {
      void this.unlockAchievement('ACH_PERSISTENT');
    }
  }

  public recordSpikeStab(): void {
    let total = 0;
    try {
      total = (Number(localStorage.getItem(SPIKE_STAB_COUNT_KEY)) || 0) + 1;
      localStorage.setItem(SPIKE_STAB_COUNT_KEY, String(total));
    } catch {
      total = 1;
    }
    if (isSteamworksBuild()) {
      void window.glimmerdeepDesktop?.incrementStat('spike_stabs', 1);
    }
    if (total >= 50) {
      void this.unlockAchievement('ACH_PINCUSHION');
    }
  }

  public async createLobby(roomId: string, signaling = 'nostr'): Promise<string | null> {
    if (!isSteamworksBuild()) return null;
    try {
      const lobbyId = (await window.glimmerdeepDesktop?.createLobby(roomId, signaling)) ?? null;
      this._currentLobbyId = lobbyId;
      return lobbyId;
    } catch {
      return null;
    }
  }

  public async joinLobbyById(lobbyId: string): Promise<boolean> {
    if (!isSteamworksBuild() || !lobbyId) return false;
    if (this._currentLobbyId === lobbyId) return true;
    try {
      const ok = Boolean(await window.glimmerdeepDesktop?.joinLobbyById(lobbyId));
      if (ok) this._currentLobbyId = lobbyId;
      return ok;
    } catch {
      return false;
    }
  }

  public async isFriend(steamId64: string): Promise<boolean> {
    if (!isSteamworksBuild() || !steamId64) return false;
    try {
      return Boolean(await window.glimmerdeepDesktop?.isFriend(steamId64));
    } catch {
      return false;
    }
  }

  public async addFriend(steamId64: string): Promise<boolean> {
    if (!isSteamworksBuild() || !steamId64) return false;
    try {
      return Boolean(await window.glimmerdeepDesktop?.addFriend(steamId64));
    } catch {
      return false;
    }
  }

  public async updateLobbyState(state: 'lobby' | 'playing' | 'finished', joinable = true): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.updateLobbyState(state, joinable);
    } catch {
      // ignore
    }
  }

  public async openInviteDialog(): Promise<void> {
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.openInviteDialog();
    } catch {
      // ignore
    }
  }

  public async leaveLobby(): Promise<void> {
    this._currentLobbyId = null;
    if (!isSteamworksBuild()) return;
    try {
      await window.glimmerdeepDesktop?.leaveLobby();
    } catch {
      // ignore
    }
  }

  public async consumePendingInvite(): Promise<{ roomId: string; signaling?: string; lobbyId?: string } | null> {
    if (!isSteamworksBuild()) return null;
    try {
      const res = (await window.glimmerdeepDesktop?.consumePendingInvite()) ?? null;
      if (res?.lobbyId) this._currentLobbyId = res.lobbyId;
      return res;
    } catch {
      return null;
    }
  }

  public onLobbyJoinInvite(
    cb: (data: { roomId: string; signaling?: string; lobbyId?: string }) => void
  ): () => void {
    if (!isSteamworksBuild() || !window.glimmerdeepDesktop?.onLobbyJoinInvite) {
      return () => {};
    }
    return window.glimmerdeepDesktop.onLobbyJoinInvite((data) => {
      if (data?.lobbyId) this._currentLobbyId = data.lobbyId;
      cb(data);
    });
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
